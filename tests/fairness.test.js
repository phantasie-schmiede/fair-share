/*
 * tests/fairness.test.js
 * ---------------------------------------------------------------------------
 * Unit tests for the Fairness domain logic: the assignment algorithm,
 * the overview statistics and the helper functions.
 *
 * Run with:  node --test
 */

'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Fairness } = require('../js/fairness.js');

/* Small helpers to build test inputs ------------------------------------ */

function addWeeks(isoDate, weeks) {
  const date = new Date(isoDate + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + weeks * 7);

  return date.toISOString().slice(0, 10);
}

function kid(id, enrolledOn) {
  return { enrolledOn: enrolledOn || '2024-09-01', id: id };
}

function totals(map) {
  // shorthand: { a: [totalSpent, timesAssigned] } -> { a: {...} }
  const result = {};
  for (const [id, value] of Object.entries(map)) {
    result[id] = { timesAssigned: value[1], totalSpent: value[0] };
  }

  return result;
}

/* The basic fairness rule ------------------------------------------------ */

test('the most expensive ingredient goes to the child furthest below target', () => {
  const result = Fairness.assign({
    activeKids: [kid('a'), kid('b'), kid('c')],
    eventDate: '2026-10-30',
    ingredients: [
      { name: 'cheese', price: 10 },
      { name: 'cucumber', price: 1 },
    ],
    maxPerChild: 1,
    priorTotals: totals({ a: [100, 5], b: [50, 5], c: [80, 5] }),
    seed: 42,
  });

  // All three children have the same time in the group, so "lowest
  // difference" is exactly "lowest total": b (50) gets the cheese,
  // then c (80) gets the cucumber - a (100) is skipped.
  assert.equal(result.length, 2);
  assert.equal(result[0].ingredientIndex, 0, 'cheese is assigned first');
  assert.equal(result[0].childId, 'b');
  assert.equal(result[1].ingredientIndex, 1);
  assert.equal(result[1].childId, 'c');
});

test('the limit of one ingredient per child lifts when there are more ingredients than children', () => {
  const result = Fairness.assign({
    activeKids: [kid('a'), kid('b')],
    eventDate: '2026-10-30',
    ingredients: [
      { name: 'cheese', price: 10 },
      { name: 'cream', price: 6 },
      { name: 'salt', price: 2 },
    ],
    maxPerChild: 1,
    priorTotals: totals({ a: [100, 5], b: [102, 5] }),
    seed: 42,
  });

  // 10 -> a (100 < 102), 6 -> b (102 < 110), 2 -> b again (108 < 110)
  // because after the first round every child has reached the limit.
  assert.deepEqual(result.map((entry) => entry.childId), ['a', 'b', 'b']);
});

/* Tie-breaking ------------------------------------------------------------ */

test('exact ties are broken by the child with fewer previous assignments', () => {
  const result = Fairness.assign({
    activeKids: [kid('a'), kid('b')],
    eventDate: '2026-10-30',
    ingredients: [{ name: 'cheese', price: 10 }],
    maxPerChild: 1,
    // identical totals, but a has been assigned less often
    priorTotals: totals({ a: [50, 3], b: [50, 5] }),
    seed: 42,
  });
  assert.equal(result[0].childId, 'a');
});

test('the same seed always produces the same assignment', () => {
  const params = {
    activeKids: [kid('a'), kid('b'), kid('c'), kid('d')],
    eventDate: '2026-10-30',
    ingredients: [
      { name: 'cheese', price: 9.5 },
      { name: 'cream', price: 4.2 },
      { name: 'salt', price: 0.3 },
    ],
    maxPerChild: 1,
    priorTotals: totals({ a: [40, 2], b: [41, 2], c: [40, 2], d: [41, 2] }),
    seed: 1234,
  };
  assert.deepEqual(Fairness.assign(params), Fairness.assign(params));
});

/* New children: normal pace, no catch-up ---------------------------------- */

