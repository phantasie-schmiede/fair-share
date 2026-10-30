/*
 * tests/model.test.js
 * ---------------------------------------------------------------------------
 * Unit tests for the DataModel: initial state, import validation,
 * mutations and derived statistics.
 *
 * Run with:  node --test
 */

'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { DataModel } = require('../js/model.js');
const { generateId } = require('../js/util.js');

/* Initial state ------------------------------------------------------------ */

test('create builds a version 1 state with sane defaults', () => {
  const items = [
    {
      name: 'Cheese',
      quantity: 200,
      unit: 'g',
      category: 'Dairy',
      price: 2.49,
    },
    {
      name: 'Cucumber',
      quantity: 1,
      unit: 'piece',
      category: 'Vegetables',
      price: 0.79,
    },
  ];
  const model = DataModel.create(items);
  const state = model.toJson();

  assert.equal(state.version, 1);
  assert.equal(model.kids.length, 0);
  assert.equal(model.events.length, 0);
  assert.equal(state.priceList.length, 2);
  assert.deepEqual(state.priceList[0], items[0]);
  assert.deepEqual(state.categories, ['Dairy', 'Vegetables']);
  assert.equal(state.settings.maxIngredientsPerChild, 1);
  assert.ok(10 === state.metadata.createdAt.length); // ISO date

  // The resolved language is persisted (default: 'de').
  assert.equal(state.settings.language, 'de');

  // An explicit language is stored as well (EN-UI fresh files must
  // carry settings.language 'en', not the blankState default).
  assert.equal(DataModel.create(items, 'en').settings.language, 'en');
});

test('create seeds the category list from the items (unique, sorted)', () => {
  const model = DataModel.create([
    { name: 'A', quantity: 1, unit: 'piece', category: 'Fruit', price: 1 },
    { name: 'B', quantity: 1, unit: 'piece', category: 'Vegetables', price: 1 },
    { name: 'C', quantity: 1, unit: 'piece', category: 'Fruit', price: 1 },
    { name: 'D', quantity: 1, unit: 'piece', category: '', price: 1 },
  ]);

  assert.deepEqual(model.categories, ['Fruit', 'Vegetables']);
});

test('create resolves localized price list items into the chosen language', () => {
  const items = [
    {
      name: { de: 'Käse, gerieben', en: 'Cheese, grated' },
      quantity: 200,
      unit: { de: 'g', en: 'g' },
      category: { de: 'Milchprodukte & Eier', en: 'Dairy & eggs' },
      price: 2.49,
    },
  ];

  assert.deepEqual(DataModel.create(items, 'en').priceList[0], {
    category: 'Dairy & eggs',
    name: 'Cheese, grated',
    price: 2.49,
    quantity: 200,
    unit: 'g',
  });
  assert.deepEqual(DataModel.create(items, 'de').priceList[0], {
    category: 'Milchprodukte & Eier',
    name: 'Käse, gerieben',
    price: 2.49,
    quantity: 200,
    unit: 'g',
  });
  // Without a language the default ('de') is used.
  assert.equal(
    DataModel.create(items).priceList[0].name,
    'Käse, gerieben'
  );
});

test('the price list is copied, not referenced (mutating the seed is safe)', () => {
  const items = [
    {
      name: 'Cheese',
      quantity: 200,
      unit: 'g',
      category: 'Dairy',
      price: 2.49,
    },
  ];
  const model = DataModel.create(items);
  items[0].price = 99; // simulate a buggy caller mutating the seed

  assert.equal(model.priceList[0].price, 2.49);
});

/* Import validation ---------------------------------------------------------- */

test('fromRaw accepts a minimal valid state and fills defaults', () => {
  const result = DataModel.fromRaw({
    events: [
      {
        date: '2026-11-12',
        ingredients: [{ childId: 'k_x', name: 'Cheese', price: 2.99 }],
      },
    ],
    kids: [{ name: 'Lotte' }],
    version: 1,
  });

  assert.equal(result.ok, true);
  assert.equal(result.model.kids.length, 1);
  assert.ok(result.model.kids[0].id.startsWith('k_')); // invented id
  assert.equal(result.model.kids[0].active, true); // default: active
  assert.ok(10 === result.model.kids[0].enrolledOn.length); // default date
  assert.equal(result.model.events.length, 1);
  assert.ok(result.model.events[0].id.startsWith('e_'));
  assert.equal(result.model.events[0].ingredients[0].manual, false);
  assert.equal(result.model.events[0].ingredients[0].quantity, 0);
  assert.equal(result.model.events[0].ingredients[0].unit, '');
});

