/*
 * js/views/plan.js - "Plan event" view
 * ---------------------------------------------------------------------------
 * The staff enters the event date, an optional title and the ingredient
 * list. When an ingredient name matches a price list entry, the unit
 * (shown read-only next to the quantity), the default quantity and the
 * default price are pre-filled. The price then follows the quantity
 * by factor (price = defaultPrice * qty / defaultQty) until the staff
 * types a manual price, which wins from then on.
 *
 * The assignment preview is recomputed live on every keystroke, so the
 * result is visible BEFORE saving. The draft is kept on the App
 * instance (app.planDraft) until "Save event" is pressed.
 *
 * Registered on the shared namespace as FairShare.Views.plan.
 */

(function () {
  'use strict';

  const Util = window.FairShare.util;
  const escapeHtml = Util.escapeHtml;
  const Fairness = window.FairShare.Fairness;
  const MAX_TEXT_LENGTH = window.FairShare.MAX_TEXT_LENGTH;
  const Views = (window.FairShare.Views = window.FairShare.Views || {});

  /** Add an empty ingredient row and focus its name field. */
  function addIngredientRow(app) {
    app.planDraft.rows.push(freshRow());
    Views.plan.render(app);

    // Move the caret into the new row's name field.
    const names = document.querySelectorAll('#plan-rows tr .ing-name');

    if (0 < names.length) {
      names[names.length - 1].focus();
    }
  }

  /**
   * The Enter key of a complete ingredient row (the name is the only
   * required field): the focus moves to the name field of the next
   * row, and a new row is created when the complete one is last.
   */
  function advanceFromRow(app, rowIndex) {
    const nextName = document.querySelectorAll(
      '#plan-rows tr .ing-name'
    )[rowIndex + 1];

    if (nextName) {
      nextName.focus();

      return;
    }
    addIngredientRow(app);
  }

  /**
   * Pre-fill unit, quantity and price when the typed name matches a
   * price list entry (case-insensitive). Quantity and price are only
   * filled when still empty - never override what the staff typed.
   * The unit is always taken from the list (it is read-only here).
   */
  function autoFillRow(app, rowIndex) {
    const draft = app.planDraft;
    const row = draft.rows[rowIndex];
    const match = matchPriceItem(app, row);

    if (!match) {
      return;
    }

    row.unit = match.unit;

    if ('' === row.quantity) {
      row.quantity = String(match.quantity);
    }

    if ('' === row.price) {
      row.autoPrice = true;
      row.price = String(match.price);
    }

    const tr = document.querySelector(
      '#plan-rows tr[data-row="' + rowIndex + '"]'
    );

    if (tr) {
      const priceInput = tr.querySelector('.ing-price');
      const qtyInput = tr.querySelector('.ing-qty');
      const unit = tr.querySelector('.ing-unit');

      if (qtyInput) {
        qtyInput.value = row.quantity;
      }

      if (unit) {
        unit.classList.toggle('d-none', '' === row.unit);
        unit.textContent = row.unit;
      }

      if (priceInput) {
        priceInput.value = row.price;
      }
    }
  }

  /** Create a fresh planning draft. */
  function freshPlanDraft() {
    return {
      date: Util.todayIso(),
      rows: [freshRow()],
      seed: Math.floor(Math.random() * 0x7fffffff),
      title: '',
    };
  }

  /** One empty ingredient row of the planning draft. */
  function freshRow() {
    return {
      autoPrice: false,
      name: '',
      price: '',
      quantity: '',
      unit: '',
    };
  }

  /** Find the price list entry matching a row's name (case-insensitive). */
  function matchPriceItem(app, row) {
    return (
      app.model.priceList.find(function (item) {
        return (
          item.name.trim().toLowerCase() === row.name.trim().toLowerCase()
        );
      }) || null
    );
  }

  /** Validate the draft and store the event with its assignment. */
  function savePlanEvent(app) {
    const i18n = app.i18n;
    const model = app.model;
    const draft = app.planDraft;
    const activeKids = model.activeKids();

    if (0 === activeKids.length) {
      window.alert(i18n.t('plan.error.noKids'));

      return;
    }

    if (!draft.date) {
      window.alert(i18n.t('plan.error.noDate'));

      return;
    }

    // Every row needs a name and a valid price (empty means 0 EUR).
    for (const row of draft.rows) {
      if ('' === row.name.trim()) {
        window.alert(i18n.t('plan.error.noIngredients'));

        return;
      }

      const price = parseFloat(row.price);

      if ('' !== row.price && (isNaN(price) || 0 > price)) {
        window.alert(i18n.t('plan.error.price', { name: row.name }));

        return;
      }
    }

    const assignments = Fairness.assign({
      activeKids: activeKids.map(function (kid) {
        return { enrolledOn: kid.enrolledOn, id: kid.id };
      }),
      eventDate: draft.date,
      ingredients: draft.rows.map(function (row) {
        return {
          name: row.name.trim(),
          price: '' === row.price ? 0 : parseFloat(row.price),
        };
      }),
      maxPerChild: model.settings.maxIngredientsPerChild,
      priorTotals: model.priorTotals(),
      seed: draft.seed,
    });

    // Place the assigned child id on every ingredient row.
    const ingredients = draft.rows.map(function (row, index) {
      const assignment = assignments.find(function (a) {
        return a.ingredientIndex === index;
      });
      const quantity = parseFloat(row.quantity);

      return {
        childId: assignment ? assignment.childId : '',
        manual: false, // the assignment is automatic, not a manual edit
        name: row.name.trim(),
        price: '' === row.price ? 0 : parseFloat(row.price),
        quantity: isNaN(quantity) ? 0 : quantity,
        unit: row.unit,
      };
    });

    if (draft.eventId) {
      model.updateEvent(draft.eventId, {
        date: draft.date,
        ingredients: ingredients,
        title: draft.title.trim(),
      });
      app.showToast(i18n.t('plan.updated'));
    } else {
      model.addEvent({
        date: draft.date,
        ingredients: ingredients,
        seed: draft.seed,
        title: draft.title.trim(),
      });
      app.showToast(i18n.t('plan.saved'));
    }
    app.scheduleSave();
    app.planDraft = null;
    app.switchView(draft.eventId ? 'history' : 'overview');
  }

  /**
   * Recompute the live assignment preview and write the result into the
   * "Brought by" column. Only the result cells are updated - the input
   * fields keep their focus while the staff types.
   */
  function updatePlanPreview(app) {
    const i18n = app.i18n;
    const model = app.model;
    const draft = app.planDraft;
    const activeKids = model.activeKids();
    const warningBox = document.getElementById('plan-warning');
    const assignedCells = document.querySelectorAll(
      '#plan-rows tr .ing-assigned'
    );

    if (!warningBox) {
      return; // the view has already been switched away
    }

    // A row counts when it has a name and a valid (or empty) price.
    const rows = draft.rows.map(function (row, index) {
      const price = parseFloat(row.price);

      return {
        index: index,
        name: row.name.trim(),
        price: isNaN(price) || 0 > price ? 0 : price,
        valid:
          '' !== row.name.trim() &&
          ('' === row.price || !isNaN(price)),
      };
    });
    const usableRows = rows.filter(function (row) {
      return row.valid;
    });

    // Warnings: no children at all, or more ingredients than children.
    if (0 === activeKids.length) {
      warningBox.textContent = i18n.t('plan.error.noKids');
      warningBox.classList.remove('d-none');
    } else if (usableRows.length > activeKids.length) {
      warningBox.textContent = i18n.t('plan.warning.moreThanKids');
      warningBox.classList.remove('d-none');
    } else {
      warningBox.classList.add('d-none');
    }

    if (0 === activeKids.length || 0 === usableRows.length) {
      assignedCells.forEach(function (cell) {
        cell.textContent = '-';
        cell.classList.add('text-body-secondary');
      });

      return;
    }

    const assignments = Fairness.assign({
      activeKids: activeKids.map(function (kid) {
        return { enrolledOn: kid.enrolledOn, id: kid.id };
      }),
      eventDate: draft.date || Util.todayIso(),
      ingredients: usableRows.map(function (row) {
        return { name: row.name, price: row.price };
      }),
      maxPerChild: model.settings.maxIngredientsPerChild,
      priorTotals: model.priorTotals(),
      seed: draft.seed,
    });

    // The assignment is indexed by the position inside usableRows; map
    // it back to the DOM row index.
    const cellByPosition = new Map();
    usableRows.forEach(function (row, position) {
      cellByPosition.set(position, assignedCells[row.index]);
    });

    assignments.forEach(function (assignment, position) {
      const cell = cellByPosition.get(position);
      const kid = model.kidById(assignment.childId);

      if (cell && kid) {
        cell.textContent = kid.name;
        cell.classList.remove('text-body-secondary');
      }
    });
  }

  /**
   * Re-run the price factor after the quantity changed:
   *   price = defaultPrice * quantity / defaultQuantity
   * Only when the price is still an auto value (row.autoPrice) and the
   * name matches a price list entry. A manually typed price wins.
   */
  function updateRowPrice(app, rowIndex) {
    const row = app.planDraft.rows[rowIndex];
    const match = matchPriceItem(app, row);

    if (!row.autoPrice || !match) {
      return;
    }

    const price = Util.priceForQuantity(
      match.price,
      match.quantity,
      parseFloat(row.quantity)
    );

    if (null === price) {
      return;
    }

    row.price = String(price);

    const input = document.querySelectorAll('#plan-rows tr .ing-price')[
      rowIndex
    ];

    if (input) {
      input.value = row.price;
    }
  }

  Views.plan = {
    /**
     * Render the planning view.
     *
     * @param {object} app - the App instance
     */
    render(app) {
      if (!app.planDraft) {
        app.planDraft = freshPlanDraft();
      }

      const i18n = app.i18n;
      const draft = app.planDraft;

      let html = '';

      /* ---- edit mode banner (loading a saved event) ---- */
      if (draft.eventId) {
        html +=
          `<div class="alert alert-info d-flex flex-wrap align-items-center gap-2 mb-3 py-2">
          <span><strong>${escapeHtml(i18n.t('plan.editing'))}</strong>
            ${escapeHtml(draft.title || '')}
            (${escapeHtml(i18n.formatDate(draft.date))})</span>
          <button
            class="btn btn-outline-secondary btn-sm ms-auto"
            id="btn-cancel-edit"
            type="button">${escapeHtml(i18n.t('common.cancel'))}
          </button>
        </div>`;
      }

      /* ---- date + title ---- */
      html +=
        `<div class="card mb-3 shadow-sm"><div class="card-body">
        <div class="g-2 row">
          <div class="col-md-3 col-sm-4">
            <label
              class="form-label"
              for="plan-date">${escapeHtml(i18n.t('plan.date'))}
            </label>
            <input
              class="form-control"
              id="plan-date"
              type="date"
              value="${escapeHtml(draft.date)}">
          </div>
          <div class="col">
            <label
              class="form-label"
              for="plan-title">${escapeHtml(i18n.t('plan.name'))}
            </label>
            <input
              class="form-control"
              id="plan-title"
              maxlength="${MAX_TEXT_LENGTH}"
              placeholder="${escapeHtml(i18n.t('plan.namePlaceholder'))}"
              type="text"
              value="${escapeHtml(draft.title)}">
          </div>
        </div>
      </div></div>`;

      /* ---- ingredient table with the live preview ---- */
      html +=
        `<div class="card mb-3 shadow-sm">
        <div class="card-header">${escapeHtml(i18n.t('plan.ingredients'))}</div>
        <div class="card-body">
          <div class="table-responsive"><table class="align-middle mb-2 table">
            <thead><tr>
              <th>${escapeHtml(i18n.t('plan.ingredientName'))}</th>
              <th>${escapeHtml(i18n.t('plan.quantity'))}</th>
              <th class="text-end">${escapeHtml(i18n.t('plan.price'))}</th>
              <th>${escapeHtml(i18n.t('plan.assignedTo'))}</th>
              <th></th>
            </tr></thead><tbody id="plan-rows">`;

      draft.rows.forEach(function (row, index) {
        const unitClasses =
          '' === row.unit
            ? 'd-none ing-unit input-group-text'
            : 'ing-unit input-group-text';

        html +=
          `<tr data-row="${index}">
          <td style="min-width: 11rem">
            <input
              class="form-control form-control-sm ing-name"
              list="ingredient-names"
              maxlength="${MAX_TEXT_LENGTH}"
              type="text"
              value="${escapeHtml(row.name)}">
          </td>
          <td style="min-width: 8rem">
            <div class="input-group input-group-sm">
              <input
                class="form-control ing-qty"
                inputmode="decimal"
                min="0"
                step="any"
                type="number"
                value="${escapeHtml(row.quantity)}">
              <span class="${unitClasses}">${escapeHtml(row.unit)}</span>
            </div>
          </td>
          <td style="min-width: 6rem">
            <input
              class="form-control form-control-sm ing-price text-end"
              min="0"
              step="0.01"
              type="number"
              value="${'' === row.price ? '' : escapeHtml(row.price)}">
          </td>
          <td class="ing-assigned text-body-secondary">-</td>
          <td>
            <button
              class="btn btn-outline-danger btn-sm ing-remove"
              type="button">${escapeHtml(i18n.t('common.remove'))}
            </button>
          </td>
        </tr>`;
      });

      html +=
        `</tbody></table></div>
          <div class="form-text">${escapeHtml(i18n.t('plan.hint'))}</div>
          <div
            class="alert alert-warning d-none mt-2 py-1"
            id="plan-warning">
          </div>
          <div class="d-flex flex-wrap gap-2 mt-2">
            <button
              class="btn btn-outline-secondary btn-sm"
              id="btn-add-ingredient"
              type="button">${escapeHtml(i18n.t('plan.addIngredient'))}
            </button>
            <button
              class="btn btn-primary btn-sm"
              id="btn-save-event"
              type="button">${escapeHtml(
                draft.eventId
                  ? i18n.t('plan.saveChanges')
                  : i18n.t('plan.save')
              )}
            </button>
          </div>
        </div></div>`;

      const view = document.getElementById('view');
      view.innerHTML = html;

      /* ---- price list names as ingredient suggestions ---- */
      document.getElementById('ingredient-names').innerHTML = app.model
        .priceList.map(function (item) {
          return '<option value="' + escapeHtml(item.name) + '">';
        })
        .join('');

      /* ---- date / title inputs ---- */
      document
        .getElementById('plan-date')
        .addEventListener('change', function (event) {
          draft.date = event.target.value;
          updatePlanPreview(app);
        });
      document
        .getElementById('plan-title')
        .addEventListener('change', function (event) {
          draft.title = event.target.value;
        });
      // The Enter key walks the form: date -> title -> first row.
      document
        .getElementById('plan-date')
        .addEventListener('keydown', function (event) {
          if ('Enter' === event.key) {
            document.getElementById('plan-title').focus();
          }
        });
      document
        .getElementById('plan-title')
        .addEventListener('keydown', function (event) {
          if ('Enter' === event.key) {
            const firstName = document.querySelector(
              '#plan-rows tr .ing-name'
            );

            if (firstName) {
              firstName.focus();
            }
          }
        });

      /* ---- ingredient rows (live preview on every change) ---- */
      view.querySelectorAll('#plan-rows tr').forEach(function (tr) {
        const index = Number(tr.dataset.row);
        const nameInput = tr.querySelector('.ing-name');
        const priceInput = tr.querySelector('.ing-price');
        const qtyInput = tr.querySelector('.ing-qty');

        nameInput.addEventListener('input', function () {
          draft.rows[index].name = nameInput.value;
          autoFillRow(app, index);
          updatePlanPreview(app);
        });
        qtyInput.addEventListener('input', function () {
          draft.rows[index].quantity = qtyInput.value;
          updateRowPrice(app, index);
          updatePlanPreview(app);
        });
        priceInput.addEventListener('input', function () {
          draft.rows[index].price = priceInput.value;
          // A manually typed price wins over the quantity factor.
          draft.rows[index].autoPrice = false;
          updatePlanPreview(app);
        });
        // The Enter key of one row: an empty name keeps the focus on
        // the name field (it is the only required one), a filled row
        // moves on to the next one. No preventDefault on purpose -
        // with an open datalist the Enter key must still accept the
        // highlighted suggestion.
        const rowEnter = function (event) {
          if ('Enter' !== event.key) {
            return;
          }

          if ('' === draft.rows[index].name.trim()) {
            nameInput.focus();

            return;
          }
          advanceFromRow(app, index);
        };
        nameInput.addEventListener('keydown', rowEnter);
        qtyInput.addEventListener('keydown', rowEnter);
        priceInput.addEventListener('keydown', rowEnter);
        tr.querySelector('.ing-remove').addEventListener('click', function () {
          draft.rows.splice(index, 1);

          if (0 === draft.rows.length) {
            draft.rows.push(freshRow());
          }
          Views.plan.render(app);
        });
      });

      /* ---- add / save ---- */
      document
        .getElementById('btn-add-ingredient')
        .addEventListener('click', function () {
          addIngredientRow(app);
        });
      document
        .getElementById('btn-save-event')
        .addEventListener('click', function () {
          savePlanEvent(app);
        });

      /* ---- cancel (edit mode only): discard the draft ---- */
      const cancelEdit = document.getElementById('btn-cancel-edit');

      if (cancelEdit) {
        cancelEdit.addEventListener('click', function () {
          app.planDraft = null;
          app.switchView('history');
        });
      }

      updatePlanPreview(app);
    },
  };
})();
