/*
 * js/views/prices.js - "Price list" view
 * ---------------------------------------------------------------------------
 * Manage the ingredient price list: these prices pre-fill the event
 * form automatically.
 *
 * The table is grouped by category (alphabetical, ingredients
 * alphabetical within a category). Categories are first-class entries:
 * they can be added, renamed (inline in the heading) and deleted
 * (with a question whether the ingredients of the category are
 * deleted as well or only lose their assignment). All names (kids,
 * ingredients, categories) must be unique - duplicates are rejected.
 *
 * Registered on the shared namespace as FairShare.Views.prices.
 */

(function () {
  'use strict';

  const DEFAULTS = window.FairShare.DEFAULTS;
  const Util = window.FairShare.util;
  const escapeHtml = Util.escapeHtml;
  const MAX_TEXT_LENGTH = window.FairShare.MAX_TEXT_LENGTH;
  const Views = (window.FairShare.Views = window.FairShare.Views || {});

  /** Category currently being renamed in the heading (null = none). */
  let editingCategory = null;

  /** The category datalist options (data file + defaults, unique). */
  function categorySuggestions(app) {
    const model = app.model;
    const suggestions = model.categories.slice();

    DEFAULTS.categories(app.i18n.language).forEach(function (name) {
      if (-1 === suggestions.indexOf(name)) {
        suggestions.push(name);
      }
    });

    return suggestions
      .sort(function (a, b) {
        return a.localeCompare(b, 'de');
      })
      .map(function (name) {
        return '<option value="' + escapeHtml(name) + '"></option>';
      })
      .join('');
  }

  /**
   * One category heading row of the price table. The uncategorized
   * group gets a plain heading (no actions - there is nothing to
   * rename or delete).
   */
  function categoryHeadingHtml(app, category, isUncategorized) {
    const i18n = app.i18n;
    const label = isUncategorized
      ? i18n.t('prices.uncategorized')
      : category;

    if (isUncategorized) {
      return `<tr class="price-category">
      <th
        class="bg-body-tertiary fw-semibold py-1"
        colspan="6"
        scope="colgroup">${escapeHtml(label)}</th>
    </tr>`;
    }

    if (
      editingCategory &&
      editingCategory.toLowerCase() === category.toLowerCase()
    ) {
      return `<tr class="price-category">
      <th
        class="bg-body-tertiary fw-semibold py-1"
        colspan="6"
        scope="colgroup">
        <div class="align-items-center d-flex gap-2">
          <input
            class="form-control form-control-sm cat-rename"
            list="category-names"
            maxlength="${MAX_TEXT_LENGTH}"
            type="text"
            value="${escapeHtml(category)}">
          <button
            class="btn btn-primary btn-sm cat-rename-save"
            type="button">${escapeHtml(i18n.t('common.save'))}
          </button>
          <button
            class="btn btn-outline-secondary btn-sm cat-rename-cancel"
            type="button">${escapeHtml(i18n.t('common.cancel'))}
          </button>
        </div>
      </th>
    </tr>`;
    }

    return `<tr class="price-category">
    <th
      class="bg-body-tertiary fw-semibold py-1"
      colspan="6"
      scope="colgroup">
      <div class="align-items-center d-flex gap-2">
        <span>${escapeHtml(label)}</span>
        <button
          class="btn btn-outline-secondary btn-sm cat-edit"
          data-category="${escapeHtml(category)}"
          type="button">${escapeHtml(i18n.t('prices.categoryEdit'))}
        </button>
        <button
          class="btn btn-outline-danger btn-sm cat-delete"
          data-category="${escapeHtml(category)}"
          type="button">${escapeHtml(i18n.t('prices.categoryDelete'))}
        </button>
      </div>
    </th>
  </tr>`;
  }

  Views.prices = {
    /**
     * Render the price list view.
     *
     * @param {object} app - the App instance
     */
    render(app) {
      const i18n = app.i18n;
      const model = app.model;

      // A dangling edit session (e.g. the category was deleted
      // meanwhile) must not be rendered.
      if (
        editingCategory &&
        !model.categories.some(function (category) {
          return category.toLowerCase() === editingCategory.toLowerCase();
        })
      ) {
        editingCategory = null;
      }

      // Union of the category list and the item categories, so
      // hand-typed categories stay manageable too.
      const categoryNames = model.categories.slice();

      model.priceList.forEach(function (item) {
        if (
          '' !== item.category &&
          !categoryNames.some(function (category) {
            return category.toLowerCase() === item.category.toLowerCase();
          })
        ) {
          categoryNames.push(item.category);
        }
      });
      categoryNames.sort(function (a, b) {
        return a.localeCompare(b, 'de');
      });

      // Items per category (sorted by name, first-seen index kept).
      const itemsByCategory = {};

      model.priceList.forEach(function (item, index) {
        const key = item.category || '';

        if (!itemsByCategory[key]) {
          itemsByCategory[key] = [];
        }
        itemsByCategory[key].push({ index: index, item: item });
      });
      Object.keys(itemsByCategory).forEach(function (key) {
        itemsByCategory[key].sort(function (a, b) {
          return a.item.name.localeCompare(b.item.name, 'de');
        });
      });
      const hasUncategorized = 0 < (itemsByCategory[''] || []).length;

      let html = '';

      /* ---- add form ---- */
      html +=
        `<div class="card mb-3 shadow-sm">
        <div class="card-header">${escapeHtml(i18n.t('prices.title'))}</div>
        <div class="card-body">
          <form
            class="align-items-end g-2 row"
            id="price-form">
            <div class="col-md-3 col-sm-4">
              <label
                class="form-label"
                for="price-name">${escapeHtml(i18n.t('prices.ingredient'))}
              </label>
              <input
                class="form-control"
                id="price-name"
                maxlength="${MAX_TEXT_LENGTH}"
                type="text">
            </div>
            <div class="col-md-2 col-sm-2">
              <label
                class="form-label"
                for="price-qty">${escapeHtml(i18n.t('prices.quantity'))}
              </label>
              <input
                class="form-control"
                id="price-qty"
                inputmode="decimal"
                min="0"
                step="any"
                type="number">
            </div>
            <div class="col-md-2 col-sm-2">
              <label
                class="form-label"
                for="price-unit">${escapeHtml(i18n.t('prices.unit'))}
              </label>
              <input
                class="form-control"
                id="price-unit"
                maxlength="${MAX_TEXT_LENGTH}"
                type="text">
            </div>
            <div class="col-md-3 col-sm-4">
              <label
                class="form-label"
                for="price-category">${escapeHtml(
                  i18n.t('prices.category')
                )}
              </label>
              <input
                class="form-control"
                id="price-category"
                list="category-names"
                maxlength="${MAX_TEXT_LENGTH}"
                type="text">
            </div>
            <div class="col-md-2 col-sm-2">
              <label
                class="form-label"
                for="price-value">${escapeHtml(i18n.t('prices.price'))}
              </label>
              <input
                class="form-control"
                id="price-value"
                min="0"
                step="0.01"
                type="number">
            </div>
            <div class="col-12 col-md-auto">
              <button
                class="btn btn-primary"
                type="submit">${escapeHtml(i18n.t('prices.add'))}
              </button>
            </div>
          </form>
          <form
            class="align-items-center d-flex gap-2 mt-2"
            id="category-form">
            <input
              class="form-control form-control-sm"
              id="category-name"
              list="category-names"
              maxlength="${MAX_TEXT_LENGTH}"
              placeholder="${escapeHtml(
                i18n.t('prices.addCategoryPlaceholder')
              )}"
              type="text">
            <button
              class="btn btn-outline-secondary btn-sm"
              type="submit">${escapeHtml(i18n.t('prices.addCategory'))}
            </button>
          </form>
          <div class="form-text">${escapeHtml(i18n.t('prices.hint'))}</div>
        </div>
      </div>`;

      /* ---- category suggestions (datalist) ---- */
      html +=
        '<datalist id="category-names">' +
        categorySuggestions(app) +
        '</datalist>';

      /* ---- editable table, grouped by category ---- */
      html +=
        '<div class="card shadow-sm">' +
        '<div class="table-responsive">' +
        '<table class="align-middle mb-0 table table-hover">' +
        '<thead><tr>' +
        '<th>' + escapeHtml(i18n.t('prices.ingredient')) + '</th>' +
        '<th>' + escapeHtml(i18n.t('prices.quantity')) + '</th>' +
        '<th>' + escapeHtml(i18n.t('prices.unit')) + '</th>' +
        '<th>' + escapeHtml(i18n.t('prices.category')) + '</th>' +
        '<th class="text-end">' +
        escapeHtml(i18n.t('prices.price')) +
        '</th>' +
        '<th></th></tr></thead><tbody id="price-rows">';

      categoryNames.forEach(function (category) {
        html += categoryHeadingHtml(app, category, false);

        (itemsByCategory[category] || []).forEach(function (entry) {
          html += Views.prices.itemRowHtml(app, entry);
        });
      });

      if (hasUncategorized) {
        html += categoryHeadingHtml(app, '', true);

        itemsByCategory[''].forEach(function (entry) {
          html += Views.prices.itemRowHtml(app, entry);
        });
      }

      html += '</tbody></table></div></div>';

      /* ---- delete category modal ---- */
      html +=
        `<div
          class="modal"
          id="category-delete-modal"
          tabindex="-1">
          <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
              <div class="modal-header">
                <h5
                  class="modal-title"
                  id="category-delete-title"></h5>
                <button
                  aria-label="${escapeHtml(i18n.t('common.cancel'))}"
                  class="btn-close"
                  data-bs-dismiss="modal"
                  type="button"></button>
              </div>
              <div
                class="modal-body"
                id="category-delete-text"></div>
              <div class="modal-footer">
                <button
                  class="btn btn-outline-secondary"
                  id="category-delete-keep"
                  type="button"></button>
                <button
                  class="btn btn-danger"
                  id="category-delete-with-items"
                  type="button"></button>
              </div>
            </div>
          </div>
        </div>`;

      const view = document.getElementById('view');
      view.innerHTML = html;

      /* ---- add entry ---- */
      document
        .getElementById('price-form')
        .addEventListener('submit', function (event) {
          event.preventDefault();
          const name = document.getElementById('price-name').value.trim();
          const qtyValue = document.getElementById('price-qty').value;
          const unit = document.getElementById('price-unit').value.trim();
          const category = document
            .getElementById('price-category')
            .value.trim();
          const value = document.getElementById('price-value').value;

          if ('' === name) {
            // The missing required field receives the focus.
            document.getElementById('price-name').focus();

            return;
          }
          const quantity = parseFloat(qtyValue);
          const price = parseFloat(value);
          const result = model.addPriceItem(
            name,
            isNaN(quantity) || 0 > quantity ? 0 : quantity,
            unit,
            category,
            isNaN(price) || 0 > price ? 0 : price
          );

          if (!result.ok) {
            window.alert(i18n.t('prices.error.duplicateName'));

            return;
          }
          model.ensureCategory(category);
          app.scheduleSave();
          Views.prices.render(app);
        });

      /* ---- add category ---- */
      document
        .getElementById('category-form')
        .addEventListener('submit', function (event) {
          event.preventDefault();
          const name = document.getElementById('category-name').value.trim();

          if ('' === name) {
            // The missing required field receives the focus.
            document.getElementById('category-name').focus();

            return;
          }

          const result = model.addCategory(name);

          if (!result.ok) {
            window.alert(i18n.t('prices.error.duplicateCategory'));

            return;
          }
          app.scheduleSave();
          Views.prices.render(app);
        });

      /* ---- edit entries (live) ---- */
      view
        .querySelectorAll('#price-rows tr[data-index]')
        .forEach(function (tr) {
          const index = Number(tr.dataset.index);
          const categoryInput = tr.querySelector('.price-category');
          const nameInput = tr.querySelector('.price-name');
          const qtyInput = tr.querySelector('.price-qty');
          const unitInput = tr.querySelector('.price-unit');
          const valueInput = tr.querySelector('.price-value');

          // The name is committed on change - duplicates are rejected
          // and the input reverts to the stored value.
          nameInput.addEventListener('change', function () {
            const result = model.setPriceItemName(index, nameInput.value);

            if (!result.ok) {
              window.alert(i18n.t('prices.error.duplicateName'));
              nameInput.value = model.priceList[index].name;

              return;
            }
            app.scheduleSave();
          });
          // Quantity / unit / price commit on change (not per keystroke) -
          // each commit is one audit log entry.
          qtyInput.addEventListener('change', function () {
            const quantity = parseFloat(qtyInput.value);

            model.updatePriceItem(index, {
              quantity: isNaN(quantity) || 0 > quantity ? 0 : quantity,
            });
            app.scheduleSave();
          });
          unitInput.addEventListener('change', function () {
            model.updatePriceItem(index, { unit: unitInput.value });
            app.scheduleSave();
          });
          categoryInput.addEventListener('change', function () {
            // The category re-groups the table -> re-render.
            model.updatePriceItem(index, {
              category: categoryInput.value.trim(),
            });
            model.ensureCategory(categoryInput.value.trim());
            app.scheduleSave();
            Views.prices.render(app);
          });
          valueInput.addEventListener('change', function () {
            const price = parseFloat(valueInput.value);

            model.updatePriceItem(index, {
              price: isNaN(price) || 0 > price ? 0 : price,
            });
            app.scheduleSave();
          });
          tr
            .querySelector('.price-remove')
            .addEventListener('click', function () {
              model.removePriceItem(index);
              app.scheduleSave();
              Views.prices.render(app);
            });
        });

      /* ---- category heading: rename / delete ---- */
      view.querySelectorAll('.cat-edit').forEach(function (button) {
        button.addEventListener('click', function () {
          editingCategory = button.dataset.category;
          Views.prices.render(app);
        });
      });
      const renameInput = view.querySelector('.cat-rename');

      if (renameInput) {
        view
          .querySelector('.cat-rename-save')
          .addEventListener('click', function () {
            const result = model.renameCategory(
              editingCategory,
              renameInput.value
            );

            if (!result.ok) {
              window.alert(i18n.t('prices.error.duplicateCategory'));
            }
            editingCategory = null;
            Views.prices.render(app);
          });
        view
          .querySelector('.cat-rename-cancel')
          .addEventListener('click', function () {
            editingCategory = null;
            Views.prices.render(app);
          });
      }
      view.querySelectorAll('.cat-delete').forEach(function (button) {
        button.addEventListener('click', function () {
          const category = button.dataset.category;
          const count = model.priceList.filter(function (item) {
            return item.category === category;
          }).length;

          document
            .getElementById('category-delete-title')
            .textContent = i18n.t('prices.deleteCategoryTitle', {
              name: category,
            });
          document
            .getElementById('category-delete-text')
            .textContent = i18n.t('prices.deleteCategoryText', {
              count: count,
              name: category,
            });
          document.getElementById('category-delete-keep').textContent =
            i18n.t('prices.deleteCategoryKeep');
          document
            .getElementById('category-delete-with-items')
            .textContent = i18n.t('prices.deleteCategoryWithItems');

          // The modal element intentionally carries no "fade" class:
          // show() and hide() must finish synchronously, because the
          // view is re-rendered right after hide().
          const modal = new bootstrap.Modal(
            document.getElementById('category-delete-modal')
          );

          document.getElementById(
            'category-delete-keep'
          ).onclick = function () {
            model.removeCategory(category, false);
            modal.hide();
            app.scheduleSave();
            Views.prices.render(app);
          };
          document.getElementById(
            'category-delete-with-items'
          ).onclick = function () {
            model.removeCategory(category, true);
            modal.hide();
            app.scheduleSave();
            Views.prices.render(app);
          };
          modal.show();
        });
      });
    },

    /** One editable ingredient row of the price table. */
    itemRowHtml(app, entry) {
      const i18n = app.i18n;
      const item = entry.item;
      const index = entry.index;

      return `<tr data-index="${index}">
      <td><input
        class="form-control form-control-sm price-name"
        maxlength="${MAX_TEXT_LENGTH}"
        type="text"
        value="${escapeHtml(item.name)}"></td>
      <td><input
        class="form-control form-control-sm price-qty"
        inputmode="decimal"
        min="0"
        step="any"
        type="number"
        value="${item.quantity}"></td>
      <td><input
        class="form-control form-control-sm price-unit"
        maxlength="${MAX_TEXT_LENGTH}"
        type="text"
        value="${escapeHtml(item.unit)}"></td>
      <td><input
        class="form-control form-control-sm price-category"
        list="category-names"
        maxlength="${MAX_TEXT_LENGTH}"
        type="text"
        value="${escapeHtml(item.category)}"></td>
      <td class="text-end"><input
        class="form-control form-control-sm price-value text-end"
        min="0"
        step="0.01"
        type="number"
        value="${item.price}"></td>
      <td class="text-end">
        <button
          class="btn btn-outline-danger btn-sm price-remove"
          type="button">${escapeHtml(i18n.t('common.remove'))}
        </button>
      </td>
    </tr>`;
    },
  };
})();
