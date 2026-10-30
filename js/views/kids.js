/*
 * js/views/kids.js - "Kids" view
 * ---------------------------------------------------------------------------
 * Manage the group: add children (with their enrollment date),
 * activate/deactivate them, and remove children that still have no
 * history (removal is blocked once a child has been assigned
 * ingredients - the history must never be orphaned).
 *
 * Registered on the shared namespace as FairShare.Views.kids.
 */

(function () {
  'use strict';

  const Util = window.FairShare.util;
  const escapeHtml = Util.escapeHtml;
  const MAX_TEXT_LENGTH = window.FairShare.MAX_TEXT_LENGTH;
  const Views = (window.FairShare.Views = window.FairShare.Views || {});

  /** Kid currently being renamed in the table (null = none). */
  let editingKid = null;

  Views.kids = {
    /**
     * Render the kids view.
     *
     * @param {object} app - the App instance
     */
    render(app) {
      const i18n = app.i18n;
      const model = app.model;

      let html = '';

      /* ---- add form ---- */
      html +=
        `<div class="card mb-3 shadow-sm">
        <div class="card-header">${escapeHtml(i18n.t('kids.addTitle'))}</div>
        <div class="card-body">
          <form
            class="align-items-end g-2 row"
            id="kid-form">
            <div class="col-sm">
              <label
                class="form-label"
                for="kid-name">${escapeHtml(i18n.t('kids.name'))}
              </label>
              <input
                class="form-control"
                id="kid-name"
                maxlength="${MAX_TEXT_LENGTH}"
                placeholder="${escapeHtml(i18n.t('kids.namePlaceholder'))}"
                type="text">
            </div>
            <div class="col-md-3 col-sm-4">
              <label
                class="form-label"
                for="kid-date">${escapeHtml(i18n.t('kids.enrolledOn'))}
              </label>
              <input
                class="form-control"
                id="kid-date"
                type="date"
                value="${escapeHtml(Util.todayIso())}">
            </div>
            <div>
              <button
                class="btn btn-primary"
                type="submit">${escapeHtml(i18n.t('kids.add'))}
              </button>
            </div>
          </form>
        </div>
      </div>`;

      /* ---- kids table (or empty state) ---- */
      if (0 === model.kids.length) {
        html +=
          '<div class="card shadow-sm"><div class="card-body">' +
          '<p class="mb-0 text-body-secondary">' +
          escapeHtml(i18n.t('overview.emptyKids')) +
          '</p></div></div>';
      } else {
        html +=
          '<div class="card shadow-sm">' +
          '<div class="card-header">' +
          escapeHtml(i18n.t('kids.title')) +
          '</div>' +
          '<div class="table-responsive">' +
          '<table class="align-middle mb-0 table table-hover">' +
          '<thead><tr>' +
          '<th>' + escapeHtml(i18n.t('overview.child')) + '</th>' +
          '<th>' + escapeHtml(i18n.t('kids.enrolled')) + '</th>' +
          '<th>' + escapeHtml(i18n.t('kids.status')) + '</th>' +
          '<th>' + escapeHtml(i18n.t('kids.actions')) + '</th>' +
          '</tr></thead><tbody>';

        model.kids.forEach(function (kid) {
          const editing = editingKid === kid.id;
          const removable = !model.hasAssignments(kid.id);
          const statusClass = kid.active
            ? ''
            : 'fst-italic text-body-secondary';
          const disabledAttrs = removable
            ? ''
            : ' disabled title="' +
              escapeHtml(i18n.t('kids.removeConfirm')) +
              '"';
          const nameCell = editing
            ? `<td>
               <div class="align-items-center d-flex gap-2">
               <input
                 class="form-control form-control-sm kid-rename"
                 maxlength="${MAX_TEXT_LENGTH}"
                 type="text"
                 value="${escapeHtml(kid.name)}">
               <button
                 class="btn btn-primary btn-sm kid-rename-save"
                 type="button">${escapeHtml(i18n.t('common.save'))}
               </button>
               <button
                 class="btn btn-outline-secondary btn-sm kid-rename-cancel"
                 type="button">${escapeHtml(i18n.t('common.cancel'))}
               </button>
               </div></td>`
            : `<td class="${statusClass}">${escapeHtml(kid.name)}</td>`;
          const actionsCell = editing
            ? '<td class="text-nowrap"></td>'
            : `<td class="text-nowrap">
              <button
                class="btn btn-outline-secondary btn-sm kid-rename-btn"
                type="button">${escapeHtml(i18n.t('kids.rename'))}
              </button>
              <button
                class="btn btn-outline-secondary btn-sm kid-toggle"
                type="button">${escapeHtml(
                  kid.active
                    ? i18n.t('kids.deactivate')
                    : i18n.t('kids.activate')
                )}
              </button>
              <button
                class="btn btn-outline-danger btn-sm kid-remove"
                ${disabledAttrs}
                type="button">${escapeHtml(i18n.t('kids.remove'))}
              </button>
            </td>`;

          html +=
            `<tr data-kid="${escapeHtml(kid.id)}">
            ${nameCell}
            <td>${i18n.formatDate(kid.enrolledOn)}</td>
            <td>${
              kid.active
                ? escapeHtml(i18n.t('kids.active'))
                : escapeHtml(i18n.t('kids.inactive')) +
                  ' · ' +
                  escapeHtml(
                    i18n.t('kids.willBeDeleted', {
                      date: i18n.formatDate(
                        Util.addYearsIso(kid.enrolledOn, 5)
                      ),
                    })
                  )
            }</td>
            ${actionsCell}
          </tr>`;
        });

        html +=
          '</tbody></table></div>' +
          '<div class="card-body py-2"><small class="text-body-secondary">' +
          escapeHtml(i18n.t('kids.hint')) +
          '</small></div></div>';
      }

      const view = document.getElementById('view');
      view.innerHTML = html;

      /* ---- add child ---- */
      document
        .getElementById('kid-form')
        .addEventListener('submit', function (event) {
          event.preventDefault();
          const name = document.getElementById('kid-name').value.trim();
          const date = document.getElementById('kid-date').value;

          if ('' === name) {
            // Enter only moves the focus to the missing field; an
            // explicit button click still shows the error message.
            document.getElementById('kid-name').focus();

            if (
              event.submitter &&
              'button' === event.submitter.tagName.toLowerCase()
            ) {
              window.alert(i18n.t('kids.error.name'));
            }

            return;
          }
          const result = model.addKid(name, date);

          if (!result.ok) {
            window.alert(
              i18n.t('kids.error.duplicateName', { name: name })
            );

            return;
          }
          app.scheduleSave();
          Views.kids.render(app);
        });

      /* ---- activate / deactivate ---- */
      view.querySelectorAll('.kid-toggle').forEach(function (button) {
        button.addEventListener('click', function () {
          const kid = model.kidById(button.closest('tr').dataset.kid);

          if (!kid) {
            return;
          }

          if (
            kid.active &&
            !window.confirm(
              i18n.t('kids.deactivateConfirm', { name: kid.name })
            )
          ) {
            return;
          }
          model.setKidActive(kid.id, !kid.active);
          app.scheduleSave();
          Views.kids.render(app);
        });
      });

      /* ---- remove (only without history) ---- */
      view.querySelectorAll('.kid-remove').forEach(function (button) {
        button.addEventListener('click', function () {
          const kid = model.kidById(button.closest('tr').dataset.kid);

          if (!kid || model.hasAssignments(kid.id)) {
            return; // safety net: history must never be orphaned
          }

          if (
            !window.confirm(i18n.t('kids.removeConfirm', { name: kid.name }))
          ) {
            return;
          }
          model.removeKid(kid.id);
          app.scheduleSave();
          Views.kids.render(app);
        });
      });

      /* ---- rename (the id stays, so assignments survive) ---- */
      view.querySelectorAll('.kid-rename-btn').forEach(function (button) {
        button.addEventListener('click', function () {
          editingKid = button.closest('tr').dataset.kid;
          Views.kids.render(app);
          const input = view.querySelector('.kid-rename');

          if (input) {
            input.focus();
            input.select();
          }
        });
      });
      const renameInput = view.querySelector('.kid-rename');

      if (renameInput) {
        const saveRename = function () {
          const kid = model.kidById(renameInput.closest('tr').dataset.kid);

          if (!kid) {
            return;
          }
          const name = renameInput.value.trim();
          const result = model.renameKid(kid.id, name);

          if (!result.ok) {
            window.alert(
              '' === name
                ? i18n.t('kids.error.name')
                : i18n.t('kids.error.duplicateName', { name: name })
            );
            Views.kids.render(app);

            return;
          }
          editingKid = null;
          app.scheduleSave();
          Views.kids.render(app);
        };
        renameInput
          .closest('tr')
          .querySelector('.kid-rename-save')
          .addEventListener('click', saveRename);
        // The Enter key saves the name like the button does.
        renameInput.addEventListener('keydown', function (event) {
          if ('Enter' === event.key) {
            saveRename();
          }
        });
        renameInput
          .closest('tr')
          .querySelector('.kid-rename-cancel')
          .addEventListener('click', function () {
            editingKid = null;
            Views.kids.render(app);
          });
      }
    },
  };
})();