test('fromRaw normalizes the revision counter', () => {
  const base = {
    kids: [],
    version: 1,
  };

  // Files from older app versions have no counter - they count as 0.
  assert.equal(DataModel.fromRaw(base).model.metadata.rev, 0);
  assert.equal(
    DataModel.fromRaw({ ...base, metadata: { rev: 7 } }).model.metadata.rev,
    7
  );

  // Invalid values (negative, non-integer, other types) fall back to 0.
  for (const rev of [-1, 1.5, '7', null]) {
    assert.equal(
      DataModel.fromRaw({ ...base, metadata: { rev: rev } })
        .model.metadata.rev,
      0
    );
  }
});

test('fromRaw normalizes price list entries to the full shape', () => {
  const result = DataModel.fromRaw({
    categories: ['Dairy', 'Dairy', 42],
    priceList: [
      { name: 'Cheese', price: 2.49, quantity: 200, unit: 'g' },
      { name: 'Bad', price: -1, unit: 3 },
    ],
    version: 1,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.model.categories, ['Dairy']);
  assert.deepEqual(result.model.priceList[0], {
    category: '',
    name: 'Cheese',
    price: 2.49,
    quantity: 200,
    unit: 'g',
  });
  assert.deepEqual(result.model.priceList[1], {
    category: '',
    name: 'Bad',
    price: 0,
    quantity: 0,
    unit: '',
  });
});

test('fromRaw rejects non-objects, arrays and unknown versions', () => {
  assert.equal(DataModel.fromRaw('garbage').ok, false);
  assert.equal(DataModel.fromRaw(null).ok, false);
  assert.equal(DataModel.fromRaw([1, 2, 3]).ok, false);
  assert.equal(DataModel.fromRaw({ kids: [], version: 2 }).ok, false);
  // no version at all
  assert.equal(DataModel.fromRaw({ kids: [] }).ok, false);
});

test('fromRaw rejects arrays beyond the size limits', () => {
  const manyKids = Array.from({ length: 201 }, (value, index) => ({
    active: true,
    enrolledOn: '2026-01-01',
    id: 'k_' + index,
    name: 'Kid ' + index,
  }));
  const manyEvents = Array.from(
    { length: 1001 },
    (value, index) => ({
      date: '2026-01-01',
      id: 'e_' + index,
      ingredients: [],
      seed: 1,
      title: '',
    })
  );
  const manyPrices = Array.from(
    { length: 2001 },
    (value, index) => ({
      category: '',
      name: 'Item ' + index,
      price: 1,
      quantity: 1,
      unit: 'g',
    })
  );
  const manyLog = Array.from({ length: 10001 }, (value, index) => ({
    action: 'kid.add',
    data: { name: 'Kid ' + index },
    t: '2026-01-01T00:00:00.000Z',
  }));

  assert.equal(
    DataModel.fromRaw({ events: manyEvents, version: 1 }).ok,
    false
  );
  assert.equal(DataModel.fromRaw({ kids: manyKids, version: 1 }).ok, false);
  assert.equal(
    DataModel.fromRaw({ log: manyLog, version: 1 }).ok,
    false
  );
  assert.equal(
    DataModel.fromRaw({ priceList: manyPrices, version: 1 }).ok,
    false
  );
});

test('fromRaw clips over-long user text to 100 characters', () => {
  const result = DataModel.fromRaw({
    categories: ['A'.repeat(150)],
    events: [
      {
        date: '2026-01-01',
        id: 'e1',
        ingredients: [{ childId: '', name: 'B'.repeat(120), price: 1 }],
        seed: 1,
        title: 'C'.repeat(120),
      },
    ],
    kids: [{ active: true, enrolledOn: '2026-01-01', id: 'k1', name: 'D'.repeat(150) }],
    priceList: [
      {
        category: 'E'.repeat(120),
        name: 'F'.repeat(120),
        price: 1,
        quantity: 1,
        unit: 'g',
      },
    ],
    version: 1,
  });

  assert.equal(result.ok, true);
  assert.equal(result.model.kids[0].name.length, 100);
  assert.equal(result.model.events[0].title.length, 100);
  assert.equal(result.model.events[0].ingredients[0].name.length, 100);
  assert.equal(result.model.priceList[0].name.length, 100);
  assert.equal(result.model.priceList[0].category.length, 100);
  assert.equal(result.model.categories[0].length, 100);
});

test('fromRaw normalizes negative or missing prices to zero', () => {
  const result = DataModel.fromRaw({
    events: [
      {
        date: '2026-11-12',
        ingredients: [
          { childId: 'k_a', name: 'Ok', price: 1.5 },
          { childId: 'k_b', name: 'Bad price', price: -3 },
          { childId: 'k_c', name: 'No price' },
        ],
      },
    ],
    version: 1,
  });

  assert.equal(result.ok, true);
  const prices = result.model.events[0].ingredients.map((ing) => ing.price);
  assert.deepEqual(prices, [1.5, 0, 0]);
});

/* Mutations ------------------------------------------------------------------- */

test('addKid and addEvent append to the state', () => {
  const model = DataModel.create(null);
  const added = model.addKid('Lotte', '2025-09-01');
  const kid = added.kid;

  assert.equal(added.ok, true);
  const event = model.addEvent({
    date: '2026-10-30',
    ingredients: [
      {
        childId: kid.id,
        manual: false,
        name: 'Cheese',
        price: 2.99,
        quantity: 200,
        unit: 'g',
      },
    ],
    seed: 42,
    title: 'Italian Day',
  });

  assert.equal(model.kids.length, 1);
  assert.equal(model.events.length, 1);
  assert.ok(kid.id.startsWith('k_'));
  assert.ok(event.id.startsWith('e_'));
  assert.equal(model.hasAssignments(kid.id), true);
});

test('addPriceItem appends an entry with all fields', () => {
  const model = DataModel.create(null);
  const result = model.addPriceItem('Fennel', 200, 'g', 'Vegetables', 1.49);

  assert.equal(result.ok, true);
  assert.deepEqual(model.priceList[0], {
    category: 'Vegetables',
    name: 'Fennel',
    price: 1.49,
    quantity: 200,
    unit: 'g',
  });
});

test('addKid rejects a duplicate name (case-insensitive)', () => {
  const model = DataModel.create(null);

  assert.equal(model.addKid('Lotte').ok, true);
  assert.deepEqual(model.addKid('lotte'), { ok: false });
  assert.deepEqual(model.addKid('Lotte'), { ok: false });
  assert.equal(model.kids.length, 1);
});

test('addPriceItem rejects a duplicate name (case-insensitive)', () => {
  const model = DataModel.create(null);

  assert.equal(model.addPriceItem('Fennel', 200, 'g', 'Vegetables', 1.49).ok, true);
  assert.equal(model.addPriceItem('fennel', 100, 'g', 'Vegetables', 1.29).ok, false);
  assert.equal(model.priceList.length, 1);
});

test('setPriceItemName rejects empty and duplicate names', () => {
  const model = DataModel.create(null);
  model.addPriceItem('Fennel', 200, 'g', 'Vegetables', 1.49);
  model.addPriceItem('Sellerie', 200, 'g', 'Vegetables', 1.29);

  assert.equal(model.setPriceItemName(1, 'Fennel').ok, false);
  assert.equal(model.setPriceItemName(1, '  fennel ').ok, false);
  assert.equal(model.setPriceItemName(1, '').ok, false);
  assert.equal(model.setPriceItemName(1, 'Knoblauch').ok, true);
  assert.equal(model.priceList[1].name, 'Knoblauch');
});

test('setKindergartenName sets, clips and clears the name', () => {
  const model = DataModel.create(null);

  assert.equal(model.metadata.kindergartenName, '');
  assert.deepEqual(model.setKindergartenName('Kita Fair'), { ok: true });
  assert.equal(model.metadata.kindergartenName, 'Kita Fair');
  assert.equal(model.state.log[0].action, 'kindergarten.name');

  // Over-long names are trimmed and clipped to 100 characters.
  assert.deepEqual(model.setKindergartenName('  ' + 'K'.repeat(150) + '  '), {
    ok: true,
  });
  assert.equal(model.metadata.kindergartenName, 'K'.repeat(100));

  // An unchanged value writes no second log entry.
  const count = model.state.log.length;

  assert.deepEqual(model.setKindergartenName('K'.repeat(100)), { ok: true });
  assert.equal(model.state.log.length, count);

  // Empty clears the name again.
  assert.deepEqual(model.setKindergartenName('   '), { ok: true });
  assert.equal(model.metadata.kindergartenName, '');
  assert.deepEqual(model.state.log[2].data, { name: '' });
});

test('setRev advances the revision counter and rejects invalid values', () => {
  const model = DataModel.create(null);

  assert.equal(model.metadata.rev, 0);
  assert.deepEqual(model.setRev(3), { ok: true });
  assert.equal(model.metadata.rev, 3);

  // The counter only moves forward: lower, negative, non-integer or
  // non-numeric values are rejected without touching the revision.
  for (const rev of [2, -1, 1.5, '3', null]) {
    assert.deepEqual(model.setRev(rev), { ok: false });
  }
  assert.equal(model.metadata.rev, 3);
});

test('addCategory rejects an existing name', () => {
  const model = DataModel.create(null);

  assert.equal(model.addCategory('Gemüse').ok, true);
  assert.deepEqual(model.addCategory('Gemüse'), { ok: false });
  assert.deepEqual(model.addCategory('gemüse '), { ok: false });
  assert.equal(model.addCategory('Obst').ok, true);
  assert.deepEqual(model.categories, ['Gemüse', 'Obst']);
});

test('mutation methods clip over-long free text to 100 characters', () => {
  const longText = 'A'.repeat(150);
  const model = DataModel.create(null);

  const kidResult = model.addKid(longText);

  assert.equal(kidResult.ok, true);
  assert.equal(kidResult.kid.name.length, 100);
  assert.equal(model.state.log[0].data.name.length, 100);

  const event = model.addEvent({
    date: '2026-10-30',
    ingredients: [
      {
        childId: kidResult.kid.id,
        manual: false,
        name: longText,
        price: 1.49,
        quantity: 500,
        unit: 'g',
      },
    ],
    seed: 1,
    title: longText,
  });

  assert.equal(event.title.length, 100);
  assert.equal(event.ingredients[0].name.length, 100);

  assert.equal(model.addCategory(longText).ok, true);
  assert.equal(
    model.addPriceItem(longText, 200, 'g', longText, 1.49).ok,
    true
  );
  assert.equal(model.categories[0].length, 100);
  assert.equal(model.priceList[0].name.length, 100);
  assert.equal(model.priceList[0].category.length, 100);

  model.ensureCategory(longText);

  assert.equal(model.categories.length, 1);
  assert.equal(model.setPriceItemName(0, longText + 'B').ok, true);
  assert.equal(model.priceList[0].name.length, 100);
  model.updatePriceItem(0, { quantity: 300, unit: longText });
  assert.equal(model.priceList[0].unit.length, 100);
  assert.equal(model.priceList[0].quantity, 300);
  assert.equal(
    model.renameCategory(model.categories[0], longText + 'C').ok,
    true
  );
  assert.equal(model.categories[0].length, 100);
});

test('an event may contain the same ingredient more than once', () => {
  const model = DataModel.create(null);
  const kid = model.addKid('Lotte', '2025-09-01').kid;

  const event = model.addEvent({
    date: '2999-12-31',
    ingredients: [
      {
        childId: kid.id,
        manual: false,
        name: 'Eier',
        price: 1.29,
        quantity: 10,
        unit: 'piece',
      },
      {
        childId: kid.id,
        manual: false,
        name: 'Eier',
        price: 1.29,
        quantity: 10,
        unit: 'piece',
      },
    ],
    seed: 1,
    title: 'Eier-Tag',
  });

  // Splitting one large amount into several rows is allowed: staff can
  // add "10 Eier" three times instead of forcing one child to bring 30.
  assert.equal(event.ingredients.length, 2);
  assert.equal(model.events[0].ingredients[0].name, 'Eier');
  assert.equal(model.events[0].ingredients[1].name, 'Eier');
});

test('future events can be edited and deleted, past events stay final', () => {
  const model = DataModel.create(null);
  const kid = model.addKid('Lotte', '2025-09-01').kid;

  const future = model.addEvent({
    date: '2999-12-31',
    ingredients: [
      {
        childId: kid.id,
        manual: false,
        name: 'Cheese',
        price: 2.49,
        quantity: 200,
        unit: 'g',
      },
    ],
    seed: 1,
    title: 'Cheese Day',
  });
  const past = model.addEvent({
    date: '2026-01-01',
    ingredients: [
      {
        childId: kid.id,
        manual: false,
        name: 'Bread',
        price: 1.19,
        quantity: 1,
        unit: 'piece',
      },
    ],
    seed: 2,
    title: 'Old Event',
  });

  // The past event rejects every change.
  assert.equal(
    model.updateEvent(past.id, {
      date: '2026-01-02',
      ingredients: [
        {
          childId: kid.id,
          manual: false,
          name: 'Cheese',
          price: 9.99,
          quantity: 200,
          unit: 'g',
        },
      ],
      title: 'Hacked',
    }).ok,
    false
  );
  assert.equal(model.removeEvent(past.id).ok, false);
  assert.equal(model.events.length, 2);
  assert.equal(model.events[1].title, 'Old Event');

  // The future event can be replaced and deleted.
  assert.equal(
    model.updateEvent(future.id, {
      date: '2999-12-30',
      ingredients: [
        {
          childId: kid.id,
          manual: false,
          name: 'Bread',
          price: 1.19,
          quantity: 1,
          unit: 'piece',
        },
      ],
      title: 'Cheese Day II',
    }).ok,
    true
  );
  assert.equal(model.events.length, 2);
  assert.equal(model.events[0].title, 'Cheese Day II');
  assert.equal(model.events[0].ingredients[0].name, 'Bread');
  assert.equal(model.removeEvent(future.id).ok, true);
  assert.equal(model.events.length, 1);
  assert.equal(
    model.state.log.some((entry) => 'event.update' === entry.action),
    true
  );
  assert.equal(
    model.state.log.some((entry) => 'event.delete' === entry.action),
    true
  );
});

test('ingredient corrections are refused for past events', () => {
  const model = DataModel.create(null);
  const kid = model.addKid('Lotte', '2025-09-01').kid;

  const past = model.addEvent({
    date: '2026-01-01',
    ingredients: [
      {
        childId: kid.id,
        manual: false,
        name: 'Cheese',
        price: 2.49,
        quantity: 200,
        unit: 'g',
      },
    ],
    seed: 1,
    title: 'Old Event',
  });
  const future = model.addEvent({
    date: '2999-12-31',
    ingredients: [
      {
        childId: kid.id,
        manual: false,
        name: 'Bread',
        price: 1.19,
        quantity: 1,
        unit: 'piece',
      },
    ],
    seed: 2,
    title: 'New Event',
  });

  model.setIngredientPrice(past.id, 0, 9.99);
  model.setIngredientChild(past.id, 0, kid.id);

  assert.equal(model.events[0].ingredients[0].price, 2.49);
  assert.equal(model.events[0].ingredients[0].manual, false);
  model.setIngredientPrice(future.id, 0, 1.29);

  assert.equal(model.events[1].ingredients[0].price, 1.29);
  assert.equal(model.events[1].ingredients[0].manual, true);
});

test('renameKid renames without breaking assignments', () => {
  const model = DataModel.create(null);
  const added = model.addKid('Lotte', '2025-09-01');

  assert.equal(model.renameKid(added.kid.id, 'Lotte B.').ok, true);
  assert.equal(model.kidById(added.kid.id).name, 'Lotte B.');
  // duplicates and empty names are rejected
  assert.equal(model.addKid('Lotti', '2025-09-01').ok, true);
  assert.equal(model.renameKid(added.kid.id, 'lotti').ok, false);
  assert.equal(model.renameKid(added.kid.id, '  ').ok, false);
  // the assignment (childId reference) survives the rename
  const event = model.addEvent({
    date: '2999-12-31',
    ingredients: [
      {
        childId: added.kid.id,
        manual: false,
        name: 'Cheese',
        price: 2.49,
        quantity: 200,
        unit: 'g',
      },
    ],
    seed: 1,
    title: 'Cheese Day',
  });
  model.renameKid(added.kid.id, 'Lotte Maria');

  assert.equal(model.kidById(event.ingredients[0].childId).name, 'Lotte Maria');
  assert.equal(
    model.state.log.some((entry) => 'kid.rename' === entry.action),
    true
  );
});

test('renameCategory renames the list entry and the items', () => {
  const model = DataModel.create(null);
  model.addCategory('Gemüse');
  model.addPriceItem('Fennel', 200, 'g', 'Gemüse', 1.49);

  const result = model.renameCategory('Gemüse', 'Gemüse & Co');

  assert.equal(result.ok, true);
  assert.deepEqual(model.categories, ['Gemüse & Co']);
  assert.equal(model.priceList[0].category, 'Gemüse & Co');
});

test('renameCategory rejects an empty or already taken name', () => {
  const model = DataModel.create(null);
  model.addCategory('Gemüse');
  model.addCategory('Obst');

  assert.equal(model.renameCategory('Gemüse', '  ').ok, false);
  assert.equal(model.renameCategory('Gemüse', 'obst').ok, false);
  assert.deepEqual(model.categories, ['Gemüse', 'Obst']);
  // Renaming to its own current name is a no-op, not a duplicate.
  assert.equal(model.renameCategory('Gemüse', 'Gemüse').ok, true);
});

test('removeCategory keeps or deletes the items, history untouched', () => {
  const model = DataModel.create(null);
  model.addCategory('Gemüse');
  model.addPriceItem('Fennel', 200, 'g', 'Gemüse', 1.49);
  model.addPriceItem('Tomate', 500, 'g', 'Gemüse', 1.49);
  const kid = model.addKid('Lotte').kid;
  model.addEvent({
    date: '2026-10-30',
    ingredients: [
      {
        childId: kid.id,
        manual: false,
        name: 'Fennel',
        price: 1.49,
        quantity: 200,
        unit: 'g',
      },
    ],
    seed: 1,
    title: '',
  });

  model.removeCategory('Gemüse', true);

  assert.deepEqual(model.categories, []);
  assert.equal(model.priceList.length, 0);
  // The saved event (history) is preserved.
  assert.equal(model.events[0].ingredients[0].name, 'Fennel');

  model.addPriceItem('Sellerie', 200, 'g', 'Gemüse', 1.29);
  model.removeCategory('Gemüse', false);

  assert.deepEqual(model.categories, []);
  assert.equal(model.priceList.length, 1);
  assert.equal(model.priceList[0].category, '');
});

test('setIngredientChild and setIngredientPrice flag manual edits', () => {
  const model = DataModel.create(null);
  const kid = model.addKid('Lotte').kid;
  const event = model.addEvent({
    date: '2026-10-30',
    ingredients: [
      { childId: kid.id, manual: false, name: 'Cheese', price: 2.99 },
    ],
    seed: 1,
    title: '',
  });

  model.setIngredientChild(event.id, 0, 'k_other');
  model.setIngredientPrice(event.id, 0, 1.99);

  const ing = model.eventById(event.id).ingredients[0];
  assert.equal(ing.childId, 'k_other');
  assert.equal(ing.price, 1.99);
  assert.equal(ing.manual, true);
});

/* Audit log and retention ------------------------------------------------------ */

test('logAction appends a timestamped entry', () => {
  const model = DataModel.create(null);

  model.logAction('test.action', { name: 'X' });

  const entry = model.log[0];
  assert.equal(entry.action, 'test.action');
  assert.deepEqual(entry.data, { name: 'X' });
  assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(entry.t));
});

