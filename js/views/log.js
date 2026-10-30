/*
 * js/views/log.js - "Log" view
 * ---------------------------------------------------------------------------
 * The audit log: every action of the app (kids, ingredients,
 * categories, events, imports, language changes) is stored with its
 * timestamp in the data state and listed here, newest first.
 *
 * The log can be exported as CSV (human readable) or as JSON
 * (machine readable). It can NOT be deleted from the UI - entries
 * older than the five-year retention window are removed
 * automatically (see DataModel.prune).
 *
 * Registered on the shared namespace as FairShare.Views.log.
 */

(function () {
  'use strict';

  const Util = window.FairShare.util;
  const escapeHtml = Util.escapeHtml;
  const Exporter = window.FairShare.Exporter;
  const Views = (window.FairShare.Views = window.FairShare.Views || {});

  /** "30.10.2026 14:05" from the entry's ISO timestamp. */
  function logEntryTime(i18n, entry) {
    return (
      i18n.formatDate(entry.t.slice(0, 10)) + ' ' + i18n.formatClock(new Date(entry.t))
    );
  }

  Views.log = {
    /**
     * Render the audit log view.
     *
     * @param {object} app - the App instance
     */
    render(app) {
      const i18n = app.i18n;
      const model = app.model;
      const entries = model.log.slice().reverse(); // newest first

      let html = '';

      /* ---- header + export ---- */
      html +=
        `<div class="card mb-3 shadow-sm">
        <div class="card-header">${escapeHtml(i18n.t('log.title'))}</div>
        <div class="card-body">
          <div class="form-text">${escapeHtml(i18n.t('log.hint'))}</div>
          <div class="d-flex flex-wrap gap-2">
            <button
              class="btn btn-outline-secondary btn-sm log-csv"
              type="button">${escapeHtml(i18n.t('log.exportCsv'))}
            </button>
            <button
              class="btn btn-outline-secondary btn-sm log-json"
              type="button">${escapeHtml(i18n.t('log.exportJson'))}
            </button>
          </div>
        </div>
      </div>`;

      /* ---- table (or empty state) ---- */
      if (0 === entries.length) {
        html +=
          '<div class="card shadow-sm"><div class="card-body">' +
          '<p class="mb-0 text-body-secondary">' +
          escapeHtml(i18n.t('log.empty')) +
          '</p></div></div>';
      } else {
        html +=
          '<div class="card shadow-sm">' +
          '<div class="table-responsive">' +
          '<table class="align-middle mb-0 table table-hover">' +
          '<thead><tr>' +
          '<th>' + escapeHtml(i18n.t('log.time')) + '</th>' +
          '<th>' + escapeHtml(i18n.t('log.action')) + '</th>' +
          '</tr></thead><tbody>';

        entries.forEach(function (entry) {
          html +=
            '<tr>' +
            '<td class="text-nowrap">' +
            escapeHtml(logEntryTime(i18n, entry)) +
            '</td>' +
            '<td>' +
            escapeHtml(Exporter.logEntryText(i18n, entry)) +
            '</td>' +
            '</tr>';
        });

        html += '</tbody></table></div></div>';
      }

      const view = document.getElementById('view');
      view.innerHTML = html;

      /* ---- export buttons ---- */
      view
        .querySelector('.log-csv')
        .addEventListener('click', function () {
          Exporter.exportLogCsv(app.model.toJson(), i18n);
        });
      view
        .querySelector('.log-json')
        .addEventListener('click', function () {
          Exporter.exportLogJson(app.model.toJson());
        });
    },
  };
})();
