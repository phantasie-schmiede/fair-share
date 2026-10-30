/*
 * tests/exporter.test.js
 * ---------------------------------------------------------------------------
 * Unit tests for the Exporter: CSV building (BOM, escaping, sorting),
 * cell escaping and the JSON export file.
 *
 * Run with:  node --test
 */

'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Exporter } = require('../js/exporters.js');

/* CSV builder ----------------------------------------------------------------- */

test('buildHistoryCsv: BOM, semicolons, two-decimal prices, quote escaping', () => {
  const state = {
    events: [
      {
        date: '2026-09-01',
        id: 'e1',
        ingredients: [
          {
            childId: 'k_a',
            manual: false,
            name: 'Cheese "special"',
            price: 2.995,
            quantity: 250,
            unit: 'g',
          },
        ],
        seed: 1,
        title: 'Event with; semicolon',
      },
    ],
    kids: [{ active: true, enrolledOn: '2025-09-01', id: 'k_a', name: 'Lotte' }],
  };

  const csv = Exporter.buildHistoryCsv(state, [
    'Date',
    'Event',
    'Ingredient',
    'Qty',
    'Unit',
    'Child',
    'Price',
  ]);

  assert.ok(0xfeff === csv.charCodeAt(0), 'starts with a UTF-8 BOM');
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines.length, 2);
  assert.equal(lines[0], 'Date;Event;Ingredient;Qty;Unit;Child;Price');
  // The semicolon inside the title and the quotes inside the name are
  // escaped; 2.995 renders as "2.99" or "3.00" depending on toFixed.
  const dataRow = lines[1];
  assert.ok(dataRow.startsWith('2026-09-01;'));
  assert.ok(dataRow.includes('"Event with; semicolon"'));
  assert.ok(dataRow.includes('"Cheese ""special"""'));
  assert.ok(dataRow.includes(';Lotte;'));
  assert.ok(dataRow.includes('2.99') || dataRow.includes('3.00'));
});

test('buildHistoryCsv exports only the selected events', () => {
  const state = {
    events: [
      {
        date: '2026-09-02',
        id: 'e2',
        ingredients: [
          { childId: '', manual: false, name: 'Bread', price: 1.19 },
        ],
        seed: 2,
        title: 'Second',
      },
      {
        date: '2026-09-01',
        id: 'e1',
        ingredients: [
          { childId: '', manual: false, name: 'Cheese', price: 2.49 },
        ],
        seed: 1,
        title: 'First',
      },
    ],
    kids: [],
  };
  const headers = ['d', 'e', 'i', 'q', 'u', 'c', 'p'];

  // Nothing selected (missing or empty list) -> everything is exported.
  assert.ok(-1 < Exporter.buildHistoryCsv(state, headers).indexOf('Cheese'));
  assert.ok(-1 < Exporter.buildHistoryCsv(state, headers).indexOf('Bread'));
  assert.ok(
    -1 < Exporter.buildHistoryCsv(state, headers, []).indexOf('Cheese')
  );

  // A selection exports only the chosen events.
  const selected = Exporter.buildHistoryCsv(state, headers, ['e1']);
  assert.ok(-1 < selected.indexOf('Cheese'));
  assert.ok(-1 === selected.indexOf('Bread'));
});

test('buildHistoryCsv sorts events oldest first', () => {
  const state = {
    events: [
      {
        date: '2026-11-01',
        id: 'e2',
        ingredients: [
          { childId: 'k_a', manual: false, name: 'B', price: 1 },
        ],
        seed: 1,
        title: 'later',
      },
      {
        date: '2026-09-01',
        id: 'e1',
        ingredients: [
          { childId: 'k_a', manual: false, name: 'A', price: 1 },
        ],
        seed: 2,
        title: 'earlier',
      },
    ],
    kids: [{ active: true, enrolledOn: '2025-09-01', id: 'k_a', name: 'Lotte' }],
  };

  const csv = Exporter.buildHistoryCsv(state, ['h']);
  const lines = csv.slice(1).split('\r\n');
  assert.ok(lines[1].startsWith('2026-09-01;'), 'oldest event first');
  assert.ok(lines[2].startsWith('2026-11-01;'), 'newest event last');
});

test('buildHistoryCsv leaves unknown children empty', () => {
  const state = {
    events: [
      {
        date: '2026-09-01',
        id: 'e1',
        ingredients: [{ childId: 'k_gone', manual: false, name: 'A', price: 1 }],
        seed: 1,
        title: '',
      },
    ],
    kids: [],
  };

  const csv = Exporter.buildHistoryCsv(state, [
    'Date',
    'Event',
    'Ingredient',
    'Qty',
    'Unit',
    'Child',
    'Price',
  ]);
  const lines = csv.slice(1).split('\r\n');
  const columns = lines[1].split(';');
  assert.equal(columns[5], ''); // empty child column (6th of 7)
});

/* Cell escaping ---------------------------------------------------------------- */

test('escapeCsvCell wraps and doubles quotes as needed', () => {
  assert.equal(Exporter.escapeCsvCell('plain'), 'plain');
  assert.equal(Exporter.escapeCsvCell('a;b'), '"a;b"');
  assert.equal(Exporter.escapeCsvCell('a"b'), '"a""b"');
  assert.equal(Exporter.escapeCsvCell('a\nb'), '"a\nb"');
  assert.equal(Exporter.escapeCsvCell(12.5), '12.5');
});

test('escapeCsvCell neutralizes formula injection', () => {
  // Values starting with a formula trigger are prefixed with an
  // apostrophe so spreadsheet apps keep them as text.
  assert.equal(Exporter.escapeCsvCell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(Exporter.escapeCsvCell('+cmd'), "'+cmd");
  assert.equal(Exporter.escapeCsvCell('-x'), "'-x");
  assert.equal(Exporter.escapeCsvCell('@SUM'), "'@SUM");
  assert.equal(Exporter.escapeCsvCell('\tTAB'), "'\tTAB");
  // The prefix combines with the quote wrapping when needed
  // (the apostrophe stays part of the cell value).
  assert.equal(Exporter.escapeCsvCell('=A1;B1'), "\"'=A1;B1\"");
  // Normal values are left untouched.
  assert.equal(Exporter.escapeCsvCell('x=A1'), 'x=A1');
  assert.equal(Exporter.escapeCsvCell('Tomaten'), 'Tomaten');
});

/* JSON export file -------------------------------------------------------------- */

test('jsonFile returns a File with a dated name and pretty JSON', async () => {
  const state = { events: [], kids: [], version: 1 };
  const file = Exporter.jsonFile(state);

  assert.ok(/kita-data-\d{4}-\d{2}-\d{2}\.json/.test(file.name));
  assert.equal(file.type, 'application/json');
  const text = await file.text();
  assert.deepEqual(JSON.parse(text), state);
});