test('mutations write one log entry each, in order', () => {
  const model = DataModel.create(null);
  model.addKid('Lotte');
  model.addCategory('Gemüse');
  model.addPriceItem('Fennel', 200, 'g', 'Gemüse', 1.49);
  model.updatePriceItem(0, { quantity: 300 });
  model.setPriceItemName(0, 'Sellerie');
  model.removePriceItem(0);
  model.setKidActive(model.kids[0].id, false);
  model.setKidActive(model.kids[0].id, true);

  assert.deepEqual(
    model.log.map((entry) => entry.action),
    [
      'kid.add',
      'category.add',
      'price.add',
      'price.update',
      'price.rename',
      'price.remove',
      'kid.deactivate',
      'kid.activate',
    ]
  );
});

test('price.update logs each changed field with old and new value', () => {
  const model = DataModel.create(null);
  model.addPriceItem('Fennel', 200, 'g', 'Gemüse', 1.49);
  model.updatePriceItem(0, { price: 2.99, quantity: 300 });

  const entries = model.log.filter(
    (entry) => 'price.update' === entry.action
  );

  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0].data, {
    field: 'price',
    from: 1.49,
    name: 'Fennel',
    to: 2.99,
  });
  assert.deepEqual(entries[1].data, {
    field: 'quantity',
    from: 200,
    name: 'Fennel',
    to: 300,
  });
});

