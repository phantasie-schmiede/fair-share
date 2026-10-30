/*
 * js/views/history.js - "History" view
 * ---------------------------------------------------------------------------
 * One card per saved event (oldest at the bottom), plus the "Data &
 * backup" card: sharing (Web Share API), JSON export/import, CSV export
 * and printing.
 *
 * Registered on the shared namespace as FairShare.Views.history.
 */

(function () {
  'use strict';

  const Util = window.FairShare.util;
  const escapeHtml = Util.escapeHtml;
  const Exporter = window.FairShare.Exporter;
  const Views = (window.FairShare.Views = window.FairShare.Views || {});

  /** Ids of the events the user selected for export/printing. */
  let selectedEvents = {};

  /** The localized column names of the CSV export. */
  function csvHeaders(i18n) {
    return [
      i18n.t('history.date'),
      i18n.t('history.event'),
      i18n.t('history.ingredient'),
      i18n.t('history.quantity'),
      i18n.t('history.unit'),
      i18n.t('history.child'),
      i18n.t('history.price'),
    ];
  }

  /**
   * True when an event can still be edited or deleted: its date is
   * today or later. Past events are final (history must not change).
   */
  function isFutureEvent(event) {
    return Util.todayIso() <= event.date;
  }

  /** One event card (header with date/title/total + ingredient table). */
  function eventHtml(app, event) {
    const i18n = app.i18n;
    const model = app.model;
    const kidNames = {};
    model.kids.forEach(function (kid) {
      kidNames[kid.id] = kid.name;
    });
    const total = event.ingredients.reduce(
      function (sum, ing) {
        return sum + ing.price;
      },
      0
    );

    let html =
      `<div
        class="card event-card mb-3 shadow-sm"
        data-event="${escapeHtml(event.id)}">
      <div class="align-items-baseline bg-primary-subtle card-header d-flex flex-wrap gap-2">
        <input
          class="form-check-input event-select"
          data-event="${escapeHtml(event.id)}"
          type="checkbox">
        <span class="fw-semibold">${i18n.formatDate(event.date)}${
          '' === event.title ? '' : ' – ' + escapeHtml(event.title)
        }</span>
        <button
          class="btn btn-outline-primary btn-sm event-clone"
          data-event="${escapeHtml(event.id)}"
          type="button">${escapeHtml(i18n.t('history.clone'))}
        </button>
        ${
          isFutureEvent(event)
            ? `<button
              class="btn btn-outline-secondary btn-sm event-edit"
              data-event="${escapeHtml(event.id)}"
              type="button">${escapeHtml(i18n.t('history.edit'))}
            </button>
            <button
              class="btn btn-outline-danger btn-sm event-delete"
              data-event="${escapeHtml(event.id)}"
              type="button">${escapeHtml(i18n.t('history.delete'))}
            </button>`
            : ''
        }
        <span class="ms-auto small text-body-secondary">${escapeHtml(
          i18n.t('history.total')
        )}: ${i18n.formatMoney(total)}</span>
      </div>
      <div class="table-responsive"><table class="align-middle mb-0 table">
        <thead><tr>
          <th>${escapeHtml(i18n.t('history.ingredient'))}</th>
          <th>${escapeHtml(i18n.t('history.quantity'))}</th>
          <th>${escapeHtml(i18n.t('history.unit'))}</th>
          <th>${escapeHtml(i18n.t('history.child'))}</th>
          <th class="text-end">${escapeHtml(i18n.t('history.price'))}</th>
        </tr></thead><tbody>`;

    event.ingredients.forEach(function (ing) {
      const childName =
        ing.childId && kidNames[ing.childId]
          ? kidNames[ing.childId]
          : i18n.t('history.childUnknown');
      const manualNote = ing.manual
        ? ' <span class="badge text-bg-warning">' +
          escapeHtml(i18n.t('history.manual')) +
          '</span>'
        : '';

      html +=
        `<tr>
        <td>${escapeHtml(ing.name)}</td>
        <td>${0 === ing.quantity ? '' : escapeHtml(ing.quantity)}</td>
        <td>${escapeHtml(ing.unit)}</td>
        <td>${escapeHtml(childName)}${manualNote}</td>
        <td class="text-end">${i18n.formatMoney(ing.price)}</td>
      </tr>`;
    });

    html += '</tbody></table></div></div>';

    return html;
  }

  /**
   * The print-only markup of the wall posters ("Aushänge"): one
   * section per event with ingredient, combined amount and child –
   * no prices, no totals.
   */
  function posterHtml(app, events) {
    const i18n = app.i18n;
    const model = app.model;
    const kidNames = {};
    model.kids.forEach(function (kid) {
      kidNames[kid.id] = kid.name;
    });

    let html = '';

    events.forEach(function (event) {
      html +=
        `<section class="poster-section">
        <h3>${i18n.formatDate(event.date)}${
          '' === event.title ? '' : ' – ' + escapeHtml(event.title)
        }</h3>
        <table class="table table-bordered">
          <thead><tr>
            <th>${escapeHtml(i18n.t('history.ingredient'))}</th>
            <th>${escapeHtml(i18n.t('history.amount'))}</th>
            <th>${escapeHtml(i18n.t('history.child'))}</th>
          </tr></thead><tbody>`;

      event.ingredients.forEach(function (ing) {
        const childName =
          ing.childId && kidNames[ing.childId]
            ? kidNames[ing.childId]
            : i18n.t('history.childUnknown');
        const amount =
          0 === ing.quantity ? ing.unit : ing.quantity + ' ' + ing.unit;

        html +=
          `<tr>
          <td>${escapeHtml(ing.name)}</td>
          <td>${escapeHtml(amount)}</td>
          <td>${escapeHtml(childName)}</td>
        </tr>`;
      });

      html += '</tbody></table></section>';
    });

    return html;
  }

  /** Number of currently selected events that still exist. */
  function selectedCount(model) {
    let count = 0;

    for (const event of model.events) {
      if (selectedEvents[event.id]) {
        count += 1;
      }
    }

    return count;
  }

  /**
   * Update the export/print button labels: with an active selection
   * they refer to "Auswahl …", otherwise to the complete data.
   */
  function updateActionLabels(i18n, count) {
    const labels = {
      'hist-csv':
        0 < count ? 'history.csvSelected' : 'history.csv',
      'hist-print':
        0 < count ? 'history.printSelected' : 'history.print',
      'hist-print-poster':
        0 < count ? 'history.posterSelected' : 'history.poster',
    };

    for (const selector of Object.keys(labels)) {
      const button = document.querySelector('.' + selector);

      if (button) {
        button.textContent = i18n.t(labels[selector]);
      }
    }
  }

  Views.history = {
    /**
     * Render the history view.
     *
     * @param {object} app - the App instance
     */
    render(app) {
      const i18n = app.i18n;
      const model = app.model;
      const events = model.events
        .slice()
        .sort(function (a, b) {
          return a.date.localeCompare(b.date);
        });

      let html = '';

      if (0 === events.length) {
        html +=
          '<div class="card mb-3 shadow-sm"><div class="card-body">' +
          '<p class="mb-0 text-body-secondary">' +
          escapeHtml(i18n.t('history.none')) +
          '</p></div></div>';
      }

      events.forEach(function (event) {
        html += eventHtml(app, event);
      });

      /* ---- encryption (passphrase via Web Crypto) ---- */
      let cryptoModals = '';
      let encryptionHtml = '';

      if (app.storage && app.storage.cryptoAvailable) {
        if (app.storage.encryptionActive) {
          encryptionHtml =
            `<div class="border-top mt-3 pt-3">
            <div class="align-items-center d-flex flex-wrap gap-2">
              <span class="text-body-secondary">🔒 ${escapeHtml(i18n.t('crypto.activeNote'))}</span>
              <button
                class="btn btn-outline-secondary btn-sm crypto-change-btn"
                type="button">${escapeHtml(i18n.t('crypto.change'))}
              </button>
              <button
                class="btn btn-outline-danger btn-sm crypto-deactivate-btn"
                type="button">${escapeHtml(i18n.t('crypto.deactivate'))}
              </button>
            </div>
            <p class="mb-0 mt-2 small text-body-secondary">${escapeHtml(i18n.t('crypto.exportNote'))}</p>
          </div>`;
          cryptoModals = `<div
            class="modal"
            id="crypto-change-modal"
            tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
              <div class="modal-content">
                <div class="modal-header">
                  <h5
                    class="modal-title"
                    id="crypto-change-title"></h5>
                  <button
                    aria-label="${escapeHtml(i18n.t('common.cancel'))}"
                    class="btn-close"
                    data-bs-dismiss="modal"
                    type="button"></button>
                </div>
                <form id="crypto-change-form">
                  <div class="modal-body">
                    <label
                      class="form-label"
                      for="crypto-change-pass-1"
                      id="crypto-change-pass-1-label"></label>
                    <input
                      autocomplete="new-password"
                      class="form-control mb-3"
                      id="crypto-change-pass-1"
                      type="password">
                    <label
                      class="form-label"
                      for="crypto-change-pass-2"
                      id="crypto-change-pass-2-label"></label>
                    <input
                      autocomplete="new-password"
                      class="form-control"
                      id="crypto-change-pass-2"
                      type="password">
                    <div
                      class="alert alert-danger"
                      hidden
                      id="crypto-change-error"></div>
                  </div>
                  <div class="modal-footer">
                    <button
                      class="btn btn-outline-secondary"
                      data-bs-dismiss="modal"
                      id="crypto-change-cancel"
                      type="button"></button>
                    <button
                      class="btn btn-primary"
                      id="crypto-change-submit"
                      type="submit"></button>
                  </div>
                </form>
              </div>
            </div>
          </div>`;
        } else {
          encryptionHtml =
            `<div class="border-top mt-3 pt-3">
            <button
              class="btn btn-outline-secondary btn-sm crypto-activate-btn"
              type="button">${escapeHtml(i18n.t('crypto.activate'))}
            </button>
          </div>`;
          cryptoModals = `<div
            class="modal"
            id="crypto-activate-modal"
            tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
              <div class="modal-content">
                <div class="modal-header">
                  <h5
                    class="modal-title"
                    id="crypto-activate-title"></h5>
                  <button
                    aria-label="${escapeHtml(i18n.t('common.cancel'))}"
                    class="btn-close"
                    data-bs-dismiss="modal"
                    type="button"></button>
                </div>
                <form id="crypto-activate-form">
                  <div class="modal-body">
                    <div
                      class="alert alert-warning mb-3"
                      id="crypto-activate-hint"></div>
                    <label
                      class="form-label"
                      for="crypto-pass-1"
                      id="crypto-pass-1-label"></label>
                    <input
                      autocomplete="new-password"
                      class="form-control mb-3"
                      id="crypto-pass-1"
                      type="password">
                    <label
                      class="form-label"
                      for="crypto-pass-2"
                      id="crypto-pass-2-label"></label>
                    <input
                      autocomplete="new-password"
                      class="form-control"
                      id="crypto-pass-2"
                      type="password">
                    <div
                      class="alert alert-danger"
                      hidden
                      id="crypto-activate-error"></div>
                  </div>
                  <div class="modal-footer">
                    <button
                      class="btn btn-outline-secondary"
                      data-bs-dismiss="modal"
                      id="crypto-activate-cancel"
                      type="button"></button>
                    <button
                      class="btn btn-primary"
                      id="crypto-activate-submit"
                      type="submit"></button>
                  </div>
                </form>
              </div>
            </div>
          </div>`;
        }
      }

      /* ---- data & backup ---- */
      html +=
        `<div class="card hist-backup-card shadow-sm">
        <div class="card-header">${escapeHtml(i18n.t('history.data'))}</div>
        <div class="card-body">
          <div class="mb-3">
            <label
              class="form-label mb-1"
              for="kindergarten-name">${escapeHtml(i18n.t('history.kindergartenName'))}
            </label>
            <div class="d-flex gap-2">
              <input
                class="form-control form-control-sm"
                id="kindergarten-name"
                maxlength="100"
                type="text"
                value="${escapeHtml(model.metadata.kindergartenName)}">
              <button
                class="btn btn-outline-secondary btn-sm kindergarten-save"
                type="button">${escapeHtml(i18n.t('common.save'))}
              </button>
            </div>
          </div>
          <div class="d-flex flex-wrap gap-2">
            <button
              class="btn btn-primary btn-sm hist-share"
              type="button">${escapeHtml(i18n.t('history.share'))}
            </button>
            <button
              class="btn btn-outline-secondary btn-sm hist-export"
              type="button">${escapeHtml(i18n.t('history.exportJson'))}
            </button>
            <button
              class="btn btn-outline-secondary btn-sm hist-import"
              type="button">${escapeHtml(i18n.t('history.import'))}
            </button>
            <button
              class="btn btn-outline-secondary btn-sm hist-csv"
              type="button">${escapeHtml(i18n.t('history.csv'))}
            </button>
            <button
              class="btn btn-outline-secondary btn-sm hist-print"
              type="button">${escapeHtml(i18n.t('history.print'))}
            </button>
            <button
              class="btn btn-outline-secondary btn-sm hist-print-poster"
              type="button">${escapeHtml(i18n.t('history.poster'))}
            </button>
          </div>
          ${encryptionHtml}
        </div>
      </div>
      ${cryptoModals}`;

      const view = document.getElementById('view');
      view.innerHTML = html;

      /* ---- wire the buttons ---- */
      view.querySelectorAll('.event-clone').forEach(function (button) {
        button.addEventListener('click', function () {
          app.cloneEvent(button.dataset.event);
        });
      });
      view.querySelectorAll('.event-edit').forEach(function (button) {
        button.addEventListener('click', function () {
          app.editEvent(button.dataset.event);
        });
      });
      view.querySelectorAll('.event-delete').forEach(function (button) {
        button.addEventListener('click', function () {
          const event = app.model.eventById(button.dataset.event);

          if (!event) {
            return;
          }
          const label = event.title || i18n.formatDate(event.date);

          if (!window.confirm(i18n.t('history.deleteConfirm', { title: label }))) {
            return;
          }
          if (!app.model.removeEvent(event.id).ok) {
            return;
          }
          delete selectedEvents[event.id];
          app.scheduleSave();
          Views.history.render(app);
        });
      });
      /* The Enter key saves the name like the button does. */
      const saveKindergartenName = function () {
        const name = document.getElementById('kindergarten-name').value;

        if (!app.model.setKindergartenName(name).ok) {
          return;
        }
        app.applyLanguage();
        Views.history.render(app);
        app.scheduleSave();
      };
      view.querySelectorAll('.kindergarten-save').forEach(function (button) {
        button.addEventListener('click', saveKindergartenName);
      });
      document
        .getElementById('kindergarten-name')
        .addEventListener('keydown', function (event) {
          if ('Enter' === event.key) {
            saveKindergartenName();
          }
        });
      view.querySelectorAll('.hist-share').forEach(function (button) {
        button.addEventListener('click', function () {
          Exporter.share(app.model.toJson(), i18n.t('export.share.title')).then(
            function (result) {
              if ('shared' === result) {
                app.showToast(i18n.t('toast.shared'));
              }
            }
          );
        });
      });
      view.querySelectorAll('.hist-export').forEach(function (button) {
        button.addEventListener('click', function () {
          const state = app.model.toJson();
          Exporter.downloadBlob(
            Exporter.jsonFile(state),
            'kita-data-' + Util.todayIso() + '.json'
          );
        });
      });
      view.querySelectorAll('.hist-import').forEach(function (button) {
        button.addEventListener('click', function () {
          app.triggerImport();
        });
      });
      view.querySelectorAll('.hist-csv').forEach(function (button) {
        button.addEventListener('click', function () {
          const ids = model.events
            .filter((event) => selectedEvents[event.id])
            .map((event) => event.id);

          Exporter.exportHistoryCsv(
            app.model.toJson(),
            csvHeaders(i18n),
            ids
          );
        });
      });
      view.querySelectorAll('.hist-print').forEach(function (button) {
        button.addEventListener('click', function () {
          window.print();
        });
      });
      view.querySelectorAll('.hist-print-poster').forEach(function (button) {
        button.addEventListener('click', function () {
          const target = document.getElementById('print-poster');

          if (!target) {
            return;
          }
          target.innerHTML = posterHtml(
            app,
            0 < selectedCount(model)
              ? events.filter((event) => selectedEvents[event.id])
              : events
          );
          document.body.classList.add('print-poster');

          const reset = function () {
            document.body.classList.remove('print-poster');
            window.removeEventListener('afterprint', reset);
          };

          window.addEventListener('afterprint', reset);
          window.print();
        });
      });

      /* ---- encryption (activate / change / deactivate) ---- */
      const cryptoLabels = {
        'crypto-activate-cancel': 'common.cancel',
        'crypto-activate-hint': 'crypto.activateHint',
        'crypto-activate-submit': 'crypto.activate',
        'crypto-activate-title': 'crypto.activate',
        'crypto-change-cancel': 'common.cancel',
        'crypto-change-pass-1-label': 'crypto.passphrase',
        'crypto-change-pass-2-label': 'crypto.confirmPassphrase',
        'crypto-change-submit': 'crypto.change',
        'crypto-change-title': 'crypto.change',
        'crypto-pass-1-label': 'crypto.passphrase',
        'crypto-pass-2-label': 'crypto.confirmPassphrase',
      };

      for (const [id, key] of Object.entries(cryptoLabels)) {
        const element = document.getElementById(id);

        if (element) {
          element.textContent = i18n.t(key);
        }
      }

      const activateButton = view.querySelector('.crypto-activate-btn');

      if (activateButton) {
        // The modal element intentionally carries no "fade" class:
        // show() and hide() must finish synchronously, because the
        // view is re-rendered right after hide().
        const activateModal = new bootstrap.Modal(
          document.getElementById('crypto-activate-modal')
        );

        activateButton.addEventListener('click', function () {
          activateModal.show();
        });
        document
          .getElementById('crypto-activate-form')
          .addEventListener('submit', function (event) {
            event.preventDefault();
            const confirmInput = document.getElementById('crypto-pass-2');
            const errorBox = document.getElementById('crypto-activate-error');
            const passInput = document.getElementById('crypto-pass-1');

            if (passInput.value.length < 8) {
              errorBox.hidden = false;
              errorBox.textContent = i18n.t('crypto.tooShort');
              passInput.value = '';
              passInput.focus();

              return;
            }
            if (passInput.value !== confirmInput.value) {
              errorBox.hidden = false;
              errorBox.textContent = i18n.t('crypto.mismatch');
              passInput.value = '';
              confirmInput.value = '';
              passInput.focus();

              return;
            }
            errorBox.hidden = true;
            app
              .activateEncryption(passInput.value)
              .then(function () {
                activateModal.hide();
                app.showToast(i18n.t('crypto.activateOk'));
                Views.history.render(app);
              });
          });
      }

      const changeButton = view.querySelector('.crypto-change-btn');

      if (changeButton) {
        // The modal element intentionally carries no "fade" class:
        // show() and hide() must finish synchronously, because the
        // view is re-rendered right after hide().
        const changeModal = new bootstrap.Modal(
          document.getElementById('crypto-change-modal')
        );

        changeButton.addEventListener('click', function () {
          changeModal.show();
        });
        document
          .getElementById('crypto-change-form')
          .addEventListener('submit', function (event) {
            event.preventDefault();
            const confirmInput = document.getElementById(
              'crypto-change-pass-2'
            );
            const errorBox = document.getElementById('crypto-change-error');
            const passInput = document.getElementById('crypto-change-pass-1');

            if (passInput.value.length < 8) {
              errorBox.hidden = false;
              errorBox.textContent = i18n.t('crypto.tooShort');
              passInput.value = '';
              passInput.focus();

              return;
            }
            if (passInput.value !== confirmInput.value) {
              errorBox.hidden = false;
              errorBox.textContent = i18n.t('crypto.mismatch');
              passInput.value = '';
              confirmInput.value = '';
              passInput.focus();

              return;
            }
            errorBox.hidden = true;
            app
              .changePassphrase(passInput.value)
              .then(function () {
                changeModal.hide();
                app.showToast(i18n.t('crypto.changeOk'));
                Views.history.render(app);
              });
          });
      }

      const deactivateButton = view.querySelector('.crypto-deactivate-btn');

      if (deactivateButton) {
        deactivateButton.addEventListener('click', function () {
          if (!window.confirm(i18n.t('crypto.deactivateConfirm'))) {
            return;
          }
          app
            .deactivateEncryption()
            .then(function () {
              app.showToast(i18n.t('crypto.deactivateOk'));
              Views.history.render(app);
            });
        });
      }

      /* ---- event selection (export/print scope) ---- */
      view.querySelectorAll('.event-select').forEach(function (box) {
        if (selectedEvents[box.dataset.event]) {
          box.checked = true;
          box.closest('.event-card').classList.add('event-card--selected');
        }
        box.addEventListener('change', function () {
          const card = box.closest('.event-card');

          if (box.checked) {
            selectedEvents[box.dataset.event] = true;
            card.classList.add('event-card--selected');
          } else {
            delete selectedEvents[box.dataset.event];
            card.classList.remove('event-card--selected');
          }
          document.body.classList.toggle(
            'print-selection',
            0 < selectedCount(model)
          );
          updateActionLabels(i18n, selectedCount(model));
        });
      });

      document.body.classList.toggle(
        'print-selection',
        0 < selectedCount(model)
      );
      updateActionLabels(i18n, selectedCount(model));
    },
  };
})();
