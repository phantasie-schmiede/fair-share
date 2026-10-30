/*
 * tests/storage.test.js
 * ---------------------------------------------------------------------------
 * Unit tests for the StorageManager load fallback: a corrupted linked
 * data file must not lose the IndexedDB safety copy, and the user must
 * be told (the App shows a hint via the corruptedFile flag).
 *
 * The File System Access API and IndexedDB are never touched here: the
 * file handle is faked and dbGet/dbSet are overridden per instance.
 *
 * Run with:  node --test
 */

'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { StorageManager } = require('../js/storage.js');

/** A minimal fake of a linked data file (only getFile is needed). */
function fakeHandle(content) {
  return {
    getFile: async () => new Blob([content], { type: 'application/json' }),
  };
}

/** A StorageManager with the IndexedDB layer stubbed (per instance). */
function makeManager(savedState) {
  const manager = new StorageManager({
    createFresh: () => ({ kids: [], version: 1 }),
    fromRaw: (raw) =>
      raw && 1 === raw.version
        ? { model: raw, ok: true }
        : { error: 'invalid', ok: false },
  });

  manager.dbGet = async (key) => (key === 'state' ? savedState : null);
  manager.dbSet = async () => {};

  return manager;
}

/* readDataFile --------------------------------------------------------------- */

test('readDataFile returns the state of a valid file', async () => {
  const manager = makeManager(null);
  const handle = fakeHandle(JSON.stringify({ version: 1, kids: [] }));

  const result = await manager.readDataFile(handle);

  assert.equal(result.problem, null);
  assert.deepEqual(result.state, { version: 1, kids: [] });
});

test('readDataFile reports a freshly created empty file', async () => {
  const manager = makeManager(null);

  const result = await manager.readDataFile(fakeHandle('   '));

  assert.equal(result.problem, 'empty');
  assert.equal(result.state, null);
});

test('readDataFile reports a corrupt file (broken or invalid JSON)', async () => {
  const manager = makeManager(null);

  const broken = await manager.readDataFile(fakeHandle('{ not json'));
  assert.equal(broken.problem, 'corrupt');
  assert.equal(broken.state, null);

  const rejected = await manager.readDataFile(
    fakeHandle(JSON.stringify({ version: 9 }))
  );
  assert.equal(rejected.problem, 'corrupt');
  assert.equal(rejected.state, null);
});

/* readStoredRev ---------------------------------------------------------------- */

test('readStoredRev reads the revision of a plain file', async () => {
  const manager = makeManager(null);
  manager.fileHandle = fakeHandle(
    JSON.stringify({ metadata: { rev: 4 }, version: 1 })
  );

  assert.equal(await manager.readStoredRev(), 4);
});

test('readStoredRev reads the revision of the safety copy', async () => {
  const manager = makeManager({ metadata: { rev: 2 }, version: 1 });

  assert.equal(await manager.readStoredRev(), 2);
});

test('readStoredRev falls back to the safety copy for an unreadable file', async () => {
  const manager = makeManager({ metadata: { rev: 2 }, version: 1 });
  manager.fileHandle = fakeHandle('not json');

  assert.equal(await manager.readStoredRev(), 2);
});

test('readStoredRev counts a missing counter as zero', async () => {
  const manager = makeManager(null);
  manager.fileHandle = fakeHandle(JSON.stringify({ version: 1 }));

  assert.equal(await manager.readStoredRev(), 0);
});

test('readStoredRev reads the clear revision of an encrypted file', async () => {
  const manager = makeManager(null);
  manager.fileHandle = fakeHandle(
    JSON.stringify({
      data: 'x',
      iv: 'y',
      kdf: { iterations: 210000, salt: 'z' },
      rev: 5,
      v: 1,
    })
  );

  assert.equal(await manager.readStoredRev(), 5);
});

test('readStoredRev returns null when nothing is stored', async () => {
  const manager = makeManager(null);

  assert.equal(await manager.readStoredRev(), null);
});

/* load fallback ---------------------------------------------------------------- */

test('load falls back to the safety copy and flags a corrupt file', async () => {
  const manager = makeManager({ version: 1, kids: ['saved'] });
  manager.fileHandle = fakeHandle('{ broken');

  const state = await manager.load();

  assert.deepEqual(state, { version: 1, kids: ['saved'] });
  assert.equal(manager.corruptedFile, true);
});

test('load does not flag a freshly created empty file', async () => {
  const manager = makeManager({ version: 1, kids: ['saved'] });
  manager.fileHandle = fakeHandle('');

  const state = await manager.load();

  assert.deepEqual(state, { version: 1, kids: ['saved'] });
  assert.equal(manager.corruptedFile, false);
});

test('load prefers a readable file over the safety copy', async () => {
  const manager = makeManager({ version: 1, kids: ['saved'] });
  manager.fileHandle = fakeHandle(
    JSON.stringify({ version: 1, kids: ['file'] })
  );

  const state = await manager.load();

  assert.deepEqual(state, { version: 1, kids: ['file'] });
  assert.equal(manager.corruptedFile, false);
});

test('load creates a fresh state without a file and without a copy', async () => {
  const manager = makeManager(null);

  const state = await manager.load();

  assert.deepEqual(state, { kids: [], version: 1 });
  assert.equal(manager.corruptedFile, false);
});

/* save -------------------------------------------------------------------------- */

test('save clears the corruption and file-failure flags after rewriting the file', async () => {
  const manager = makeManager({ version: 1, kids: ['saved'] });
  manager.fileHandle = {
    createWritable: async () => ({
      close: async () => {},
      write: async () => {},
    }),
  };
  manager.corruptedFile = true;
  manager.fileSaveFailed = true;

  await manager.save({ metadata: {}, version: 1 }, '2026-10-30T00:00:00.000Z');

  assert.equal(manager.corruptedFile, false);
  assert.equal(manager.fileSaveFailed, false);
});