test('removeCategory logs the affected item count', () => {
  const model = DataModel.create(null);
  model.addCategory('Gemüse');
  model.addPriceItem('Fennel', 200, 'g', 'Gemüse', 1.49);
  model.addPriceItem('Tomate', 500, 'g', 'Gemüse', 1.29);

  model.removeCategory('Gemüse', true);

  const entry = model.log.find(
    (candidate) => 'category.remove' === candidate.action
  );
  assert.equal(entry.data.count, 2);
  assert.equal(entry.data.name, 'Gemüse');
  assert.equal(entry.data.withItems, true);
});

test('prune removes old events, log entries and inactive kids', () => {
  const model = DataModel.create(null);
  const lili = model.addKid('Lili', '2020-05-01').kid;
  model.addKid('Lotte', '2025-09-01');
  const event = model.addEvent({
    date: '2026-10-01',
    ingredients: [
      { childId: lili.id, manual: false, name: 'Apfel', price: 1.19 },
      { childId: '', manual: false, name: 'Reis', price: 1.89 },
    ],
    seed: 1,
    title: 'Neu',
  });
  model.addEvent({
    date: '2020-01-01',
    ingredients: [{ childId: '', manual: false, name: 'Reis', price: 1.89 }],
    seed: 2,
    title: 'Alt',
  });

  model.logAction('old.entry');
  model.log[model.log.length - 1].t = '2020-01-01T00:00:00.000Z';

  // Lili leaves the group and stays gone for over five years.
  lili.active = false;
  model.prune();

  // The old inactive kid is gone; her assignment left the young event.
  assert.equal(model.kidById(lili.id), null);
  assert.deepEqual(
    model.eventById(event.id).ingredients.map((ing) => ing.name),
    ['Reis']
  );
  // The old event and the old log entry are gone.
  assert.deepEqual(model.events.map((e) => e.id), [event.id]);
  assert.ok(
    model.log.every((entry) => 'old.entry' !== entry.action)
  );
  // The removal is documented.
  assert.ok(
    model.log.some(
      (entry) => 'kid.prune' === entry.action && 'Lili' === entry.data.name
    )
  );
  // Each prune that removed something writes its own summary: the old
  // event was pruned when it was added, the kid + log entry later.
  const retentions = model.log.filter(
    (entry) => 'retention.prune' === entry.action
  );
  assert.deepEqual(
    retentions.map((entry) => entry.data),
    [
      { events: 1, log: 0 },
      { events: 0, log: 1 },
    ]
  );
});

