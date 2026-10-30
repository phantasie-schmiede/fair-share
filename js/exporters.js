/*
 * js/exporters.js - the Exporter
 * ---------------------------------------------------------------------------
 * Getting data OUT of the app:
 *
 *   - JSON export  : the complete app state (used for backup and for
 *                    moving the data to another device)
 *   - sharing      : OS share sheet (Android Chrome, iOS Safari, desktop
 *                    Windows) so the file can be attached to an e-mail or
 *                    messenger message directly; falls back to a plain
 *                    download when sharing is unavailable (Firefox, ...)
 *   - CSV export   : the flat history table, Excel/LibreOffice friendly
 *
 * Static by design (no state of its own): model + i18n are passed in.
 *
 * Available as FairShare.Exporter in the browser, via module.exports
 * in Node (tests).
 */

(function () {
  'use strict';

  const Util =
    'undefined' !== typeof window && window.FairShare
      ? window.FairShare.util
      : require('./util.js');

  class Exporter {
    /**
     * Build the flat history CSV (one row per ingredient of one event),
     * oldest event first.
     *
     * The file is semicolon-separated and starts with a UTF-8 BOM,
     * which makes it open correctly in German Excel/LibreOffice
     * out of the box.
     *
     * @param {object} state  - plain state
     * @param {string[]} headers - localized column names
     * @param {string[]} [eventIds] - when given (and not empty), only
     *        the events with one of these ids are exported; nothing
     *        selected means all events
     * @returns {string} the complete CSV text
     */
    static buildHistoryCsv(state, headers, eventIds) {
      // Children lookup by id for the "child" column.
      const kidNames = {};
      for (const kid of state.kids) {
        kidNames[kid.id] = kid.name;
      }

      const lines = [headers.map(Exporter.escapeCsvCell).join(';')];

      // An empty (or missing) selection means "all events".
      const selected =
        Array.isArray(eventIds) && 0 < eventIds.length ? {} : null;
      if (selected) {
        for (const id of eventIds) {
          selected[id] = true;
        }
      }

      // Events oldest first, so the CSV reads like a journal.
      const sortedEvents = state.events
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date));

      for (const event of sortedEvents) {
        if (selected && !selected[event.id]) {
          continue;
        }

        for (const ing of event.ingredients) {
          const childName =
            ing.childId && kidNames[ing.childId]
              ? kidNames[ing.childId]
              : '';

          lines.push(
            [
              event.date,
              event.title,
              ing.name,
              ing.quantity,
              ing.unit,
              childName,
              ing.price.toFixed(2),
            ]
              .map(Exporter.escapeCsvCell)
              .join(';')
          );
        }
      }

      // The BOM (\uFEFF) tells spreadsheet programs "this is UTF-8".
      return '\uFEFF' + lines.join('\r\n');
    }

    /**
     * Build the log CSV (one row per log entry, newest first).
     *
     * Same format as the history CSV: semicolon-separated with a
     * UTF-8 BOM, action text in the current UI language.
     *
     * @param {object} state - plain state
     * @param {object} i18n - I18n instance for the localized text
     * @returns {string} the complete CSV text
     */
    static buildLogCsv(state, i18n) {
      const lines = [
        [i18n.t('log.time'), i18n.t('log.action')]
          .map(Exporter.escapeCsvCell)
          .join(';'),
      ];

      state.log
        .slice()
        .reverse()
        .forEach(function (entry) {
          lines.push(
            [entry.t, Exporter.logEntryText(i18n, entry)]
              .map(Exporter.escapeCsvCell)
              .join(';')
          );
        });

      // The BOM (\uFEFF) tells spreadsheet programs "this is UTF-8".
      return '\uFEFF' + lines.join('\r\n');
    }

    /**
     * Trigger a classic browser download for a Blob.
     *
     * @param {Blob} blob
     * @param {string} filename
     */
    static downloadBlob(blob, filename) {
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);

      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();

      // Revoke a tick later so the download has time to start.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /**
     * Escape one CSV cell: neutralize formula injection, then wrap in
     * double quotes when it contains the separator, a quote or a line
     * break; double any inner quotes.
     *
     * @param {*} cell
     * @returns {string}
     */
    static escapeCsvCell(cell) {
      let text = String(cell);

      // A value starting with = + - @ or a tab could be interpreted as
      // a formula by spreadsheet apps; prefix it so it stays text.
      if (/^[=+\-@\t]/.test(text)) {
        text = "'" + text;
      }

      if (/[;"\n\r]/.test(text)) {
        return '"' + text.replace(/"/g, '""') + '"';
      }

      return text;
    }

    /**
     * Download the history as CSV.
     *
     * @param {object} state - plain state
     * @param {string[]} headers - localized column names
     * @param {string[]} [eventIds] - optional selection (see
     *        buildHistoryCsv); empty means all events
     */
    static exportHistoryCsv(state, headers, eventIds) {
      const csv = Exporter.buildHistoryCsv(state, headers, eventIds);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });

      Exporter.downloadBlob(blob, 'history-' + Util.todayIso() + '.csv');
    }

    /**
     * Download the log as CSV.
     *
     * @param {object} state - plain state
     * @param {object} i18n - I18n instance for the localized text
     */
    static exportLogCsv(state, i18n) {
      const csv = Exporter.buildLogCsv(state, i18n);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });

      Exporter.downloadBlob(blob, 'log-' + Util.todayIso() + '.csv');
    }

    /**
     * Download the log as pretty-printed JSON (the raw entries).
     *
     * @param {object} state - plain state
     */
    static exportLogJson(state) {
      const blob = new Blob([JSON.stringify(state.log, null, 2)], {
        type: 'application/json',
      });

      Exporter.downloadBlob(blob, 'log-' + Util.todayIso() + '.json');
    }

    /**
     * The localized text of one log entry (machine data -> text).
     *
     * @param {object} i18n - I18n instance
     * @param {object} entry - a log entry { t, action, data }
     * @returns {string}
     */
    static logEntryText(i18n, entry) {
      const data = Object.assign({}, entry.data || {});

      // One action, two wordings (items deleted or kept).
      if ('category.remove' === entry.action) {
        return i18n.t(
          true === data.withItems
            ? 'log.category.removeWithItems'
            : 'log.category.removeKeep',
          data
        );
      }

      // Empty name: the action cleared the name, not renamed it.
      if ('kindergarten.name' === entry.action && '' === data.name) {
        return i18n.t('log.kindergarten.clear');
      }

      if ('language.change' === entry.action) {
        data.from = i18n.t('log.language.' + data.from);
        data.to = i18n.t('log.language.' + data.to);
      }

      if ('price.update' === entry.action && data.field) {
        data.field = i18n.t('log.field.' + data.field);

        if ('price' === entry.data.field) {
          data.from = i18n.formatMoney(data.from);
          data.to = i18n.formatMoney(data.to);
        }
      }

      if ('event.price' === entry.action) {
        data.from = i18n.formatMoney(data.from);
        data.to = i18n.formatMoney(data.to);
      }

      if (
        'event.save' === entry.action ||
        'event.update' === entry.action ||
        'event.delete' === entry.action
      ) {
        data.date = i18n.formatDate(data.date);
        data.total = i18n.formatMoney(data.total);
      }

      if ('price.add' === entry.action) {
        data.price = i18n.formatMoney(data.price);
      }

      return i18n.t('log.' + entry.action, data);
    }

    /**
     * Build the JSON export File (the complete app state).
     *
     * @param {object} state - plain state
     * @returns {File}
     */
    static jsonFile(state) {
      const name = 'kita-data-' + Util.todayIso() + '.json';

      return new File([JSON.stringify(state, null, 2)], name, {
        type: 'application/json',
      });
    }

    /**
     * Share the JSON export with the OS share sheet when possible,
     * otherwise fall back to a plain download.
     *
     * @param {object} state - plain state
     * @param {string} shareTitle - localized share sheet title
     * @returns {Promise<'shared' | 'downloaded' | 'cancelled'>}
     */
    static async share(state, shareTitle) {
      const file = Exporter.jsonFile(state);

      if (
        'undefined' !== typeof navigator &&
        navigator.canShare &&
        navigator.canShare({ files: [file] })
      ) {
        try {
          await navigator.share({ files: [file], title: shareTitle });

          return 'shared';
        } catch (error) {
          // Closing the share sheet is a cancel, not an error.
          if ('AbortError' === error.name) {
            return 'cancelled';
          }

          console.error('Share failed, falling back to download:', error);
        }
      }

      Exporter.downloadBlob(file, file.name);

      return 'downloaded';
    }
  }

  /* The export footer stays at the bottom by convention. */
  const api = {
    Exporter: Exporter,
  };

  if ('undefined' !== typeof window) {
    window.FairShare = window.FairShare || {};
    Object.assign(window.FairShare, api);
  }

  if ('undefined' !== typeof module && module.exports) {
    module.exports = api;
  }
})();