/* encryption -------------------------------------------------------------------- */

test('load flags encrypted data and tryUnlock resolves it', async () => {
  const { CryptoStore } = require('../js/crypto.js');
  const state = { kids: ['Lotte'], version: 1 };
  const salt = Buffer.from(CryptoStore.randomBytes(16)).toString('base64');
  const envelope = await CryptoStore.encrypt(
    state,
    await CryptoStore.deriveKey('secret-12345', salt),
    salt
  );
  const manager = makeManager(envelope);

  const loaded = await manager.load();

  assert.equal(loaded, null);
  assert.equal(manager.needsUnlock, true);
  assert.equal(manager.wrongPassphrase, false);

  const failed = await manager.tryUnlock('falsch');

  assert.equal(failed, null);
  assert.equal(manager.wrongPassphrase, true);

  const unlocked = await manager.tryUnlock('secret-12345');

  assert.deepEqual(unlocked, state);
  assert.equal(manager.needsUnlock, false);
  assert.equal(manager.wrongPassphrase, false);
  assert.equal(manager.encryptionActive, true);
});

test('save writes an encrypted envelope when a key is set', async () => {
  const { CryptoStore } = require('../js/crypto.js');
  const manager = makeManager(null);
  const stored = {};

  await manager.setEncryptionKey('secret-12345');
  manager.dbSet = async (key, value) => {
    stored[key] = value;
  };

  await manager.save({ metadata: {}, version: 1 }, '2026-10-30T00:00:00.000Z');

  assert.ok(CryptoStore.isEncryptedEnvelope(stored.state));
  const decrypted = await CryptoStore.decrypt(
    stored.state,
    await CryptoStore.deriveKey('secret-12345', stored.state.kdf.salt)
  );

  assert.deepEqual(decrypted, {
    metadata: { updatedAt: '2026-10-30T00:00:00.000Z' },
    version: 1,
  });
});

test('save stamps the revision onto the envelope in the clear', async () => {
  const { CryptoStore } = require('../js/crypto.js');
  const manager = makeManager(null);
  const stored = {};

  await manager.setEncryptionKey('secret-12345');
  manager.dbSet = async (key, value) => {
    stored[key] = value;
  };

  await manager.save(
    { metadata: { rev: 3 }, version: 1 },
    '2026-10-30T00:00:00.000Z'
  );

  assert.ok(CryptoStore.isEncryptedEnvelope(stored.state));
  assert.equal(stored.state.rev, 3);
});

test('readDataFile reports an encrypted file', async () => {
  const { CryptoStore } = require('../js/crypto.js');
  const manager = makeManager(null);
  const salt = Buffer.from(CryptoStore.randomBytes(16)).toString('base64');
  const envelope = await CryptoStore.encrypt(
    { version: 1, kids: [] },
    await CryptoStore.deriveKey('secret-12345', salt),
    salt
  );

  const result = await manager.readDataFile(
    fakeHandle(JSON.stringify(envelope))
  );

  assert.equal(result.problem, 'encrypted');
  assert.equal(result.state, null);
  assert.ok(CryptoStore.isEncryptedEnvelope(result.envelope));
});

test('tryDecrypt resolves a foreign envelope without touching session state', async () => {
  const { CryptoStore } = require('../js/crypto.js');
  const manager = makeManager(null);
  const salt = Buffer.from(CryptoStore.randomBytes(16)).toString('base64');
  const envelope = await CryptoStore.encrypt(
    { version: 1, kids: ['Lotte'] },
    await CryptoStore.deriveKey('import-pass', salt),
    salt
  );

  const ok = await manager.tryDecrypt(envelope, 'import-pass');
  assert.deepEqual(ok, { version: 1, kids: ['Lotte'] });

  const failed = await manager.tryDecrypt(envelope, 'falsch');
  assert.equal(failed, null);

  assert.equal(manager.encryptionActive, false);
  assert.equal(manager.needsUnlock, false);
  assert.equal(manager.wrongPassphrase, false);
});

/* exportPayload ----------------------------------------------------------------- */

test('exportPayload returns the plain state without a key', async () => {
  const manager = makeManager(null);
  const state = { metadata: { rev: 2 }, version: 1 };

  const payload = await manager.exportPayload(state);

  assert.equal(payload, state);
});

test('exportPayload wraps the state in an envelope with a clear revision', async () => {
  const { CryptoStore } = require('../js/crypto.js');
  const manager = makeManager(null);

  await manager.setEncryptionKey('secret-12345');

  const payload = await manager.exportPayload({
    metadata: { rev: 7 },
    version: 1,
  });

  assert.ok(CryptoStore.isEncryptedEnvelope(payload));
  assert.equal(payload.rev, 7);

  const decrypted = await CryptoStore.decrypt(
    payload,
    await CryptoStore.deriveKey('secret-12345', payload.kdf.salt)
  );

  assert.deepEqual(decrypted, { metadata: { rev: 7 }, version: 1 });
});

/* file save failure -------------------------------------------------------------- */

test('save flags a failed file write, keeps the browser copy and rethrows', async () => {
  const manager = makeManager(null);
  const stored = {};

  manager.dbSet = async (key, value) => {
    stored[key] = value;
  };
  manager.fileHandle = {
    createWritable: async () => {
      throw new Error('read-only');
    },
  };

  await assert.rejects(
    manager.save({ metadata: {}, version: 1 }, '2026-10-30T00:00:00.000Z'),
    /read-only/
  );

  assert.equal(manager.fileSaveFailed, true);
  assert.equal(manager.corruptedFile, false);
  assert.ok(stored.state); // the safety copy was written first
});