test('prune keeps active kids no matter how old', () => {
  const model = DataModel.create(null);
  model.addKid('Ben', '2015-01-01');

  model.prune();

  assert.equal(model.kids.length, 1);
  assert.equal(model.kids[0].name, 'Ben');
});

test('prune keeps young inactive kids', () => {
  const model = DataModel.create(null);
  model.addKid('Lina', '2023-05-01');
  model.state.kids[0].active = false;

  model.prune();

  assert.equal(model.kids.length, 1);
});

test('prune writes no retention entries when nothing expired', () => {
  const model = DataModel.create(null);
  model.addKid('Lotte');

  model.prune();

  assert.equal(
    model.log.filter(
      (entry) =>
        'retention.prune' === entry.action || 'kid.prune' === entry.action
    ).length,
    0
  );
});

test('fromRaw prunes expired data on load', () => {
  const result = DataModel.fromRaw({
    events: [
      {
        date: '2026-01-01',
        id: 'e_old',
        ingredients: [{ childId: 'k_old', name: 'Apfel', price: 1.19 }],
        seed: 1,
        title: 'Alt',
      },
      {
        date: '2026-01-01',
        id: 'e_new',
        ingredients: [{ childId: '', name: 'Reis', price: 1.89 }],
        seed: 2,
        title: 'Neu',
      },
    ],
    kids: [
      { active: false, enrolledOn: '2020-01-01', id: 'k_old', name: 'Lili' },
      {
        active: true,
        enrolledOn: '2020-01-01',
        id: 'k_old_active',
        name: 'Ben',
      },
    ],
    log: [
      {
        action: 'kid.add',
        data: { name: 'Uralt' },
        t: '2020-01-01T00:00:00.000Z',
      },
      { action: 'kid.add', data: { name: 'Neu' }, t: '2026-01-01T00:00:00.000Z' },
    ],
    version: 1,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.model.events.map((event) => event.id), ['e_new']);
  assert.deepEqual(
    result.model.kids.map((kid) => kid.id),
    ['k_old_active']
  );
  assert.equal(result.model.log.length, 3); // kept entry + 2 retention entries
  assert.ok(
    result.model.log.some(
      (entry) => 'kid.prune' === entry.action && 'Lili' === entry.data.name
    )
  );
  const retention = result.model.log.find(
    (entry) => 'retention.prune' === entry.action
  );
  assert.equal(retention.data.events, 1);
  assert.equal(retention.data.log, 1);
});

test('fromRaw replaces invalid dates with the defaults', () => {
  const { todayIso } = require('../js/util.js');
  const result = DataModel.fromRaw({
    events: [{ date: 'garbage', id: 'e_bad', ingredients: [], seed: 1 }],
    kids: [{ active: true, enrolledOn: '2026-02-31', id: 'k_bad', name: 'Lili' }],
    metadata: { createdAt: '30.10.2026' },
    version: 1,
  });

  assert.equal(result.ok, true);
  assert.equal(result.model.events[0].date, todayIso());
  assert.equal(result.model.kids[0].enrolledOn, todayIso());
  assert.equal(result.model.metadata.createdAt, todayIso());
});

test('fromRaw normalizes negative quantities and non-finite prices', () => {
  const result = DataModel.fromRaw({
    events: [
      {
        date: '2026-10-30',
        id: 'e_num',
        ingredients: [
          { childId: '', name: 'Mehl', price: Infinity, quantity: -3, unit: 'g' },
          { childId: '', name: 'Reis', price: -1, quantity: 2.5, unit: 'kg' },
        ],
        seed: Infinity,
        title: '',
      },
    ],
    priceList: [{ name: 'Zucker', price: Infinity, quantity: -1, unit: 'g' }],
    version: 1,
  });

  assert.equal(result.ok, true);
  const [mehl, reis] = result.model.events[0].ingredients;
  assert.equal(mehl.price, 0);
  assert.equal(mehl.quantity, 0);
  assert.equal(reis.price, 0);
  assert.equal(reis.quantity, 2.5);
  assert.equal(result.model.events[0].seed, 0);
  assert.equal(result.model.priceList[0].price, 0);
  assert.equal(result.model.priceList[0].quantity, 0);
});

test('fromRaw survives adversarial input without throwing', () => {
  const result = DataModel.fromRaw({
    events: [
      'not-an-object',
      null,
      { ingredients: 'nope', seed: NaN, title: 42 },
      {
        date: '2026-10-30',
        ingredients: [42, null, 'x', { price: 'free', quantity: 'a lot' }],
      },
    ],
    kids: [42, null, { name: 17, enrolledOn: ['nested'] }],
    log: { not: 'an array' },
    metadata: { rev: -5, updatedAt: 17 },
    settings: { language: 'fr', maxIngredientsPerChild: 2.7 },
    version: 1,
  });

  assert.equal(result.ok, true);
  assert.equal(result.model.events.length, 2);
  assert.equal(result.model.events[0].ingredients.length, 0);
  assert.equal(result.model.events[0].seed, 0);
  assert.equal(result.model.events[1].ingredients.length, 1);
  assert.equal(result.model.events[1].ingredients[0].price, 0);
  assert.equal(result.model.events[1].ingredients[0].quantity, 0);
  assert.equal(result.model.kids.length, 1);
  assert.equal(result.model.kids[0].name, '(unnamed)');
  assert.equal(result.model.metadata.rev, 0);
  assert.equal(result.model.metadata.updatedAt, '');
  assert.equal(result.model.settings.language, 'de');
  assert.equal(result.model.settings.maxIngredientsPerChild, 2);
});

/* Derived statistics ----------------------------------------------------------- */

test('priorTotals sums every assignment across all events', () => {
  const model = DataModel.create(null);
  model.state.kids = [
    { active: true, enrolledOn: '2025-09-01', id: 'k_a', name: 'A' },
    { active: true, enrolledOn: '2025-09-01', id: 'k_b', name: 'B' },
  ];
  model.state.events = [
    {
      date: '2026-09-01',
      id: 'e1',
      ingredients: [
        { childId: 'k_a', manual: false, name: 'Cheese', price: 9.5 },
        { childId: 'k_b', manual: false, name: 'Cucumber', price: 1.0 },
      ],
      seed: 1,
      title: '',
    },
    {
      date: '2026-09-08',
      id: 'e2',
      ingredients: [{ childId: 'k_a', manual: false, name: 'Cream', price: 4.2 }],
      seed: 2,
      title: '',
    },
  ];

  const totals = model.priorTotals();
  assert.equal(totals.k_a.totalSpent, 13.7);
  assert.equal(totals.k_a.timesAssigned, 2);
  assert.equal(totals.k_b.totalSpent, 1.0);
  assert.equal(totals.k_b.timesAssigned, 1);
});

/* Id generation --------------------------------------------------------------- */

test('generateId produces prefixed, reasonably unique ids', () => {
  const idA = generateId('k');
  const idB = generateId('e');
  assert.ok(idA.startsWith('k_'));
  assert.ok(idB.startsWith('e_'));
  const ids = new Set();
  for (let i = 0; i < 1000; i++) {
    ids.add(generateId('k'));
  }
  assert.ok(990 < ids.size, 'collision rate should be negligible');
});
