/*
 * js/storage.js - the StorageManager
 * ---------------------------------------------------------------------------
 * Persistence for the app state, with two backends behind one interface:
 *
 *   - file mode    : File System Access API (Edge/Chrome). The user links
 *                    one .json file; every save writes to it. The file
 *                    handle is kept in IndexedDB, so the next start only
 *                    needs a permission click, not a new file picker.
 *   - browser mode : plain IndexedDB (Firefox, Safari and every browser
 *                    without the File System Access API).
 *
 * IndexedDB always acts as a safety copy in both modes.
 *
 * When a passphrase has been set (setEncryptionKey), the state is
 * stored as an encrypted envelope instead of plain JSON; loading
 * such a data set requires tryUnlock first (the App shows a
 * passphrase prompt in that case).
 *
 * The manager is deliberately ignorant of the data model: creating a
 * fresh state and validating imported state are INJECTED as functions,
 * so this module stays free of model imports.
 *
 * Available as FairShare.StorageManager in the browser, via
 * module.exports in Node.
 */

(function () {
  'use strict';

  const DB_NAME = 'fair-share';
  const DB_STORE = 'kv';

  /** Lazy access to the CryptoStore (window in the browser, require in Node). */
  function cryptoStore() {
    if ('undefined' !== typeof window && window.FairShare) {
      return window.FairShare.CryptoStore;
    }

    return require('./crypto.js').CryptoStore;
  }

  class StorageManager {
    /**
     * @param {object} callbacks
     * @param {() => object} callbacks.createFresh
     *        build the initial state when nothing has been saved yet
     * @param {(raw: *) => {ok: boolean, model?: object, error?: string}}
     *        callbacks.fromRaw
     *        validate a raw JSON value; must return a normalized model
     *        on success
     */
    constructor(callbacks) {
      // Build the initial state when nothing has been saved yet.
      this.createFresh = callbacks.createFresh;
      // True when the linked file was unreadable and the browser copy
      // was used instead (cleared by the next successful save).
      this.corruptedFile = false;
      // The loaded encrypted envelope (cleared by a successful unlock).
      this.encryptedEnvelope = null;
      // Session AES-GCM key (in memory only), or null when off.
      this.encryptionKey = null;
      // Base64 salt the session key was derived from.
      this.encryptionSalt = null;
      // FileSystemFileHandle of the linked file, or null.
      this.fileHandle = null;
      // Validate a raw JSON value on load/import.
      this.fromRaw = callbacks.fromRaw;
      // 'file' (capability available) | 'browser'.
      this.mode = 'browser';
      // True when the user must click "reconnect" (permission "prompt").
      this.needsFileGesture = false;
      // True when the loaded data needs a passphrase to unlock.
      this.needsUnlock = false;
      // True when a wrong passphrase was entered for an encrypted file.
      this.wrongPassphrase = false;
    }

    /** Whether Web Crypto (and thus passphrase encryption) is usable. */
    get cryptoAvailable() {
      const store = cryptoStore();

      return store && store.available();
    }

    /** Whether the data is currently stored encrypted. */
    get encryptionActive() {
      return null !== this.encryptionKey;
    }

    /** File name of the linked data file (for display), or null. */
    get fileName() {
      return this.fileHandle ? this.fileHandle.name : null;
    }

    /** Whether this browser supports the File System Access API. */
    get supportsFileSystem() {
      return (
        'undefined' !== typeof window &&
        'function' === typeof window.showOpenFilePicker
      );
    }

    /**
     * Ask the user to pick (or create) the data file.
     * Resolves to the new handle, or null when the user cancelled.
     */
    async chooseFile() {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        suggestedName: 'kita-data.json',
        types: [
          {
            accept: { 'application/json': ['.json'] },
            description: 'JSON data file',
          },
        ],
      });

      this.fileHandle = handle;
      this.needsFileGesture = false;
      await this.dbSet('fileHandle', handle);

      return handle;
    }

    /**
     * Forget the session encryption key: the next save is plain
     * JSON again (the App re-saves right away after deactivation).
     */
    clearEncryptionKey() {
      this.encryptionKey = null;
      this.encryptionSalt = null;
    }

    /** Read one value from the kv store (null when absent). */
    async dbGet(key) {
      const db = await this.openDatabase();

      return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readonly');
        const req = tx.objectStore(DB_STORE).get(key);

        req.onsuccess = () =>
          resolve(undefined === req.result ? null : req.result);
        req.onerror = () => reject(req.error);
      });
    }

    /** Write one value into the kv store. */
    async dbSet(key, value) {
      const db = await this.openDatabase();

      return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readwrite');

        tx.objectStore(DB_STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    /**
     * One-time initialization: detect the capability and restore the
     * previously linked file handle (if any).
     */
    async init() {
      // Firefox / Safari: browser storage only.
      if (!this.supportsFileSystem) {
        this.mode = 'browser';

        return;
      }

      this.mode = 'file';
      const storedHandle = await this.dbGet('fileHandle');

      if (!storedHandle) {
        return; // no file linked yet -> App shows the "choose file" banner
      }

      // The File System Access API requires a user gesture for read
      // access across sessions, so query the current permission first.
      const permission = await storedHandle.queryPermission({
        mode: 'readwrite',
      });

      if ('granted' === permission) {
        this.fileHandle = storedHandle; // auto-save works right away
      } else {
        this.needsFileGesture = true; // show the "reconnect" banner
      }
    }

    /**
     * Load the app state from the best available source:
     * 1. the linked data file (when the permission is active),
     * 2. the IndexedDB copy,
     * 3. a fresh initial state.
     *
     * When the linked file is corrupt, the browser copy (or a fresh
     * state) is used instead and `corruptedFile` is set, so the App
     * can show a hint. The flag is cleared by the next save.
     *
     * When the loaded data is encrypted, `needsUnlock` is set and
     * null is returned; the App then asks for the passphrase
     * (tryUnlock) before the state can be used.
     *
     * @returns {object|null} the (plain) state, or null when a
     *          passphrase is required
     */
    async load() {
      let stateFromFile = null;

      if (this.fileHandle) {
        const fileResult = await this.readDataFile(this.fileHandle);

        stateFromFile = fileResult.state;

        if ('corrupt' === fileResult.problem) {
          this.corruptedFile = true;
        }
        if ('encrypted' === fileResult.problem) {
          this.encryptedEnvelope = fileResult.envelope;
          this.needsUnlock = true;
        }
      }

      if (stateFromFile) {
        return stateFromFile;
      }

      const stored = await this.dbGet('state');

      if (null !== stored) {
        if (cryptoStore().isEncryptedEnvelope(stored)) {
          this.encryptedEnvelope = stored;
          this.needsUnlock = true;

          return null; // the App shows the passphrase prompt
        }
        const result = this.fromRaw(stored);

        if (result.ok) {
          return result.model.toJson ? result.model.toJson() : result.model;
        }
      }

      return this.createFresh();
    }

    /** Open (and if needed create) the IndexedDB database. */
    openDatabase() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);

        request.onupgradeneeded = (event) => {
          event.target.result.createObjectStore(DB_STORE);
        };
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = () => reject(request.error);
      });
    }

    /**
     * Read and validate the linked data file.
     * Resolves to { problem, state }: state is the validated plain
     * state or null; problem is null (ok), 'empty' (freshly created
     * file), 'encrypted' (an envelope - the caller must unlock it)
     * or 'corrupt' (present but not a valid data file - the caller
     * then keeps the IndexedDB copy).
     */
    async readDataFile(handle) {
      try {
        const file = await handle.getFile();
        const text = await file.text();

        if ('' === text.trim()) {
          return { problem: 'empty', state: null }; // freshly created file
        }

        const parsed = JSON.parse(text);

        if (cryptoStore().isEncryptedEnvelope(parsed)) {
          return { envelope: parsed, problem: 'encrypted', state: null };
        }

        const result = this.fromRaw(parsed);

        return result.ok
          ? {
              problem: null,
              state: result.model.toJson
                ? result.model.toJson()
                : result.model,
            }
          : { problem: 'corrupt', state: null };
      } catch (error) {
        console.error('Could not read the data file:', error);

        return { problem: 'corrupt', state: null };
      }
    }

    /**
     * Read the revision counter of the currently persisted state
     * (the concurrency guard's "what does storage hold right now?").
     * Resolves to the revision - 0 for states written by older app
     * versions - or null when nothing is stored. When the linked
     * file is empty or unreadable, the IndexedDB copy is used
     * instead (the same source order as load()).
     */
    async readStoredRev() {
      let persisted = null;

      if (this.fileHandle) {
        const fileResult = await this.readDataFile(this.fileHandle);

        if (fileResult.state) {
          persisted = fileResult.state;
        } else if (fileResult.envelope) {
          persisted = fileResult.envelope;
        } else {
          persisted = await this.dbGet('state');
        }
      } else {
        persisted = await this.dbGet('state');
      }

      if (null === persisted || 'object' !== typeof persisted) {
        return null;
      }

      return this.revisionOf(persisted);
    }

    /**
     * Reconnect after the permission was revoked (page reload, browser
     * start). MUST be called from a user gesture.
     *
     * @returns {Promise<boolean>} true when the file was reconnected
     */
    async reconnect() {
      const storedHandle =
        this.fileHandle || (await this.dbGet('fileHandle'));

      if (!storedHandle) {
        return false; // nothing to reconnect -> App offers the picker
      }

      const permission = await storedHandle.requestPermission({
        mode: 'readwrite',
      });

      if ('granted' === permission) {
        this.fileHandle = storedHandle;
        this.needsFileGesture = false;

        return true;
      }

      return false;
    }

    /**
     * Extract the revision counter from a persisted value (a plain
     * state or an encrypted envelope - both carry it in the clear).
     * Values from older app versions without a counter count as 0.
     */
    revisionOf(persisted) {
      const rev = cryptoStore().isEncryptedEnvelope(persisted)
        ? persisted.rev
        : persisted.metadata && persisted.metadata.rev;

      return 'number' === typeof rev && 0 <= rev && 0 === rev % 1
        ? rev
        : 0;
    }

    /**
     * Persist the current state once (IndexedDB always, the linked file
     * when present). The App debounces calls to this method.
     *
     * @param {object} state
     * @param {string} updatedAt - ISO timestamp to stamp
     */
    async save(state, updatedAt) {
      if (state.metadata) {
        state.metadata.updatedAt = updatedAt;
      }

      let payload = state;

      if (this.encryptionKey) {
        payload = await cryptoStore().encrypt(
          state,
          this.encryptionKey,
          this.encryptionSalt
        );
        // The revision stays readable outside the encryption, so the
        // concurrency guard works on encrypted data as well.
        payload.rev = state.metadata ? state.metadata.rev : 0;
      }

      await this.dbSet('state', payload);

      if (this.fileHandle) {
        const writable = await this.fileHandle.createWritable();

        await writable.write(JSON.stringify(payload, null, 2));
        await writable.close();
        // The file was rewritten - the corruption hint can go away.
        this.corruptedFile = false;
      }
    }

    /**
     * Remember the passphrase-derived session key (in memory only;
     * the passphrase itself is not stored). Every save from now on
     * is encrypted with the session salt (a fresh random IV per
     * write).
     *
     * @param {string} passphrase
     */
    async setEncryptionKey(passphrase) {
      const store = cryptoStore();
      const salt = store.toBase64(store.randomBytes(16));

      this.encryptionSalt = salt;
      this.encryptionKey = await store.deriveKey(passphrase, salt);
    }

    /**
     * Try to decrypt an arbitrary envelope (e.g. an imported file)
     * with a passphrase. Returns the plain value, or null on
     * failure (a wrong passphrase and a broken file are
     * indistinguishable). Does not touch the session state.
     *
     * @param {object} envelope
     * @param {string} passphrase
     * @returns {Promise<*>} the plain value, or null
     */
    async tryDecrypt(envelope, passphrase) {
      const store = cryptoStore();

      try {
        const key = await store.deriveKey(passphrase, envelope.kdf.salt);

        return await store.decrypt(envelope, key);
      } catch (error) {
        return null;
      }
    }

    /**
     * Try to unlock the loaded encrypted data with a passphrase.
     * On success the session key is remembered and the plain state
     * is returned; on failure `wrongPassphrase` is set and null
     * comes back. A wrong passphrase and a broken file are
     * cryptographically indistinguishable, so both get the same
     * (honest) result.
     *
     * @param {string} passphrase
     * @returns {Promise<object|null>} the plain state, or null
     */
    async tryUnlock(passphrase) {
      const store = cryptoStore();

      if (!this.encryptedEnvelope) {
        return null;
      }

      try {
        const key = await store.deriveKey(
          passphrase,
          this.encryptedEnvelope.kdf.salt
        );
        const state = await store.decrypt(this.encryptedEnvelope, key);
        const result = this.fromRaw(state);

        if (!result.ok) {
          throw new Error(result.error);
        }

        this.encryptionKey = key;
        this.encryptionSalt = this.encryptedEnvelope.kdf.salt;
        this.encryptedEnvelope = null;
        this.needsUnlock = false;
        this.wrongPassphrase = false;

        return result.model.toJson ? result.model.toJson() : result.model;
      } catch (error) {
        this.wrongPassphrase = true;

        return null;
      }
    }
  }

  /* The export footer stays at the bottom by convention. */
  const api = {
    StorageManager: StorageManager,
  };

  if ('undefined' !== typeof window) {
    window.FairShare = window.FairShare || {};
    Object.assign(window.FairShare, api);
  }

  if ('undefined' !== typeof module && module.exports) {
    module.exports = api;
  }
})();
