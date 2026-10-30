/*
 * js/crypto.js - passphrase encryption (AES-GCM via Web Crypto)
 * ---------------------------------------------------------------------------
 * The whole data state can be stored encrypted behind a passphrase:
 *
 *   - key derivation : PBKDF2-SHA-256 with 210 000 iterations
 *   - cipher         : AES-GCM 256, a fresh random IV per write
 *   - envelope       : { v, kdf: {iterations, salt}, iv, data } (base64)
 *
 * The derived key lives in memory only (one salt per session). The
 * passphrase itself is never stored, so a forgotten passphrase means
 * the data is lost - there is no recovery.
 *
 * A wrong passphrase and a corrupted file are cryptographically
 * indistinguishable (the AES-GCM authentication tag fails in both
 * cases). That is intentional: there is no passphrase oracle.
 *
 * Available as FairShare.CryptoStore in the browser, via
 * module.exports in Node.
 */

(function () {
  'use strict';

  /** PBKDF2 iterations (current OWASP recommendation). */
  const ITERATIONS = 210000;

  class CryptoStore {
    /** Whether the Web Crypto primitives are usable in this runtime. */
    static available() {
      return (
        'undefined' !== typeof crypto &&
        'object' === typeof crypto.subtle &&
        'function' === typeof crypto.getRandomValues
      );
    }

    /**
     * Decrypt an envelope back to the plain value. Rejects when the
     * key does not match (wrong passphrase) or the data was tampered
     * with - the two cases are intentionally indistinguishable.
     *
     * @param {object} envelope
     * @param {CryptoKey} key
     * @returns {Promise<*>} the plain value
     */
    static async decrypt(envelope, key) {
      const plaintext = await crypto.subtle.decrypt(
        { iv: CryptoStore.fromBase64(envelope.iv), name: 'AES-GCM' },
        key,
        CryptoStore.fromBase64(envelope.data)
      );

      return JSON.parse(new TextDecoder().decode(plaintext));
    }

    /**
     * Derive an AES-GCM-256 key from a passphrase (PBKDF2-SHA-256).
     * The key is not extractable: it can only encrypt and decrypt.
     *
     * @param {string} passphrase
     * @param {string} saltBase64
     * @returns {Promise<CryptoKey>}
     */
    static async deriveKey(passphrase, saltBase64) {
      const material = new TextEncoder().encode(passphrase);
      const baseKey = await crypto.subtle.importKey(
        'raw',
        material,
        'PBKDF2',
        false,
        ['deriveKey']
      );

      return crypto.subtle.deriveKey(
        {
          hash: 'SHA-256',
          iterations: ITERATIONS,
          name: 'PBKDF2',
          salt: CryptoStore.fromBase64(saltBase64),
        },
        baseKey,
        { length: 256, name: 'AES-GCM' },
        false,
        ['decrypt', 'encrypt']
      );
    }

    /**
     * Encrypt a plain value into the envelope
     * { v, kdf: {iterations, salt}, iv, data }. A fresh IV is used
     * for every call, the salt is embedded in the envelope.
     *
     * @param {*} value
     * @param {CryptoKey} key
     * @param {string} saltBase64
     * @returns {Promise<object>} the envelope
     */
    static async encrypt(value, key, saltBase64) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const plaintext = new TextEncoder().encode(
        JSON.stringify(value, null, 2)
      );
      const ciphertext = await crypto.subtle.encrypt(
        { iv: iv, name: 'AES-GCM' },
        key,
        plaintext
      );

      return {
        v: 1,
        kdf: {
          iterations: ITERATIONS,
          salt: saltBase64,
        },
        iv: CryptoStore.toBase64(iv),
        data: CryptoStore.toBase64(new Uint8Array(ciphertext)),
      };
    }

    /** Decode a base64 string into a fresh Uint8Array. */
    static fromBase64(text) {
      if ('undefined' !== typeof Buffer) {
        return new Uint8Array(Buffer.from(text, 'base64'));
      }

      const binary = atob(text);
      const bytes = new Uint8Array(binary.length);

      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      return bytes;
    }

    /**
     * True when the value is one of the app's encrypted envelopes
     * (and not a plain data file).
     */
    static isEncryptedEnvelope(value) {
      return (
        value &&
        'object' === typeof value &&
        !Array.isArray(value) &&
        1 === value.v &&
        value.kdf &&
        'number' === typeof value.kdf.iterations &&
        'string' === typeof value.kdf.salt &&
        'string' === typeof value.iv &&
        'string' === typeof value.data
      );
    }

    /** Cryptographically secure random bytes. */
    static randomBytes(length) {
      return crypto.getRandomValues(new Uint8Array(length));
    }

    /** Encode bytes as base64 (browser: btoa, Node: Buffer). */
    static toBase64(bytes) {
      if ('undefined' !== typeof Buffer) {
        return Buffer.from(bytes).toString('base64');
      }

      let binary = '';

      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }

      return btoa(binary);
    }
  }

  /* The export footer stays at the bottom by convention. */
  const api = {
    CryptoStore: CryptoStore,
  };

  if ('undefined' !== typeof window) {
    window.FairShare = window.FairShare || {};
    Object.assign(window.FairShare, api);
  }

  if ('undefined' !== typeof module && module.exports) {
    module.exports = api;
  }
})();
