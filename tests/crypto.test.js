/*
 * tests/crypto.test.js
 * ---------------------------------------------------------------------------
 * Unit tests for the passphrase encryption module (AES-GCM via Web
 * Crypto, PBKDF2 key derivation): round trip, fresh IV per
 * encryption, rejection of a wrong passphrase and of tampered data,
 * and envelope detection.
 *
 * Run with:  node --test
 */

'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { CryptoStore } = require('../js/crypto.js');

const PASSPHRASE = 'geheim-12345';
const WRONG_PASSPHRASE = 'falsch-12345';

/** Derive a session key for a fresh random salt (base64). */
async function makeSession(passphrase) {
  const salt = Buffer.from(CryptoStore.randomBytes(16)).toString('base64');

  return { key: await CryptoStore.deriveKey(passphrase, salt), salt: salt };
}

test('round trip: encrypt + decrypt restores the value', async () => {
  const value = { version: 1, kids: ['Lotte', 'Finn'], umlaut: 'Übung' };
  const session = await makeSession(PASSPHRASE);
  const envelope = await CryptoStore.encrypt(value, session.key, session.salt);

  assert.ok(CryptoStore.isEncryptedEnvelope(envelope));
  assert.deepEqual(await CryptoStore.decrypt(envelope, session.key), value);
});

test('each encryption gets a fresh IV (ciphertext never identical)', async () => {
  const value = { version: 1, kids: ['Lotte'] };
  const session = await makeSession(PASSPHRASE);
  const first = await CryptoStore.encrypt(value, session.key, session.salt);
  const second = await CryptoStore.encrypt(value, session.key, session.salt);

  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.data, second.data);
});

test('decrypt rejects a key from the wrong passphrase', async () => {
  const value = { version: 1, kids: ['Lotte'] };
  const session = await makeSession(PASSPHRASE);
  const wrongSession = await makeSession(WRONG_PASSPHRASE);
  const envelope = await CryptoStore.encrypt(value, session.key, session.salt);

  await assert.rejects(CryptoStore.decrypt(envelope, wrongSession.key));
});

test('decrypt rejects a tampered envelope', async () => {
  const value = { version: 1, kids: ['Lotte'] };
  const session = await makeSession(PASSPHRASE);
  const envelope = await CryptoStore.encrypt(value, session.key, session.salt);

  envelope.data =
    envelope.data.slice(0, -2) + (
      'A' === envelope.data.slice(-2) ? 'BB' : 'AA'
    );

  await assert.rejects(CryptoStore.decrypt(envelope, session.key));
});

test('isEncryptedEnvelope distinguishes envelopes from plain data', async () => {
  const session = await makeSession(PASSPHRASE);
  const envelope = await CryptoStore.encrypt(
    { version: 1, kids: [] },
    session.key,
    session.salt
  );

  assert.ok(CryptoStore.isEncryptedEnvelope(envelope));
  assert.ok(!CryptoStore.isEncryptedEnvelope({ version: 1, kids: [] }));
  assert.ok(!CryptoStore.isEncryptedEnvelope([]));
  assert.ok(!CryptoStore.isEncryptedEnvelope(null));
  assert.ok(!CryptoStore.isEncryptedEnvelope(undefined));
});
