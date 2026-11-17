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

/* The frequency guard ------------------------------------------------------- */

test('a child picked far more often than their share takes a break', () => {
  // The report scenario: six children, one of them was assigned 9 times
  // while the others only 4-5 times. The over-picked child is also the
  // best on cost (many cheap ingredients) - the money difference alone
  // would pick them again. The frequency guard pushes them back.
  const result = Fairness.assign({
    activeKids: [
      kid('a'),
      kid('b'),
      kid('c'),
      kid('d'),
      kid('e'),
      kid('f'),
    ],
    eventDate: '2026-06-15',
    ingredients: [{ name: 'cheese', price: 10 }],
    maxPerChild: 1,
    priorTotals: totals({
      a: [20, 9],
      b: [24, 5],
      c: [22, 4],
      d: [25, 5],
      e: [23, 4],
      f: [21, 4],
    }),
    seed: 42,
  });

  assert.equal(result.length, 1);
  // 'a' has the smallest difference from target but 9 assignments
  // against 4-5 for the others - the break is worth it.
  assert.notEqual(result[0].childId, 'a');
  // Among the eligible children 'f' (21 EUR paid) is furthest below
  // target.
  assert.equal(result[0].childId, 'f');
});

test('a child just one assignment above their share is still eligible', () => {
  const result = Fairness.assign({
    activeKids: [kid('a'), kid('b'), kid('c'), kid('d')],
    eventDate: '2026-06-15',
    ingredients: [{ name: 'cheese', price: 10 }],
    maxPerChild: 1,
    // 'd' was assigned once MORE than the others (4 vs 3) - within the
    // tolerance of one - and is also the best on cost, so 'd' wins.
    priorTotals: totals({ a: [40, 3], b: [41, 3], c: [42, 3], d: [30, 4] }),
    seed: 42,
  });
  assert.equal(result[0].childId, 'd');
});

test('if every round candidate is over frequency the guard stands down', () => {
  // Three children, two ingredients. After the first ingredient the
  // only candidates (the two not capped) are BOTH over frequency - the
  // guard cannot simply refuse to assign, so it stands down and the
  // money difference decides.
  const result = Fairness.assign({
    activeKids: [kid('a'), kid('b'), kid('c')],
    eventDate: '2026-06-15',
    ingredients: [
      { name: 'cheese', price: 10 },
      { name: 'cucumber', price: 1 },
    ],
    maxPerChild: 1,
    // 'a' was under-assigned (0 times, nothing paid) while 'b' and 'c'
    // were picked far more often than their share.
    priorTotals: totals({ a: [0, 0], b: [30, 6], c: [30, 6] }),
    seed: 42,
  });

  assert.equal(result.length, 2);
  assert.equal(result[0].childId, 'a', 'the under-assigned child first');
  assert.ok(
    ['b', 'c'].includes(result[1].childId),
    'the guard stands down instead of leaving an ingredient unassigned'
  );
});

/* The round cap lifts step by step ------------------------------------------ */

test('with more ingredients than children, no child gets a third while another has one', () => {
  // Three children, five ingredients. Without the step-by-step round
  // cap the cheap child 'a' (furthest below target on cost) would pile
  // up a third ingredient in round two. Now every round gives every
  // child at most one more ingredient.
  const result = Fairness.assign({
    activeKids: [kid('a'), kid('b'), kid('c')],
    eventDate: '2026-06-15',
    ingredients: [
      { name: 'cheese', price: 10 },
      { name: 'cream', price: 9 },
      { name: 'bread', price: 8 },
      { name: 'apple', price: 7 },
      { name: 'salt', price: 6 },
    ],
    maxPerChild: 1,
    priorTotals: totals({ a: [5, 4], b: [40, 4], c: [42, 4] }),
    seed: 42,
  });

  const counts = {};
  result.forEach((entry) => {
    counts[entry.childId] = (counts[entry.childId] || 0) + 1;
  });

  // Every child brings at least one ingredient...
  assert.equal(Object.keys(counts).length, 3);
  // ...and no child brings more than two (two rounds, one per round).
  assert.ok(Object.values(counts).every((count) => 2 >= count));
  // 'a' is the best on cost in round two as well, but 'b' and 'c'
  // still get their second ingredient before a third round could
  // start - so 'a' ends with exactly two.
  assert.equal(counts.a, 2);
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

  // The FREQUENCIES stay close together as well: the over-worked child
  // from the report (9 assignments vs 4-5 in six events) must not be
  // possible anymore.
  const establishedTimes = ['anna', 'ben', 'cara', 'dan'].map(
    (id) => totalsByKid[id].timesAssigned
  );
  const frequencySpread =
    Math.max.apply(null, establishedTimes) -
    Math.min.apply(null, establishedTimes);
  assert.ok(
    3 >= frequencySpread,
    'established children drifted too far apart in frequency: ' +
      establishedTimes.join(', ')
  );

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

test('buildOverview: a child over frequency does not come next up', () => {
  // The same report scenario seen from the overview: 'Ana' was
  // assigned 9 times, the others only 4 - even with the best money
  // difference she takes a break, so the next-up row is someone else.
  const mk = (id, times) =>
    Array.from({ length: times }, () => ({ childId: id, price: 1 }));
  const state = {
    events: [
      {
        ingredients: [
          ...mk('k_a', 9),
          ...mk('k_b', 4),
          ...mk('k_c', 4),
          ...mk('k_d', 4),
          ...mk('k_e', 4),
          ...mk('k_f', 4),
        ],
      },
    ],
    kids: [
      { active: true, enrolledOn: '2025-09-01', id: 'k_a', name: 'Ana' },
      { active: true, enrolledOn: '2025-09-01', id: 'k_b', name: 'Ben' },
      { active: true, enrolledOn: '2025-09-01', id: 'k_c', name: 'Cora' },
      { active: true, enrolledOn: '2025-09-01', id: 'k_d', name: 'Dan' },
      { active: true, enrolledOn: '2025-09-01', id: 'k_e', name: 'Eli' },
      { active: true, enrolledOn: '2025-09-01', id: 'k_f', name: 'Finn' },
    ],
  };

  const stats = Fairness.buildOverview(state, '2026-06-15');

  assert.notEqual(stats.perKid[0].id, 'k_a', 'Ana takes a break');
  // All remaining children are tied (equal time, equal frequency);
  // the stable name tie-break puts 'Ben' first.
  assert.equal(stats.perKid[0].id, 'k_b');
  // 'Ana' is over frequency AND over target -> last.
  assert.equal(stats.perKid[stats.perKid.length - 1].id, 'k_a');
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
