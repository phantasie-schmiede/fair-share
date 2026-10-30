/*
 * js/util.js - shared utility helpers
 * ---------------------------------------------------------------------------
 * Small, dependency-free helpers used by several modules: date parsing /
 * formatting, id generation, price scaling and HTML escaping.
 *
 * Loaded first in index.html; available on the FairShare namespace as
 * FairShare.util in the browser and via module.exports in Node (tests).
 */

(function () {
  'use strict';

  /**
   * Add (or subtract) whole years from an ISO date "YYYY-MM-DD".
   *
   * A leap day (Feb 29) that does not exist in the target year is
   * clamped to Feb 28.
   *
   * @param {string} isoDate - e.g. "2026-10-30"
   * @param {number} years - e.g. 5 (or -5)
   * @returns {string} the shifted ISO date
   */
  function addYearsIso(isoDate, years) {
    const parts = isoDate.split('-').map(Number);
    const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));

    date.setUTCFullYear(parts[0] + years);

    // Feb 29 rolls over to Mar 1 in non-leap years; clamp to Feb 28.
    if (2 === parts[1] && 29 === parts[2] && 2 === date.getUTCMonth()) {
      date.setUTCMonth(1);
      date.setUTCDate(28);
    }

    return formatIsoDate(date);
  }

  /**
   * Escape a string for safe insertion into HTML.
   * (Kid names and ingredient names are user input.)
   *
   * @param {*} text
   * @returns {string}
   */
  function escapeHtml(text) {
    return String(text)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  /**
   * Format a Date object as "YYYY-MM-DD" (UTC), for use in data files.
   *
   * @param {Date} date
   * @returns {string}
   */
  function formatIsoDate(date) {
    return date.toISOString().slice(0, 10);
  }

  /**
   * Generate a short, unique-enough identifier, e.g. "k_a1b2c3".
   *
   * Ids are stable references (events point at kids by id, not by name,
   * so renames never break history).
   *
   * @param {string} prefix - "k" for kids, "e" for events
   * @returns {string}
   */
  function generateId(prefix) {
    // 24 bits of randomness is plenty for a kindergarten data file
    // (collisions stay negligible for thousands of ids).
    const random = Math.floor(Math.random() * 0x00ffffff).toString(36);

    return prefix + '_' + random;
  }

  /**
   * True when the value is a valid calendar date in "YYYY-MM-DD" format.
   * Rejects anything else, including impossible days such as
   * "2026-02-31".
   *
   * @param {*} text
   * @returns {boolean}
   */
  function isIsoDate(text) {
    if ('string' !== typeof text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      return false;
    }

    const parts = text.split('-').map(Number);
    const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));

    return (
      parts[0] === date.getUTCFullYear() &&
      parts[1] === date.getUTCMonth() + 1 &&
      parts[2] === date.getUTCDate()
    );
  }

  /**
   * Format a Date object as "YYYY-MM-DD" in the LOCAL time zone (the
   * calendar day the user actually sees on the clock).
   *
   * @param {Date} date
   * @returns {string}
   */
  function localIsoDate(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');

    return date.getFullYear() + '-' + month + '-' + day;
  }

  /**
   * Parse an ISO date string "YYYY-MM-DD" into a Date.
   *
   * Parsed as UTC so that subtracting two such dates always yields whole
   * days, independent of the user's time zone.
   *
   * @param {string} isoDate - e.g. "2026-10-30"
   * @returns {Date}
   */
  function parseIsoDate(isoDate) {
    return new Date(isoDate + 'T00:00:00Z');
  }

  /**
   * Scale a default price to a different quantity:
   *
   *   price = defaultPrice * quantity / defaultQuantity
   *
   * Rounded to two decimal places. A missing (0) quantity counts as one
   * default pack, so the default price comes back unchanged.
   *
   * @param {number} defaultPrice - the price list price of a pack
   * @param {number} defaultQuantity - the pack quantity of that entry
   * @param {number} quantity - the quantity planned for the event
   * @returns {number | null} the scaled price, or null when the entry
   *          has no usable default quantity (nothing to scale against)
   */
  function priceForQuantity(defaultPrice, defaultQuantity, quantity) {
    if (!(0 < defaultQuantity)) {
      return null;
    }

    const factor = 0 < quantity ? quantity / defaultQuantity : 1;

    return Math.round(defaultPrice * factor * 100) / 100;
  }

  /**
   * Today's date as "YYYY-MM-DD" in the local time zone.
   *
   * @returns {string}
   */
  function todayIso() {
    return localIsoDate(new Date());
  }

  const api = {
    addYearsIso: addYearsIso,
    escapeHtml: escapeHtml,
    formatIsoDate: formatIsoDate,
    generateId: generateId,
    isIsoDate: isIsoDate,
    localIsoDate: localIsoDate,
    parseIsoDate: parseIsoDate,
    priceForQuantity: priceForQuantity,
    todayIso: todayIso,
  };

  if ('undefined' !== typeof window) {
    window.FairShare = window.FairShare || {};
    window.FairShare.util = api;
  }

  if ('undefined' !== typeof module && module.exports) {
    module.exports = api;
  }
})();
