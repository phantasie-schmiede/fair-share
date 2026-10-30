/*
 * js/model.js - the DataModel
 * ---------------------------------------------------------------------------
 * The single source of truth of the app: all kids, events, prices and
 * settings live inside one DataModel instance.
 *
 * Fairness statistics are always DERIVED from the events (never stored
 * on their own), so a manually corrected assignment or an edited price
 * automatically flows into every statistic - nothing can drift apart.
 *
 * Available as FairShare.DataModel in the browser, via module.exports
 * in Node (tests).
 */

(function () {
  'use strict';

  const Util =
    'undefined' !== typeof window && window.FairShare
      ? window.FairShare.util
      : require('./util.js');

  /** Retention window in years (events, log entries, inactive kids). */
  const RETENTION_YEARS = 5;

  /**
   * Maximum sizes of a loaded data file. Real group data stays small
   * (a few hundred events at most); the limits keep a corrupted or
   * foreign file from exhausting the app.
   */
  const LIMITS = {
    events: 1000,
    kids: 200,
    log: 10000,
    priceList: 2000,
  };

  /** Maximum length of a user-supplied text field (names, titles). */
  const MAX_TEXT_LENGTH = 100;

  /** Build the plain initial state object (used by create() and fromRaw()). */
  function blankState() {
    return {
      categories: [],
      events: [],
      kids: [],
      log: [],
      metadata: {
        createdAt: Util.todayIso(),
        kindergartenName: '',
        rev: 0,
        updatedAt: '',
      },
      priceList: [],
      settings: {
        language: 'de',
        maxIngredientsPerChild: 1,
      },
      version: 1,
    };
  }

  /** Shorten a string to the maximum length of a text field. */
  function clipText(text) {
    return MAX_TEXT_LENGTH < text.length ? text.slice(0, MAX_TEXT_LENGTH) : text;
  }

  /**
   * Normalize one ingredient of a saved or edited event (clips the
   * name, keeps the assignment fields).
   *
   * @param {object} ing
   * @returns {object}
   */
  function ingredientFromDefinition(ing) {
    return {
      childId: ing.childId,
      manual: ing.manual,
      name: 'string' === typeof ing.name ? clipText(ing.name) : '',
      price: ing.price,
      quantity: ing.quantity,
      unit: ing.unit,
    };
  }

  /**
   * True when an event can still be edited or deleted: its date is
   * today or later. Past events are final (history must not change).
   *
   * @param {object} event
   * @returns {boolean}
   */
  function isFutureEvent(event) {
    return Util.todayIso() <= event.date;
  }

  /**
   * Resolve a localized value (name, unit or category) into the text of
   * the given language. Plain strings pass through unchanged.
   *
   * @param {*} value - a string or a { de, en } object
   * @param {string} language - 'de' | 'en'
   * @returns {string}
   */
  function localizedText(value, language) {
    if ('object' === typeof value && null !== value) {
      return value[language] || value.de || value.en || '';
    }

    return 'string' === typeof value ? value : '';
  }

  /** True when two names are equal (case-insensitive, trimmed). */
  function sameName(a, b) {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }

  class DataModel {
    /**
     * @param {object} state - the (plain) data state object
     */
    constructor(state) {
      if ('object' !== typeof state || null === state) {
        throw new Error('DataModel requires a state object');
      }

      this.state = state;
    }

    /**
     * Create a fresh model for a brand new group.
     *
     * @param {Array<object>} priceListItems - pre-filled price list,
     *        normally the content of defaults.js; name, unit and
     *        category may be plain strings or { de, en } objects
     * @param {string} [language] - language the localized fields are
     *        resolved into, defaults to 'de'
     * @returns {DataModel}
     */
    static create(priceListItems, language) {
      const state = blankState();

      state.priceList = (priceListItems || []).map((item) => ({
        category: localizedText(item.category, language || 'de'),
        name: localizedText(item.name, language || 'de'),
        price: item.price,
        quantity: 'number' === typeof item.quantity ? item.quantity : 0,
        unit: localizedText(item.unit, language || 'de'),
      }));

      // Seed the category list from the items (unique, alphabetical).
      state.categories = state.priceList
        .map((item) => item.category)
        .filter((category) => '' !== category)
        .filter((category, index, list) => index === list.indexOf(category))
        .sort((a, b) => a.localeCompare(b, 'de'));

      // Remember the language the localized fields were resolved into
      // (a device without a UI preference picks it up at boot).
      state.settings.language = language || 'de';

      return new DataModel(state);
    }

    /**
     * Build a model from imported raw JSON.
     *
     * @param {*} raw
     * @returns {{ok: true, model: DataModel} | {ok: false, error: string}}
     */
    static fromRaw(raw) {
      try {
        return {
          model: new DataModel(normalizeRawState(raw)),
          ok: true,
        };
      } catch (error) {
        return {
          error: error.message,
          ok: false,
        };
      }
    }

    get categories() {
      return this.state.categories;
    }

    get events() {
      return this.state.events;
    }

    get kids() {
      return this.state.kids;
    }

    get log() {
      return this.state.log;
    }

    get metadata() {
      return this.state.metadata;
    }

    get priceList() {
      return this.state.priceList;
    }

    get settings() {
      return this.state.settings;
    }

    /** All children that take part in future assignments. */
    activeKids() {
      return this.kids.filter((kid) => kid.active);
    }

    /**
     * Add a category to the price list.
     *
     * @param {string} name
     * @returns {{ok: boolean}} - ok is false when the category already
     *          exists (names are unique, case-insensitive)
     */
    addCategory(name) {
      const trimmed = clipText(name.trim());

      if (
        '' === trimmed ||
        this.categories.some((category) => sameName(category, trimmed))
      ) {
        return { ok: false };
      }

      this.categories.push(trimmed);
      this.logAction('category.add', { name: trimmed });

      return { ok: true };
    }

    /**
     * Append a new (saved) event.
     *
     * @param {{date: string, title: string, seed: number,
     *          ingredients: Array}} definition
     * @returns {object} the new event
     */
    addEvent(definition) {
      const event = {
        date: definition.date,
        id: Util.generateId('e'),
        ingredients: definition.ingredients.map(ingredientFromDefinition),
        seed: definition.seed,
        title:
          'string' === typeof definition.title
            ? clipText(definition.title)
            : '',
      };

      this.events.push(event);
      this.logAction('event.save', {
        count: event.ingredients.length,
        date: event.date,
        title: event.title || event.date,
        total: event.ingredients.reduce(
          (sum, ing) => sum + (ing.price || 0),
          0
        ),
      });

      return event;
    }

    /**
     * Add a child.
     *
     * @param {string} name
     * @param {string} [enrolledOn] - "YYYY-MM-DD", defaults to today
     * @returns {{ok: true, kid: object} | {ok: false}} - ok is false
     *          when a child with this name already exists (names are
     *          unique, case-insensitive)
     */
    addKid(name, enrolledOn) {
      const clipped = clipText(name);

      if (this.kids.some((kid) => sameName(kid.name, clipped))) {
        return { ok: false };
      }

      const kid = {
        active: true,
        enrolledOn: enrolledOn || Util.todayIso(),
        id: Util.generateId('k'),
        name: clipped,
      };

      this.kids.push(kid);
      this.logAction('kid.add', { name: clipped });

      return { kid: kid, ok: true };
    }

    /** Add a price list entry. */
    addPriceItem(name, quantity, unit, category, price) {
      const clippedCategory = clipText(category);
      const clippedName = clipText(name);
      const clippedUnit = clipText(unit);

      if (
        this.priceList.some((item) => sameName(item.name, clippedName))
      ) {
        return { ok: false };
      }

      this.priceList.push({
        category: clippedCategory,
        name: clippedName,
        price: price,
        quantity: quantity,
        unit: clippedUnit,
      });
      this.logAction('price.add', {
        category: clippedCategory,
        name: clippedName,
        price: price,
        quantity: quantity,
        unit: clippedUnit,
      });

      return { ok: true };
    }

    /** Add a category to the list when it is not there yet. */
    ensureCategory(name) {
      const trimmed = clipText(name.trim());

      if (
        '' !== trimmed &&
        !this.categories.some((category) => sameName(category, trimmed))
      ) {
        this.categories.push(trimmed);
      }
    }

    /** Look up an event by id (null when unknown). */
    eventById(eventId) {
      return this.events.find((event) => event.id === eventId) || null;
    }

    /** True when any saved event assigned at least one ingredient to the child. */
    hasAssignments(kidId) {
      return this.events.some((event) =>
        event.ingredients.some((ing) => ing.childId === kidId)
      );
    }

    /** Look up a child by id (null when unknown). */
    kidById(kidId) {
      return this.kids.find((kid) => kid.id === kidId) || null;
    }

    /**
     * Append one entry to the audit log and apply the retention cap.
     *
     * @param {string} action - stable machine name, e.g. "kid.add"
     * @param {object} [data] - values referenced by the log text
     */
    logAction(action, data) {
      this.state.log.push({
        action: action,
        data: data || {},
        t: new Date().toISOString(),
      });
      this.prune();
    }

    /**
     * Sum up, for every child, everything assigned across all events.
     *
     * @returns {Object.<string, {totalSpent: number, timesAssigned: number}>}
     *          keyed by child id (kids without assignments are absent)
     */
    priorTotals() {
      const totals = {};

      for (const event of this.events) {
        for (const ingredient of event.ingredients) {
          const id = ingredient.childId;

          if (!id) {
            continue;
          }

          if (!totals[id]) {
            totals[id] = {
              timesAssigned: 0,
              totalSpent: 0,
            };
          }

          totals[id].timesAssigned += 1;
          totals[id].totalSpent += ingredient.price;
        }
      }

      return totals;
    }

    /**
     * Apply the retention window: remove events, log entries and
     * deactivated kids older than RETENTION_YEARS. The assignments of
     * a removed kid leave the events with him (an event without
     * ingredients disappears as well), so the history never references
     * a missing child. Active kids are never removed.
     *
     * When anything was removed, log entries document it.
     */
    prune() {
      const cutoff = Util.addYearsIso(Util.todayIso(), -RETENTION_YEARS);
      let eventsPruned = 0;
      let logPruned = 0;
      const kidsPruned = [];

      this.state.events = this.events.filter((event) => {
        const kept = cutoff <= event.date;

        if (!kept) {
          eventsPruned += 1;
        }

        return kept;
      });
      this.state.kids = this.kids.filter((kid) => {
        const expired = false === kid.active && kid.enrolledOn < cutoff;

        if (expired) {
          kidsPruned.push(kid.name);
        }

        return !expired;
      });

      if (0 < kidsPruned.length) {
        const remainingIds = new Set(this.kids.map((kid) => kid.id));
        const before = this.events.length;

        this.state.events = this.events
          .map((event) =>
            Object.assign({}, event, {
              ingredients: event.ingredients.filter(
                (ing) => '' === ing.childId || remainingIds.has(ing.childId)
              ),
            })
          )
          .filter((event) => 0 < event.ingredients.length);

        eventsPruned += before - this.events.length;
      }
      this.state.log = this.log.filter((entry) => {
        const kept = cutoff <= entry.t;

        if (!kept) {
          logPruned += 1;
        }

        return kept;
      });

      if (0 < eventsPruned + logPruned + kidsPruned.length) {
        kidsPruned.forEach((name) => {
          this.state.log.push({
            action: 'kid.prune',
            data: { name: name },
            t: new Date().toISOString(),
          });
        });
        this.state.log.push({
          action: 'retention.prune',
          data: { events: eventsPruned, log: logPruned },
          t: new Date().toISOString(),
        });
      }
    }

    /** Remove a category from the list. */
    removeCategory(name, deleteItems) {
      const count = this.priceList.filter(
        (item) => sameName(item.category, name)
      ).length;

      this.state.categories = this.categories.filter(
        (category) => !sameName(category, name)
      );

      if (true === deleteItems) {
        this.state.priceList = this.priceList.filter(
          (item) => !sameName(item.category, name)
        );
      } else {
        this.priceList.forEach((item) => {
          if (sameName(item.category, name)) {
            item.category = '';
          }
        });
      }
      this.logAction('category.remove', {
        count: count,
        name: name,
        withItems: true === deleteItems,
      });
    }

    /**
     * Delete a FUTURE event. Past events are final (history must not
     * change), so the deletion is refused for them.
     *
     * @param {string} eventId
     * @returns {{ok: boolean}} - ok is false when the event is missing
     *          or in the past
     */
    removeEvent(eventId) {
      const index = this.events.findIndex(
        (event) => eventId === event.id
      );

      if (-1 === index || !isFutureEvent(this.events[index])) {
        return { ok: false };
      }

      const event = this.events[index];

      this.events.splice(index, 1);
      this.logAction('event.delete', {
        count: event.ingredients.length,
        date: event.date,
        title: event.title || event.date,
        total: event.ingredients.reduce(
          (sum, ing) => sum + (ing.price || 0),
          0
        ),
      });

      return { ok: true };
    }

    /** Remove a child entirely (only used when they have no history). */
    removeKid(kidId) {
      const kid = this.kidById(kidId);

      this.state.kids = this.kids.filter((other) => other.id !== kidId);

      if (kid) {
        this.logAction('kid.remove', { name: kid.name });
      }
    }

    /** Remove one price list entry. */
    removePriceItem(index) {
      const item = this.priceList[index];

      this.priceList.splice(index, 1);

      if (item) {
        this.logAction('price.remove', { name: item.name });
      }
    }

    /**
     * Rename a category (the list entry and every item assigned to it).
     *
     * @param {string} oldName
     * @param {string} newName
     * @returns {{ok: boolean}} - ok is false when the new name is empty
     *          or already taken by another category
     */
    renameCategory(oldName, newName) {
      const trimmed = clipText(newName.trim());

      if (
        '' === trimmed ||
        this.categories.some(
          (category) =>
            sameName(category, trimmed) && !sameName(category, oldName)
        )
      ) {
        return { ok: false };
      }

      this.categories.forEach((category, index) => {
        if (sameName(category, oldName)) {
          this.categories[index] = trimmed;
        }
      });
      this.priceList.forEach((item) => {
        if (sameName(item.category, oldName)) {
          item.category = trimmed;
        }
      });
      this.logAction('category.rename', { from: oldName, to: trimmed });

      return { ok: true };
    }

    /**
     * Rename a child. The id stays, so every assignment survives the
     * rename (the log keeps the old name as history).
     *
     * @param {string} kidId
     * @param {string} newName
     * @returns {{ok: boolean}} - ok is false when the name is empty or
     *          already taken by another child (case-insensitive)
     */
    renameKid(kidId, newName) {
      const trimmed = clipText(newName.trim());
      const kid = this.kidById(kidId);

      if (
        !kid ||
        '' === trimmed ||
        this.kids.some(
          (other) => other !== kid && sameName(other.name, trimmed)
        )
      ) {
        return { ok: false };
      }

      const from = kid.name;

      kid.name = trimmed;
      this.logAction('kid.rename', { from: from, to: trimmed });

      return { ok: true };
    }

    /**
     * Reassign an ingredient to another child (manual correction).
     * Flags the ingredient as manually adjusted. Past events are
     * final, so the correction is refused for them.
     */
    setIngredientChild(eventId, ingredientIndex, childId) {
      const event = this.eventById(eventId);
      const ingredient = event ? event.ingredients[ingredientIndex] : null;

      if (ingredient && isFutureEvent(event)) {
        const fromKid = this.kidById(ingredient.childId);
        const toKid = this.kidById(childId);

        ingredient.childId = childId;
        ingredient.manual = true;
        this.logAction('event.assign', {
          event: event.title || event.date,
          from: fromKid ? fromKid.name : '',
          name: ingredient.name,
          to: toKid ? toKid.name : '',
        });
      }
    }

    /**
     * Change the price of a saved ingredient (manual correction,
     * e.g. the receipt said 1.99 EUR instead of 2.99 EUR). Past
     * events are final, so the correction is refused for them.
     */
    setIngredientPrice(eventId, ingredientIndex, price) {
      const event = this.eventById(eventId);
      const ingredient = event ? event.ingredients[ingredientIndex] : null;

      if (ingredient && isFutureEvent(event)) {
        const from = ingredient.price;

        ingredient.price = price;
        ingredient.manual = true;
        this.logAction('event.price', {
          event: event.title || event.date,
          from: from,
          name: ingredient.name,
          to: price,
        });
      }
    }

    /** Activate / deactivate a child (deactivated kids keep their history). */
    setKidActive(kidId, active) {
      const kid = this.kidById(kidId);

      if (kid) {
        kid.active = active;
        this.logAction(active ? 'kid.activate' : 'kid.deactivate', {
          name: kid.name,
        });
      }
    }

    /**
     * Set the kindergarten name (app metadata). Empty clears the
     * name again. No log entry when the value does not change.
     *
     * @param {string} name
     * @returns {{ok: boolean}} - always true (empty is allowed)
     */
    setKindergartenName(name) {
      const trimmed = clipText(name.trim());

      if (trimmed === this.state.metadata.kindergartenName) {
        return { ok: true };
      }

      this.state.metadata.kindergartenName = trimmed;
      this.logAction('kindergarten.name', { name: trimmed });

      return { ok: true };
    }

    /**
     * Rename one price list entry.
     *
     * @param {number} index
     * @param {string} name
     * @returns {{ok: boolean}} - ok is false when the name is empty or
     *          another entry already has it (names are unique,
     *          case-insensitive)
     */
    setPriceItemName(index, name) {
      const trimmed = clipText(name.trim());
      const item = this.priceList[index];

      if (
        !item ||
        '' === trimmed ||
        this.priceList.some(
          (other) => other !== item && sameName(other.name, trimmed)
        )
      ) {
        return { ok: false };
      }

      const from = item.name;

      item.name = trimmed;
      this.logAction('price.rename', { from: from, to: trimmed });

      return { ok: true };
    }

    /**
     * Set the revision counter (concurrency guard). The counter only
     * ever moves forward: lower values are rejected.
     *
     * @param {number} rev
     * @returns {{ok: boolean}} - ok is false for negative or
     *          non-integer values
     */
    setRev(rev) {
      if (
        'number' !== typeof rev ||
        0 > rev ||
        0 !== rev % 1 ||
        rev < this.state.metadata.rev
      ) {
        return { ok: false };
      }

      this.state.metadata.rev = rev;

      return { ok: true };
    }

    /** The plain state object (for JSON serialization). */
    toJson() {
      return this.state;
    }

    /**
     * Replace a FUTURE event in place (date, title, ingredients).
     * The ingredients already carry their (recomputed) assignment.
     * Past events are final and reject the update.
     *
     * @param {string} eventId
     * @param {{date: string, title: string, ingredients: Array}} definition
     * @returns {{ok: boolean}} - ok is false when the event is missing
     *          or in the past
     */
    updateEvent(eventId, definition) {
      const index = this.events.findIndex(
        (event) => eventId === event.id
      );

      if (-1 === index || !isFutureEvent(this.events[index])) {
        return { ok: false };
      }

      const event = this.events[index];

      event.date = definition.date;
      event.ingredients = definition.ingredients.map(
        ingredientFromDefinition
      );
      event.title =
        'string' === typeof definition.title
          ? clipText(definition.title)
          : '';
      this.logAction('event.update', {
        count: event.ingredients.length,
        date: event.date,
        title: event.title || event.date,
        total: event.ingredients.reduce(
          (sum, ing) => sum + (ing.price || 0),
          0
        ),
      });

      return { ok: true };
    }

    /** Update one price list entry in place (logs each changed field). */
    updatePriceItem(index, fields) {
      const item = this.priceList[index];

      if (item) {
        // Text fields are limited like every other input.
        for (const field of ['category', 'name', 'unit']) {
          if ('string' === typeof fields[field]) {
            fields[field] = clipText(fields[field]);
          }
        }

        for (const field of Object.keys(fields)) {
          this.logAction('price.update', {
            field: field,
            from: item[field],
            name: item.name,
            to: fields[field],
          });
        }
        Object.assign(item, fields);
      }
    }
  }

  /**
   * Validate and normalize a raw object read from a JSON file.
   *
   * Strict on the top level (a corrupted foreign file must not silently
   * replace real data), lenient on individual fields (old or hand-edited
   * files still load with sensible defaults).
   *
   * @param {*} raw - anything parsed from JSON
   * @returns {object} the normalized state (plain object)
   * @throws {Error} when the input is not a usable data file
   */
  function normalizeRawState(raw) {
    if ('object' !== typeof raw || null === raw || Array.isArray(raw)) {
      throw new Error('The file is not a JSON object.');
    }

    if (1 !== raw.version) {
      // Bump here when the on-disk format changes.
      throw new Error(
        'Unsupported data version: ' + raw.version + ' (expected 1).'
      );
    }

    if (Array.isArray(raw.events) && LIMITS.events < raw.events.length) {
      throw new Error(
        'Too many events: ' + raw.events.length + ' (max ' + LIMITS.events + ').'
      );
    }
    if (Array.isArray(raw.kids) && LIMITS.kids < raw.kids.length) {
      throw new Error(
        'Too many kids: ' + raw.kids.length + ' (max ' + LIMITS.kids + ').'
      );
    }
    if (Array.isArray(raw.log) && LIMITS.log < raw.log.length) {
      throw new Error(
        'Too many log entries: ' +
          raw.log.length +
          ' (max ' +
          LIMITS.log +
          ').'
      );
    }
    if (
      Array.isArray(raw.priceList) &&
      LIMITS.priceList < raw.priceList.length
    ) {
      throw new Error(
        'Too many price list entries: ' +
          raw.priceList.length +
          ' (max ' +
          LIMITS.priceList +
          ').'
      );
    }

    const state = blankState();

    // --- metadata (all optional, keep whatever is there) ---------------
    if (raw.metadata && 'object' === typeof raw.metadata) {
      state.metadata.createdAt =
        'string' === typeof raw.metadata.createdAt
          ? raw.metadata.createdAt
          : state.metadata.createdAt;
      state.metadata.kindergartenName =
        'string' === typeof raw.metadata.kindergartenName
          ? raw.metadata.kindergartenName
          : '';
      // The revision counter (concurrency guard). Files written by
      // older app versions have none - they count as revision 0.
      state.metadata.rev =
        'number' === typeof raw.metadata.rev &&
        0 <= raw.metadata.rev &&
        0 === raw.metadata.rev % 1
          ? raw.metadata.rev
          : 0;
      state.metadata.updatedAt =
        'string' === typeof raw.metadata.updatedAt
          ? raw.metadata.updatedAt
          : '';
    }

    // --- kids -----------------------------------------------------------
    if (Array.isArray(raw.kids)) {
      state.kids = raw.kids
        .filter((kid) => 'object' === typeof kid && null !== kid)
        .map((kid) => ({
          active: false !== kid.active, // default: active
          enrolledOn:
            'string' === typeof kid.enrolledOn
              ? kid.enrolledOn
              : Util.todayIso(),
          id:
            'string' === typeof kid.id && kid.id
              ? kid.id
              : Util.generateId('k'),
          name:
            'string' === typeof kid.name && '' !== kid.name.trim()
              ? clipText(kid.name)
              : '(unnamed)',
        }));
    }

    // --- price list -------------------------------------------------------
    if (Array.isArray(raw.priceList)) {
      state.priceList = raw.priceList
        .filter((item) => 'object' === typeof item && null !== item)
        .map((item) => ({
          category:
            'string' === typeof item.category ? clipText(item.category) : '',
          name: 'string' === typeof item.name ? clipText(item.name) : '',
          price:
            'number' === typeof item.price && 0 <= item.price
              ? item.price
              : 0,
          quantity: 'number' === typeof item.quantity ? item.quantity : 0,
          unit: 'string' === typeof item.unit ? item.unit : '',
        }));
    }

    // --- categories -----------------------------------------------------------
    if (Array.isArray(raw.categories)) {
      state.categories = raw.categories
        .filter((category) => 'string' === typeof category)
        .map((category) => clipText(category))
        .filter((category, index, list) => index === list.indexOf(category));
    }

    // --- events -------------------------------------------------------------
    if (Array.isArray(raw.events)) {
      state.events = raw.events
        .filter((event) => 'object' === typeof event && null !== event)
        .map((event) => ({
          date: 'string' === typeof event.date ? event.date : Util.todayIso(),
          id:
            'string' === typeof event.id && event.id
              ? event.id
              : Util.generateId('e'),
          ingredients: Array.isArray(event.ingredients)
            ? event.ingredients
                .filter((ing) => 'object' === typeof ing && null !== ing)
                .map((ing) => ({
                  childId: 'string' === typeof ing.childId ? ing.childId : '',
                  manual: true === ing.manual,
                  name: 'string' === typeof ing.name ? clipText(ing.name) : '',
                  price:
                    'number' === typeof ing.price && 0 <= ing.price
                      ? ing.price
                      : 0,
                  quantity:
                    'number' === typeof ing.quantity ? ing.quantity : 0,
                  unit: 'string' === typeof ing.unit ? ing.unit : '',
                }))
            : [],
          seed: 'number' === typeof event.seed ? event.seed : 0,
          title: 'string' === typeof event.title ? clipText(event.title) : '',
        }));
    }

    // --- log --------------------------------------------------------------------
    if (Array.isArray(raw.log)) {
      state.log = raw.log
        .filter((entry) => 'object' === typeof entry && null !== entry)
        .map((entry) => ({
          action: 'string' === typeof entry.action ? entry.action : '',
          data:
            entry.data &&
            'object' === typeof entry.data &&
            !Array.isArray(entry.data)
              ? entry.data
              : {},
          t: 'string' === typeof entry.t ? entry.t : '',
        }));
    }

    // --- settings ---------------------------------------------------------------
    if (raw.settings && 'object' === typeof raw.settings) {
      const s = raw.settings;

      if (
        'number' === typeof s.maxIngredientsPerChild &&
        1 <= s.maxIngredientsPerChild
      ) {
        state.settings.maxIngredientsPerChild =
          Math.floor(s.maxIngredientsPerChild);
      }

      if ('de' === s.language || 'en' === s.language) {
        state.settings.language = s.language;
      }
    }

    // The retention cap also applies to loaded (imported) data files.
    new DataModel(state).prune();

    return state;
  }

  /* The export footer stays at the bottom by convention. */
  const api = {
    DataModel: DataModel,
    MAX_TEXT_LENGTH: MAX_TEXT_LENGTH,
  };

  if ('undefined' !== typeof window) {
    window.FairShare = window.FairShare || {};
    Object.assign(window.FairShare, api);
  }

  if ('undefined' !== typeof module && module.exports) {
    module.exports = api;
  }
})();
