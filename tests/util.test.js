/*
 * tests/util.test.js
 * ---------------------------------------------------------------------------
 * Unit tests for the shared utility helpers, currently the price
 * scaling of the planning view.
 *
 * Run with:  node --test
 */

'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  addYearsIso,
  isIsoDate,
  localIsoDate,
  priceForQuantity,
} = require('../js/util.js');

test('priceForQuantity scales the default price by the quantity factor', () => {
  assert.equal(priceForQuantity(1.29, 500, 1000), 2.58); // 500 g -> 1 kg
  assert.equal(priceForQuantity(0.79, 1, 2), 1.58); // 1 piece -> 2 pieces
  assert.equal(priceForQuantity(2.99, 2.5, 1.25), 1.5); // 2.5 kg -> 1.25 kg
});

test('priceForQuantity rounds to two decimals', () => {
  assert.equal(priceForQuantity(1.05, 1, 3), 3.15);
  assert.equal(priceForQuantity(0.89, 3, 1), 0.3);
});

test('priceForQuantity treats a missing quantity as one default pack', () => {
  assert.equal(priceForQuantity(1.49, 500, 0), 1.49);
});

test('priceForQuantity returns null without a usable default quantity', () => {
  assert.equal(priceForQuantity(1.49, 0, 500), null);
});

test('addYearsIso shifts an ISO date by whole years', () => {
  assert.equal(addYearsIso('2026-10-30', 5), '2031-10-30');
  assert.equal(addYearsIso('2026-10-30', -5), '2021-10-30');
  assert.equal(addYearsIso('2026-10-30', 0), '2026-10-30');
});

test('addYearsIso clamps a leap day to Feb 28 in non-leap years', () => {
  assert.equal(addYearsIso('2024-02-29', 1), '2025-02-28');
  assert.equal(addYearsIso('2024-02-29', 4), '2028-02-29');
  assert.equal(addYearsIso('2024-02-29', -1), '2023-02-28');
});

test('localIsoDate uses the local calendar day in every time zone', () => {
  // Constructed in local time, so the result is the same no matter
  // which time zone the tests run in (UTC, negative offsets, ...).
  assert.equal(localIsoDate(new Date(2026, 9, 30)), '2026-10-30');
  assert.equal(localIsoDate(new Date(2026, 0, 1, 23, 59)), '2026-01-01');
  assert.equal(localIsoDate(new Date(2025, 11, 31, 23, 59)), '2025-12-31');
});

test('isIsoDate accepts real calendar dates and rejects the rest', () => {
  assert.equal(isIsoDate('2026-10-30'), true);
  assert.equal(isIsoDate('2024-02-29'), true); // leap day
  assert.equal(isIsoDate('2026-02-29'), false); // not a leap year
  assert.equal(isIsoDate('2026-02-31'), false); // impossible day
  assert.equal(isIsoDate('2026-13-01'), false); // impossible month
  assert.equal(isIsoDate('2026-10-3'), false); // unpadded
  assert.equal(isIsoDate('20261030'), false); // wrong format
  assert.equal(isIsoDate('2026-10-30T00:00:00.000Z'), false); // timestamp
  assert.equal(isIsoDate('garbage'), false);
  assert.equal(isIsoDate(20261030), false); // not a string
  assert.equal(isIsoDate(null), false);
});