test('a newly enrolled child joins at the normal pace and does not catch up', () => {
  // Four established children that enrolled long ago, weekly events.
  const enrolledOn = '2025-09-01';
  const activeKids = [
    kid('anna', enrolledOn),
    kid('ben', enrolledOn),
    kid('cara', enrolledOn),
    kid('dan', enrolledOn),
  ];
  // Eva joins three days before event 11 (0-based).
  const evaEnrolledOn = addWeeks('2026-08-03', 11);
  const evaEnrolledMinusDays = new Date(
    new Date(evaEnrolledOn + 'T00:00:00Z').getTime() - 3 * 86400000
  ).toISOString().slice(0, 10);
  const allKids = activeKids.concat([kid('eva', evaEnrolledMinusDays)]);

  // Running totals per child (what assign() does not track).
  const totalsByKid = {
    anna: { timesAssigned: 0, totalSpent: 0 },
    ben: { timesAssigned: 0, totalSpent: 0 },
    cara: { timesAssigned: 0, totalSpent: 0 },
    dan: { timesAssigned: 0, totalSpent: 0 },
    eva: { timesAssigned: 0, totalSpent: 0 },
  };
  const pricePool = [
    [9.5, 4.2, 1.8],
    [12.0, 3.5],
    [8.9, 6.4, 2.1, 1.2],
    [7.5, 5.0, 3.3, 2.7, 1.5],
  ];

  for (let event = 0; event < 30; event++) {
    const eventDate = addWeeks('2026-08-03', event);
    const eventKids = event >= 11 ? allKids : activeKids; // eva joins at 11
    const eventPrices = pricePool[event % pricePool.length];

    const result = Fairness.assign({
      activeKids: eventKids,
      eventDate: eventDate,
      ingredients: eventPrices.map((price, index) => ({
        name: 'ingredient-' + index,
        price: price,
      })),
      maxPerChild: 1,
      priorTotals: totalsByKid,
      seed: 1000 + event,
    });

    const assignedIds = result.map((entry) => entry.childId);
    if (eventPrices.length <= eventKids.length) {
      // Enough children: every child brings at most one ingredient.
      assert.equal(
        new Set(assignedIds).size,
        assignedIds.length,
        'no child brings more than one ingredient in event ' + event
      );
    } else {
      // More ingredients than children: the limit lifts, but only AFTER
      // every child has received their first ingredient.
      assert.equal(assignedIds.length, eventPrices.length);
      assert.ok(
        eventKids.every((kidInfo) => assignedIds.includes(kidInfo.id)),
        'every child brings at least one ingredient in event ' + event
      );
    }

    // Update the running totals for the next round.
    result.forEach((entry, index) => {
      totalsByKid[entry.childId].totalSpent += eventPrices[index];
      totalsByKid[entry.childId].timesAssigned += 1;
    });
  }

  // Final fairness check: difference from target for every child.
  const asOfDate = addWeeks('2026-08-03', 30);
  let totalSpent = 0;
  let totalWeeks = 0;
  for (const kidInfo of allKids) {
    totalSpent += totalsByKid[kidInfo.id].totalSpent;
    totalWeeks += Fairness.weeksInKita(kidInfo.enrolledOn, asOfDate);
  }
  const groupRate = totalSpent / totalWeeks;
  const differences = {};
  for (const kidInfo of allKids) {
    differences[kidInfo.id] =
      totalsByKid[kidInfo.id].totalSpent -
      groupRate * Fairness.weeksInKita(kidInfo.enrolledOn, asOfDate);
  }

  // Every child stays close to their fair share - including Eva.
  for (const kidInfo of allKids) {
    assert.ok(
      20 > Math.abs(differences[kidInfo.id]),
      kidInfo.id + ' drifted too far from target: ' + differences[kidInfo.id]
    );
  }

  // Eva (20 weeks in the group) has been assigned noticeably less often
  // than the established children (30 weeks) - the normal pace, no
  // catch-up: she is not "paying for" the time before she enrolled.
  assert.ok(
    totalsByKid.eva.timesAssigned < totalsByKid.anna.timesAssigned,
    'eva should have fewer assignments than an established child'
  );
});

/* Overview statistics ------------------------------------------------------ */

