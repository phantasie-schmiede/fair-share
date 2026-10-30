/*
 * js/app.js - the App class
 * ---------------------------------------------------------------------------
 * Glue between all modules:
 *
 *   - boot:  synchronous loading state, then async storage init + load
 *   - chrome: header (title, storage indicator, language toggle), tabs,
 *             storage banner, toast container
 *   - save:  debounced (500 ms) persistence via the StorageManager
 *   - import / language toggle
 *
 * The view modules (js/views/*.js) register themselves on
 * FairShare.Views and are rendered by this class.
 */

(function () {
  'use strict';

  /** localStorage key of the UI language choice ("de" | "en"). */
  const LANG_KEY = 'fair-share.language';
  /** Tab order of the navigation (semantic, intentionally NOT alphabetical). */
  const VIEWS = ['overview', 'plan', 'kids', 'prices', 'history', 'log'];

  const CryptoStore = window.FairShare.CryptoStore;
  const DataModel = window.FairShare.DataModel;
  const DEFAULTS = window.FairShare.DEFAULTS;
  const I18n = window.FairShare.I18n;
  const StorageManager = window.FairShare.StorageManager;
  const Util = window.FairShare.util;
  const Views = window.FairShare.Views;
  const escapeHtml = Util.escapeHtml;

  class App {
    constructor() {
      const language =
        'undefined' !== typeof localStorage && localStorage.getItem(LANG_KEY)
          ? localStorage.getItem(LANG_KEY)
          : 'de';

      this.i18n = new I18n(
        { de: window.I18N_DE, en: window.I18N_EN },
        language
      );
      this.importEnvelope = null; // encrypted import awaiting a passphrase
      this.importFileName = null; // file name of the encrypted import
      this.lastSavedAt = null; // Date of the last successful save
      this.locked = false; // true while the unlock prompt is shown
      this.model = null; // set during boot
      this.planDraft = null; // planning view draft (date/title/seed/rows)
      this.saveTimer = null; // debounce handle of scheduleSave()
      this.storage = null; // set during boot
      this.view = 'overview';
    }

    /**
     * Enable encryption: derive the session key from the passphrase
     * and store the state from now on encrypted.
     */
    async activateEncryption(passphrase) {
      await this.storage.setEncryptionKey(passphrase);
      await this.doSave();
    }

    /**
     * (Re)translate the static chrome: page title, tab labels, banner
     * and storage indicator. The current view is re-rendered by the
     * caller when the language actually changed.
     */
    applyLanguage() {
      document.title = this.i18n.t('app.title');
      // The tagline shows the kindergarten name when set; the locked
      // boot branch calls applyLanguage() before the model exists.
      document.getElementById('app-tagline').textContent =
        this.model && '' !== this.model.metadata.kindergartenName
          ? this.model.metadata.kindergartenName
          : this.i18n.t('app.tagline');
      // The button shows the language to switch TO (DE <-> EN).
      document.getElementById('btn-lang').textContent =
        'de' === this.i18n.language ? 'EN' : 'DE';
      this.updateTabLabels();
      this.updateBanner();
      this.updateStorageIndicator();
    }

    /**
     * Start the app.
     *
     * The loading state is rendered SYNCHRONOUSLY so the page is never
     * blank (IndexedDB may need a moment). Storage problems never block
     * the UI: in that case the app runs in memory only.
     */
    async boot() {
      this.renderLoading();

      try {
        const manager = new StorageManager({
          createFresh: () =>
            DataModel.create(DEFAULTS.priceList, this.i18n.language).toJson(),
          fromRaw: (raw) => DataModel.fromRaw(raw),
        });

        await manager.init();
        const state = await manager.load();

        if (manager.needsUnlock) {
          // The data is encrypted: unlock before anything is shown.
          this.storage = manager;
          this.renderUnlockPrompt();
          this.applyLanguage();

          return;
        }

        const result = DataModel.fromRaw(state);

        if (!result.ok) {
          throw new Error(result.error);
        }
        this.model = result.model;
        this.storage = manager;
      } catch (error) {
        console.error('Storage unavailable, running in memory only:', error);
        this.model = DataModel.create(
          DEFAULTS.priceList,
          this.i18n.language
        );
      }

      this.buildTabs();
      this.settleLanguage();
      this.applyLanguage();
      this.renderView();
    }

    /**
     * When the user never chose a UI language explicitly, the language
     * stored in the data file (e.g. on another machine) wins.
     */
    settleLanguage() {
      if (
        'undefined' !== typeof localStorage &&
        !localStorage.getItem(LANG_KEY)
      ) {
        this.i18n.language = this.model.settings.language;
      }
    }

    /** Wire the tab navigation (labels are set by updateTabLabels()). */
    buildTabs() {
      document
        .querySelectorAll('#tab-bar .nav-link')
        .forEach(function (button) {
          button.addEventListener('click', () =>
            this.switchView(button.dataset.view)
          );
        }, this);
    }

    /**
     * Clone a saved event into a fresh planning draft: same ingredients
     * (name, quantity, unit, price), today's date, the old title and a
     * new seed. The draft is then edited like any other plan; saving
     * runs a fresh fairness assignment and appends a new event.
     */
    cloneEvent(eventId) {
      const event = this.model.eventById(eventId);

      if (!event) {
        return;
      }

      this.planDraft = {
        date: Util.todayIso(),
        rows: event.ingredients.map(function (ing) {
          return {
            autoPrice: false,
            name: ing.name,
            price: 0 === ing.price ? '' : String(ing.price),
            quantity: 0 === ing.quantity ? '' : String(ing.quantity),
            unit: ing.unit,
          };
        }),
        seed: Math.floor(Math.random() * 0x7fffffff),
        title: event.title,
      };
      this.model.logAction('event.clone', {
        title: event.title || event.date,
      });
      this.switchView('plan');
    }

    /**
     * Load a FUTURE event into the planning draft for editing: same
     * date, title, ingredients AND original seed (an unchanged plan
     * therefore keeps its assignment). Saving replaces the event in
     * place instead of appending a new one.
     */
    editEvent(eventId) {
      const event = this.model.eventById(eventId);

      if (!event) {
        return;
      }

      this.planDraft = {
        date: event.date,
        eventId: eventId,
        rows: event.ingredients.map(function (ing) {
          return {
            autoPrice: false,
            name: ing.name,
            price: 0 === ing.price ? '' : String(ing.price),
            quantity: 0 === ing.quantity ? '' : String(ing.quantity),
            unit: ing.unit,
          };
        }),
        seed: event.seed,
        title: event.title,
      };
      this.switchView('plan');
    }

    /** Abandon the encrypted import (back to the current view). */
    cancelImport() {
      this.importEnvelope = null;
      this.importFileName = null;
      this.renderView();
    }

    /**
     * Change the passphrase: derive a new session key and store the
     * state encrypted with it. The current key is enough to read the
     * data, so the old passphrase is not asked again.
     */
    async changePassphrase(passphrase) {
      await this.storage.setEncryptionKey(passphrase);
      await this.doSave();
    }

    /** Let the user pick the data file (File System Access API). */
    async chooseFile() {
      try {
        await this.storage.chooseFile();
        await this.doSave();
      } catch (error) {
        // Aborting the picker is not an error (DOMException "AbortError").
        if ('AbortError' !== error.name) {
          console.error('Choosing the data file failed:', error);
        }
      }
      this.applyLanguage();
    }

    /** Disable encryption: forget the key, store the state plain again. */
    async deactivateEncryption() {
      this.storage.clearEncryptionKey();
      await this.doSave();
    }

    /** Persist the state once (debounced by scheduleSave). */
    async doSave() {
      if (!this.storage) {
        return;
      }

      try {
        const now = new Date();
        // Concurrency guard: another tab or browser may have saved a
        // newer state since this one loaded it. The revision counter
        // in the metadata is the shared, clock-free reference.
        const storedRev = await this.storage.readStoredRev();

        if (null !== storedRev && storedRev > this.model.metadata.rev) {
          if (!window.confirm(this.i18n.t('storage.conflict'))) {
            await this.reloadState();

            return;
          }
          // The stored copy wins the counter; this save writes the
          // next revision on top of it.
          this.model.setRev(storedRev);
        }
        this.model.setRev(this.model.metadata.rev + 1);

        await this.storage.save(this.model.toJson(), now.toISOString());
        this.lastSavedAt = now;
      } catch (error) {
        console.error('Save failed:', error);
        this.showToast(this.i18n.t('storage.saveError'));
      }
      this.updateStorageIndicator();
    }

    /**
     * Read, validate and replace the data from an imported file.
     * Called from the change handler of the hidden import input.
     */
    async onImportFile(file) {
      if (this.locked) {
        return; // the data is encrypted - unlock before importing
      }
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);

        if (CryptoStore.isEncryptedEnvelope(parsed)) {
          // Encrypted import: ask for the file's passphrase.
          this.importFileName = file.name;
          this.renderImportPrompt(parsed);

          return;
        }

        const result = DataModel.fromRaw(parsed);

        if (!result.ok) {
          throw new Error(result.error);
        }

        if (!window.confirm(this.i18n.t('history.importWarn'))) {
          return;
        }

        this.model = result.model;
        this.model.logAction('data.import', { file: file.name });
        this.planDraft = null;
        this.applyLanguage();
        this.renderView();
        this.scheduleSave();
        this.showToast(this.i18n.t('history.importOk'));
      } catch (error) {
        console.error('Import failed:', error);
        this.showToast(this.i18n.t('history.importFail'));
      }
    }

    /**
     * Load the persisted state again and adopt it. Called by the
     * concurrency guard when a newer stored state exists and the
     * user chooses "reload" instead of overwriting. An encrypted
     * stored state that this session cannot read falls back to the
     * regular unlock flow.
     */
    async reloadState() {
      const state = await this.storage.load();

      if (this.storage.needsUnlock) {
        // Encrypted stored state: the regular unlock flow takes over
        // (the session key is not shared between tabs).
        this.renderUnlockPrompt();

        return;
      }
      const result = DataModel.fromRaw(state);

      if (!result.ok) {
        this.showToast(this.i18n.t('storage.saveError'));

        return;
      }
      this.model = result.model;
      this.planDraft = null;
      this.applyLanguage();
      this.renderView();
      this.showToast(this.i18n.t('storage.reloaded'));
    }

    /** Synchronous loading placeholder (the page is never blank). */
    renderLoading() {
      document.getElementById('view').innerHTML =
        '<div class="card shadow-sm"><div class="card-body py-5 text-center">' +
        '<div class="spinner-border text-primary" role="status"></div>' +
        '<p class="mb-0 mt-3 text-body-secondary">' +
        escapeHtml(this.i18n.t('loading')) +
        '</p></div></div>';
    }

    /**
     * The passphrase prompt card (shared by the boot unlock and the
     * encrypted import; the cancel button is only offered by the
     * import, where the app keeps running in the background).
     */
    passphrasePromptHtml(withCancel) {
      return `<div class="card shadow-sm">
      <div class="card-body py-5 text-center">
        <h2 class="h4 fw-semibold mb-3">🔒 ${escapeHtml(this.i18n.t('crypto.locked'))}</h2>
        <p class="text-body-secondary">${escapeHtml(this.i18n.t('crypto.unlockHint'))}</p>
        <form class="mx-auto" id="unlock-form" style="max-width: 320px">
          <input
            autocomplete="current-password"
            class="form-control mb-1"
            id="unlock-pass"
            type="password">
          <div class="form-text mb-3">${escapeHtml(this.i18n.t('crypto.passHint'))}</div>
          <div class="d-flex gap-2">
            <button
              class="btn btn-primary flex-grow-1"
              id="btn-unlock"
              type="submit">${escapeHtml(this.i18n.t('crypto.unlockButton'))}
            </button>
            ${
              withCancel
                ? `<button
              class="btn btn-outline-secondary"
              id="btn-unlock-cancel"
              type="button">${escapeHtml(this.i18n.t('common.cancel'))}
            </button>`
                : ''
            }
          </div>
        </form>
        <div
          class="alert alert-danger mt-3 mb-0"
          hidden
          id="unlock-error"></div>
      </div>
    </div>`;
    }

    /**
     * Show the passphrase prompt for an ENCRYPTED IMPORT: the app
     * keeps running in the background; the imported file is only
     * used when a correct passphrase unlocks it (or the user
     * cancels).
     */
    renderImportPrompt(envelope) {
      this.importEnvelope = envelope;
      document.getElementById('view').innerHTML =
        this.passphrasePromptHtml(true);
      document
        .getElementById('unlock-form')
        .addEventListener('submit', (event) => {
          event.preventDefault();
          this.unlockImport(document.getElementById('unlock-pass').value);
        });
      document
        .getElementById('btn-unlock-cancel')
        .addEventListener('click', () => {
          this.cancelImport();
        });
      document.getElementById('unlock-pass').focus();
    }

    /**
     * Show the passphrase prompt instead of the app (the data is
     * encrypted and the session key is not known yet). The prompt
     * stays until a correct passphrase unlocks the data.
     */
    renderUnlockPrompt() {
      this.locked = true;
      document.getElementById('view').innerHTML =
        this.passphrasePromptHtml(false);
      document
        .getElementById('unlock-form')
        .addEventListener('submit', (event) => {
          event.preventDefault();
          this.unlockWithPassphrase(
            document.getElementById('unlock-pass').value
          );
        });
      document.getElementById('unlock-pass').focus();
    }

    /**
     * Try the entered passphrase for the encrypted IMPORT file. On
     * success the data replaces the current model (with the usual
     * confirmation); on failure the prompt stays. The passphrase is
     * only used to read the file - the app's own encryption setting
     * is not changed by an import.
     */
    async unlockImport(passphrase) {
      const raw = await this.storage.tryDecrypt(
        this.importEnvelope,
        passphrase
      );
      const errorBox = document.getElementById('unlock-error');
      const input = document.getElementById('unlock-pass');

      if (null === raw) {
        if (errorBox) {
          errorBox.hidden = false;
          errorBox.textContent = this.i18n.t('crypto.unlockError');
        }
        if (input) {
          input.value = '';
          input.focus();
        }

        return;
      }

      const result = DataModel.fromRaw(raw);

      if (!result.ok) {
        this.cancelImport();
        this.showToast(this.i18n.t('history.importFail'));

        return;
      }
      if (!window.confirm(this.i18n.t('history.importWarn'))) {
        this.cancelImport();

        return;
      }

      this.model = result.model;
      this.model.logAction('data.import', { file: this.importFileName });
      this.importEnvelope = null;
      this.importFileName = null;
      this.planDraft = null;
      this.applyLanguage();
      this.renderView();
      this.scheduleSave();
      this.showToast(this.i18n.t('history.importOk'));
    }

    /**
     * Try the entered passphrase for the encrypted data. On success
     * the app boots like after a plain load; on failure the prompt
     * stays (the input is cleared and an error message is shown).
     */
    async unlockWithPassphrase(passphrase) {
      const state = await this.storage.tryUnlock(passphrase);
      const errorBox = document.getElementById('unlock-error');
      const input = document.getElementById('unlock-pass');

      if (!state) {
        if (errorBox) {
          errorBox.hidden = false;
          errorBox.textContent = this.i18n.t('crypto.unlockError');
        }
        if (input) {
          input.value = '';
          input.focus();
        }

        return;
      }

      const result = DataModel.fromRaw(state);

      if (!result.ok) {
        // Unreachable (tryUnlock already validated) - stay locked.
        if (errorBox) {
          errorBox.hidden = false;
          errorBox.textContent = this.i18n.t('crypto.unlockError');
        }

        return;
      }

      this.model = result.model;
      this.locked = false;
      this.buildTabs();
      this.settleLanguage();
      this.applyLanguage();
      this.renderView();
    }

    /** Render the current view into #view. */
    renderView() {
      Views[this.view].render(this);
    }

    /** Debounced save: at most one write per 500 ms of activity. */
    scheduleSave() {
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
      }

      this.saveTimer = setTimeout(() => {
        this.saveTimer = null;
        this.doSave();
      }, 500);
    }

    /** Show a small Bootstrap toast (bottom center, auto-hides). */
    showToast(message) {
      const container = document.getElementById('toast-container');
      const element = document.createElement('div');

      element.className =
        'toast align-items-center border-0 bottom-0 position-fixed start-50 text-bg-dark translate-middle-x';
      element.innerHTML =
        '<div class="toast-body">' + escapeHtml(message) + '</div>';
      container.appendChild(element);
      new bootstrap.Toast(element, { delay: 2500 }).show();
      element.addEventListener('hidden.bs.toast', function () {
        element.remove();
      });
    }

    /** Switch the active tab and render its view. */
    switchView(name) {
      if (this.locked) {
        return; // the data is encrypted - nothing to show yet
      }
      if (-1 === VIEWS.indexOf(name)) {
        return;
      }

      this.view = name;
      document
        .querySelectorAll('#tab-bar .nav-link')
        .forEach(function (button) {
          button.classList.toggle('active', button.dataset.view === name);
        });
      this.renderView();
    }

    /** Switch between German and English (persisted in localStorage). */
    toggleLanguage() {
      if (this.locked) {
        return; // the data is encrypted - unlock first
      }
      const next = 'de' === this.i18n.language ? 'en' : 'de';
      const prev = this.i18n.language;

      this.i18n.language = next;

      if (this.model) {
        this.model.settings.language = next;
        this.model.logAction('language.change', { from: prev, to: next });
      }
      if ('undefined' !== typeof localStorage) {
        localStorage.setItem(LANG_KEY, next);
      }
      this.applyLanguage();
      this.renderView();
      this.scheduleSave();
    }

    /** Open the file picker for data import (hidden input). */
    triggerImport() {
      document.getElementById('import-input').click();
    }

    /**
     * Show / hide the storage banner depending on the mode:
     *   - no storage        : danger banner (in-memory only)
     *   - browser mode      : info about the missing file support
     *   - file mode, save failed : the browser copy is newer than the file
     *   - file mode, linked : nothing
     *   - file mode, paused : "reconnect" call to action
     */
    updateBanner() {
      const banner = document.getElementById('storage-banner');
      const fileButton = document.getElementById('btn-file-action');

      banner.classList.add('d-none');
      fileButton.classList.add('d-none');

      if (!this.storage) {
        // In-memory only (storage init failed): explain it.
        banner.classList.replace('alert-warning', 'alert-danger');
        banner.textContent = this.i18n.t('storage.saveError');
        banner.classList.remove('d-none');
        return;
      }

      banner.classList.replace('alert-danger', 'alert-warning');

      if ('browser' === this.storage.mode) {
        banner.innerHTML =
          '<strong>' +
          escapeHtml(this.i18n.t('storage.banner.browserTitle')) +
          '</strong><br>' +
          escapeHtml(this.i18n.t('storage.banner.browserText'));
        banner.classList.remove('d-none');
        return;
      }

      if (this.storage.fileHandle) {
        if (this.storage.fileSaveFailed) {
          banner.innerHTML =
            '<strong>' +
            escapeHtml(this.i18n.t('storage.banner.fileFailTitle')) +
            '</strong><br>' +
            escapeHtml(this.i18n.t('storage.banner.fileFailText'));
          banner.classList.remove('d-none');
        } else if (this.storage.corruptedFile) {
          banner.innerHTML =
            '<strong>' +
            escapeHtml(this.i18n.t('storage.banner.corruptTitle')) +
            '</strong><br>' +
            escapeHtml(this.i18n.t('storage.banner.corruptText'));
          banner.classList.remove('d-none');
        }

        return; // everything connected - no banner
      }

      if (this.storage.needsFileGesture) {
        banner.innerHTML =
          '<strong>' +
          escapeHtml(this.i18n.t('storage.banner.reconnectTitle')) +
          '</strong><br>' +
          escapeHtml(this.i18n.t('storage.banner.reconnectText'));
        fileButton.textContent = this.i18n.t('storage.banner.reconnectButton');
        fileButton.onclick = async () => {
          await this.reconnectFile();
        };
      } else {
        banner.innerHTML =
          '<strong>' +
          escapeHtml(this.i18n.t('storage.banner.chooseTitle')) +
          '</strong><br>' +
          escapeHtml(this.i18n.t('storage.banner.chooseText'));
        fileButton.textContent = this.i18n.t('storage.banner.chooseButton');
        fileButton.onclick = async () => {
          await this.chooseFile();
        };
      }
      banner.classList.remove('d-none');
      fileButton.classList.remove('d-none');
    }

    /** Reconnect the previously linked file (needs a user gesture). */
    async reconnectFile() {
      const reconnected = await this.storage.reconnect();

      if (reconnected) {
        await this.doSave();
      }
      this.applyLanguage();
    }

    /** Translate the tab labels into the current language. */
    updateTabLabels() {
      document
        .querySelectorAll('#tab-bar .nav-link')
        .forEach(function (button) {
          button.textContent = this.i18n.t('nav.' + button.dataset.view);
        }, this);
    }

    /** Update the small storage indicator badge in the header. */
    updateStorageIndicator() {
      const indicator = document.getElementById('storage-indicator');
      let modeText;

      if (this.storage && this.storage.fileHandle) {
        modeText = this.i18n.t('storage.fileLinked', {
          name: this.storage.fileName,
        });
      } else {
        modeText = this.i18n.t('storage.browserMode');
      }

      const savedText = this.lastSavedAt
        ? this.i18n.t('storage.savedAt', {
            time: this.i18n.formatClock(this.lastSavedAt),
          })
        : this.i18n.t('storage.neverSaved');
      const lockPrefix =
        this.storage && this.storage.encryptionActive ? '🔒 ' : '';

      indicator.textContent = lockPrefix + modeText + ' · ' + savedText;
    }
  }

  /* The single app instance: boot on load. */
  const app = new App();

  app
    .boot()
    .then(function () {
      // Header + import wiring (available after boot, once the language
      // of the loaded data file is settled).
      document
        .getElementById('btn-lang')
        .addEventListener('click', () => app.toggleLanguage());
      document
        .getElementById('import-input')
        .addEventListener('change', function (event) {
          const file = event.target.files && event.target.files[0];

          if (file) {
            app.onImportFile(file);
          }
          event.target.value = ''; // allow re-importing the same file
        });
    });
})();
