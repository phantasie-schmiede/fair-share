/*
 * js/i18n.js - the I18n class
 * ---------------------------------------------------------------------------
 * Translation lookup + locale-aware formatting (money, dates, weeks).
 * The catalogs themselves live in i18n/en.js and i18n/de.js
 * (window.I18N_EN / window.I18N_DE).
 *
 * Available as FairShare.I18n in the browser, via module.exports in Node.
 */

(function () {
  'use strict';

  class I18n {
    /**
     * @param {Object.<string, Object.<string, string>>} catalogs
     *        e.g. { en: {...}, de: {...} }
     * @param {string} language - "en" | "de"
     */
    constructor(catalogs, language) {
      this.catalogs = catalogs;
      this._language = this.isValidLanguage(language) ? language : 'en';
    }

    /** Format a short clock time ("14:05") for the save indicator. */
    formatClock(date) {
      return new Intl.DateTimeFormat(this.locale, {
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    }

    /** Format an ISO date ("2026-10-30") for display. */
    formatDate(isoDate) {
      const date = new Date(isoDate + 'T00:00:00Z');

      return new Intl.DateTimeFormat(this.locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(date);
    }

    /** Format an amount in EUR ("12,34 €" / "€12.34"). */
    formatMoney(amount) {
      return new Intl.NumberFormat(this.locale, {
        currency: 'EUR',
        style: 'currency',
      }).format(amount);
    }

    /**
     * Money with an explicit sign for the difference column
     * ("+4,50 €" / "−2,10 €"; "0,00 €" without a sign).
     */
    formatSignedMoney(amount) {
      const sign = 0.005 < amount ? '+' : -0.005 > amount ? '\u2212' : '';

      return sign + this.formatMoney(Math.abs(amount));
    }

    /** Format weeks with one decimal and a localized short unit. */
    formatWeeks(weeks) {
      const formatted = new Intl.NumberFormat(this.locale, {
        maximumFractionDigits: 1,
      }).format(weeks);

      return formatted + ('de' === this._language ? ' Wo.' : ' wks');
    }

    /** Whether a string names a known catalog. */
    isValidLanguage(value) {
      return Object.prototype.hasOwnProperty.call(this.catalogs, value);
    }

    /** The current UI language ("en" | "de"). */
    get language() {
      return this._language;
    }

    /** Switch the UI language (unknown values are ignored). */
    set language(value) {
      if (this.isValidLanguage(value)) {
        this._language = value;
      }
    }

    /** BCP-47 locale matching the current language (for Intl formatting). */
    get locale() {
      return 'de' === this._language ? 'de-DE' : 'en-GB';
    }

    /** Localized word for a month (used by the group rate tile). */
    monthWord() {
      return 'de' === this._language ? 'Monat' : 'month';
    }

    /**
     * Translate a key, falling back to English and finally to the key
     * itself (missing translations stay visible instead of blank).
     *
     * {placeholder} segments are replaced with values from `params`.
     *
     * @param {string} key
     * @param {Object.<string, string|number>} [params]
     * @returns {string}
     */
    t(key, params) {
      let text = this.catalogs[this._language][key];

      if (undefined === text) {
        text =
          undefined !== this.catalogs.en[key]
            ? this.catalogs.en[key]
            : key;
      }

      if (params) {
        for (const [name, value] of Object.entries(params)) {
          text = text.split('{' + name + '}').join(String(value));
        }
      }

      return text;
    }
  }

  const api = {
    I18n: I18n,
  };

  if ('undefined' !== typeof window) {
    window.FairShare = window.FairShare || {};
    Object.assign(window.FairShare, api);
  }

  if ('undefined' !== typeof module && module.exports) {
    module.exports = api;
  }
})();