test('buildOverview: equal-time children split the target in half', () => {
  const state = {
    events: [
      {
        ingredients: [
          { childId: 'k_a', price: 10 },
          { childId: 'k_b', price: 1 },
        ],
      },
    ],
    kids: [
      { active: true, enrolledOn: '2026-09-01', id: 'k_a', name: 'A' },
      { active: true, enrolledOn: '2026-09-01', id: 'k_b', name: 'B' },
      // an inactive child must not enter the statistics at all
      { active: false, enrolledOn: '2026-09-01', id: 'k_c', name: 'C' },
    ],
  };

  const stats = Fairness.buildOverview(state, '2026-10-30');

  // Both children have the same time in the group, so with 11 EUR total
  // each one "should have" paid exactly 5.50 EUR.
  assert.equal(stats.perKid.length, 2, 'inactive child is excluded');
  assert.ok(Math.abs(stats.perKid[0].target - 5.5) < 1e-9);
  assert.ok(Math.abs(stats.perKid[1].target - 5.5) < 1e-9);

  // Child b (1 EUR) is 4.50 under target -> comes next; child a (10 EUR)
  // is 4.50 over target.
  assert.equal(stats.perKid[0].id, 'k_b');
  assert.ok(Math.abs(stats.perKid[0].difference + 4.5) < 1e-9);
  assert.equal(stats.perKid[1].id, 'k_a');
  assert.ok(Math.abs(stats.perKid[1].difference - 4.5) < 1e-9);

  assert.equal(stats.costSpread, 9);
  assert.equal(stats.frequencySpread, 0);
});

test('buildOverview: a short-time child has a smaller target', () => {
  const state = {
    events: [],
    kids: [
      { active: true, enrolledOn: '2024-09-01', id: 'k_old', name: 'Old' },
      { active: true, enrolledOn: '2026-10-26', id: 'k_new', name: 'New' },
    ],
  };
  // No events at all: targets are zero, but weeks differ a lot.
  const stats = Fairness.buildOverview(state, '2026-10-30');
  const old = stats.perKid.find((k) => 'k_old' === k.id);
  const newcomer = stats.perKid.find((k) => 'k_new' === k.id);

  assert.ok(80 < old.weeksInKita);
  assert.ok(newcomer.weeksInKita < 1);
  assert.equal(newcomer.target, 0); // nothing paid anywhere yet
  assert.equal(old.target, 0);
});

/* Edge cases --------------------------------------------------------------- */

test('a single child brings everything', () => {
  const result = Fairness.assign({
    activeKids: [kid('a')],
    eventDate: '2026-10-30',
    ingredients: [
      { name: 'cheese', price: 10 },
      { name: 'cream', price: 6 },
      { name: 'salt', price: 2 },
    ],
    maxPerChild: 1,
    priorTotals: { a: { timesAssigned: 0, totalSpent: 0 } },
    seed: 1,
  });
  assert.equal(result.length, 3);
  assert.ok(result.every((entry) => 'a' === entry.childId));
});

test('an empty group or an empty ingredient list yields no assignments', () => {
  assert.deepEqual(
    Fairness.assign({
      activeKids: [],
      eventDate: '2026-10-30',
      ingredients: [{ name: 'cheese', price: 10 }],
      maxPerChild: 1,
      priorTotals: {},
      seed: 1,
    }),
    []
  );
  assert.deepEqual(
    Fairness.assign({
      activeKids: [kid('a')],
      eventDate: '2026-10-30',
      ingredients: [],
      maxPerChild: 1,
      priorTotals: {},
      seed: 1,
    }),
    []
  );
});

test('zero-priced ingredients are handled without errors', () => {
  const result = Fairness.assign({
    activeKids: [kid('a'), kid('b')],
    eventDate: '2026-10-30',
    ingredients: [
      { name: 'free cheese from the farm', price: 0 },
      { name: 'cucumber', price: 1 },
    ],
    maxPerChild: 1,
    priorTotals: totals({ a: [10, 1], b: [10, 1] }),
    seed: 7,
  });
  assert.equal(result.length, 2);
});

/* Helper functions ---------------------------------------------------------- */

test('weeksInKita clamps to at least one day', () => {
  assert.equal(Fairness.weeksInKita('2026-10-30', '2026-10-30'), 1 / 7);
  assert.equal(Fairness.weeksInKita('2026-10-23', '2026-10-30'), 1);
  // Enrolled in the future (data entry mistake) -> still one day.
  assert.equal(Fairness.weeksInKita('2027-01-01', '2026-10-30'), 1 / 7);
});

test('deterministicRandom is stable and inside [0, 1)', () => {
  const value = Fairness.deterministicRandom(42, 'a', '0');
  assert.equal(value, Fairness.deterministicRandom(42, 'a', '0'));
  assert.notEqual(value, Fairness.deterministicRandom(42, 'a', '1'));
  assert.ok(0 <= value && value < 1);
});
