/*
 * js/fairness.js - the Fairness domain logic
 * ---------------------------------------------------------------------------
 * The heart of the app:
 *
 *   - how "time in the group" is measured,
 *   - how the group rate and each child's fair target are computed,
 *   - the assignment algorithm itself.
 *
 * Two fairness axes:
 *
 *   1. MONEY: "The family that is furthest BELOW its fair share gets
 *      the most expensive ingredient first - and so on."
 *   2. FREQUENCY: a child who was already picked more than
 *      FREQUENCY_TOLERANCE times above their time-proportional share
 *      takes a break - even when the money difference would pick them
 *      again. Fair COSTS alone do not mean a fair WORKLOAD, because
 *      cheap ingredients still have to be brought in.
 *
 * Fairness is a stateless service (all methods are static): it only
 * receives data, returns results, and never mutates its input. That
 * keeps it trivially testable and free of any DOM/dependency concerns.
 *
 * Available as FairShare.Fairness in the browser, via module.exports
 * in Node (tests).
 */

(function () {
  'use strict';

  const Util =
    'undefined' !== typeof window && window.FairShare
      ? window.FairShare.util
      : require('./util.js');

  /**
   * Lexicographic comparison of two equal-length number tuples.
   *
   * @param {number[]} a
   * @param {number[]} b
   * @returns {number} -1, 0 or 1
   */
  function compareTuples(a, b) {
    for (let i = 0; i < a.length; i++) {
      if (a[i] < b[i]) {
        return -1;
      }

      if (a[i] > b[i]) {
        return 1;
      }
    }

    return 0;
  }

  /**
   * The frequency guard tolerance, in ASSIGNMENTS: a child who was
   * already picked more than this many times above their
   * time-proportional expected share (group frequency × weeks in the
   * group) is not a candidate for the next ingredient - unless every
   * candidate is over, in which case the guard stands down. Because
   * the expectation scales with the enrollment date, a newcomer is
   * judged on their OWN time in the group and never has to "catch
   * up" to the older children.
   */
  const FREQUENCY_TOLERANCE = 1;

  class Fairness {
    /**
     * Assign the ingredients of one event to the children of the group.
     *
     * Step by step:
     *   1. Sort the ingredients by descending price.
     *   2. For each ingredient, compute every candidate's current
     *      difference from target (totalSpent - groupRate * weeks),
     *      using running totals that already include the ingredients
     *      placed earlier in THIS event.
     *   3. The FREQUENCY GUARD removes candidates who were already
     *      picked more than FREQUENCY_TOLERANCE times above their
     *      time-proportional expected share, so no child is
     *      overworked even when the money difference would keep
     *      picking them. If EVERY candidate is over, the guard
     *      stands down (someone must be picked).
     *   4. Give the ingredient to the remaining candidate with the
     *      smallest difference.
     *   5. By default a child brings at most `maxPerChild`
     *      ingredients per event. When there are more ingredients
     *      than children the limit lifts one STEP at a time
     *      (round two, three, ...): the next round starts only
     *      AFTER every child has reached the current limit, so one
     *      child can never pile up a third ingredient while
     *      another still has only one.
     *
     * Tie-breaking (only for EXACTLY equal differences):
     *   a) fewer previous assignments wins (frequency fairness),
     *   b) then a deterministic random value from the event seed
     *      (equal families rotate instead of one always winning).
     *
     * @param {object} params
     * @param {Array<{id: string, enrolledOn: string}>} params.activeKids
     * @param {Object.<string, {totalSpent: number, timesAssigned: number}>}
     *        params.priorTotals - what each child got in ALL PREVIOUS events
     * @param {Array<{name: string, price: number}>} params.ingredients
     * @param {string} params.eventDate - "YYYY-MM-DD"
     * @param {number} params.seed
     * @param {number} params.maxPerChild
     * @returns {Array<{ingredientIndex: number, childId: string}>}
     *          one entry per ingredient, in assignment order (most
     *          expensive first), `ingredientIndex` references the
     *          original `params.ingredients` order.
     */
    static assign(params) {
      const activeKids = params.activeKids;
      const eventDate = params.eventDate;
      const ingredients = params.ingredients;
      const maxPerChild = Math.max(1, Math.floor(params.maxPerChild));
      const priorTotals = params.priorTotals || {};
      const seed = params.seed;

      // Nothing to do for an empty group or an empty ingredient list.
      if (0 === activeKids.length || 0 === ingredients.length) {
        return [];
      }

      // Ingredient indices sorted by descending price (stable for ties).
      const order = ingredients
        .map((ing, index) => index)
        .sort((a, b) => ingredients[b].price - ingredients[a].price);

      // Running totals for this event (previous events + this event).
      const runningTotals = {};
      for (const kid of activeKids) {
        const prior =
          priorTotals[kid.id] || { timesAssigned: 0, totalSpent: 0 };
        runningTotals[kid.id] = {
          timesAssigned: prior.timesAssigned,
          totalSpent: prior.totalSpent,
        };
      }

      // How often each child was already placed in THIS event.
      const assignedCount = {};
      for (const kid of activeKids) {
        assignedCount[kid.id] = 0;
      }

      const assignments = [];

      // The per-child limit lifts one step at a time (see step 5 in
      // the docs above): roundCap is the maximum ingredients a child
      // may have in THIS event while the current round is open.
      let roundCap = maxPerChild;

      for (const ingredientIndex of order) {
        const price = ingredients[ingredientIndex].price;

        // The group rate and the group frequency both shift slightly
        // as totals change within the event, so they are recomputed
        // for every single ingredient.
        const groupRate = Fairness.groupRatePerWeek(
          activeKids,
          runningTotals,
          eventDate
        );
        const groupFrequency = Fairness.groupFrequencyPerWeek(
          activeKids,
          runningTotals,
          eventDate
        );

        // Candidates below the current round cap; when nobody is left
        // the cap lifts by one step (more ingredients than children).
        let candidates = activeKids.filter(
          (kid) => assignedCount[kid.id] < roundCap
        );
        if (0 === candidates.length) {
          roundCap += 1;
          candidates = activeKids;
        }

        // The frequency guard (see step 3 in the docs above): a child
        // who was already picked more than FREQUENCY_TOLERANCE times
        // above their time-proportional share takes a break. If every
        // candidate is over, the guard stands down.
        let guarded = candidates.filter((kid) => {
          const expected =
            groupFrequency * Fairness.weeksInKita(kid.enrolledOn, eventDate);

          return (
            runningTotals[kid.id].timesAssigned <= expected + FREQUENCY_TOLERANCE
          );
        });
        if (0 === guarded.length) {
          guarded = candidates;
        }

        // Lexicographic minimum of (difference, timesAssigned, random).
        let bestKid = null;
        let bestKey = null;
        for (const kid of guarded) {
          const weeks = Fairness.weeksInKita(kid.enrolledOn, eventDate);
          const difference =
            runningTotals[kid.id].totalSpent - groupRate * weeks;
          const key = [
            difference,
            runningTotals[kid.id].timesAssigned,
            Fairness.deterministicRandom(
              seed,
              kid.id,
              String(ingredientIndex)
            ),
          ];

          if (null === bestKey || compareTuples(key, bestKey) < 0) {
            bestKid = kid;
            bestKey = key;
          }
        }

        runningTotals[bestKid.id].totalSpent += price;
        runningTotals[bestKid.id].timesAssigned += 1;
        assignedCount[bestKid.id] += 1;
        assignments.push({
          childId: bestKid.id,
          ingredientIndex: ingredientIndex,
        });
      }

      return assignments;
    }

    /**
     * Compute the numbers shown in the Overview, as of a given date.
     *
     * Time-weighted fairness:
     *
     *   target     = groupRate * weeksInKita(child, asOfDate)
     *   difference = totalSpent - target
     *
     * Negative difference  -> family paid less than a fair share for
     *                         their time in the group (picked soon).
     * Positive difference   -> the opposite (paid recently).
     *
     * Because the target scales with the enrollment date, a newly
     * enrolled child joins the rotation at the NORMAL PACE - they do
     * not have to "catch up" to the absolute totals of older children.
     *
     * Works on the plain state object (DataModel.toJson() shape).
     *
     * @param {object} state    - plain state
     * @param {string} asOfDate - "YYYY-MM-DD", usually today
     * @returns {object} { groupRatePerWeek, costSpread, costSpreadPct,
     *                     frequencySpread, perKid: [...] }
     *          perKid: only ACTIVE kids, sorted by (frequency guard,
     *          difference, timesAssigned, name) ascending - the first
     *          entry is "who comes next", using the same selection
     *          logic as assign() (without its seed-based random
     *          tie-break, which belongs to a concrete event).
     */
    static buildOverview(state, asOfDate) {
      const activeKids = state.kids.filter((kid) => kid.active);

      // What every active child has been assigned so far.
      const totals = {};
      for (const event of state.events) {
        for (const ing of event.ingredients) {
          if (!ing.childId) {
            continue;
          }

          if (!totals[ing.childId]) {
            totals[ing.childId] = {
              timesAssigned: 0,
              totalSpent: 0,
            };
          }

          totals[ing.childId].totalSpent += ing.price;
          totals[ing.childId].timesAssigned += 1;
        }
      }

      // Weeks + running totals per child.
      const perKid = activeKids.map((kid) => {
        const t = totals[kid.id] || { timesAssigned: 0, totalSpent: 0 };

        return {
          difference: 0, // filled in below
          enrolledOn: kid.enrolledOn,
          id: kid.id,
          name: kid.name,
          target: 0,
          timesAssigned: t.timesAssigned,
          totalSpent: t.totalSpent,
          weeksInKita: Fairness.weeksInKita(kid.enrolledOn, asOfDate),
        };
      });
      const totalSpent = perKid.reduce((sum, k) => sum + k.totalSpent, 0);
      const totalWeeks = perKid.reduce((sum, k) => sum + k.weeksInKita, 0);
      const groupRatePerWeek = 0 < totalWeeks ? totalSpent / totalWeeks : 0;

      for (const kid of perKid) {
        kid.target = groupRatePerWeek * kid.weeksInKita;
        kid.difference = kid.totalSpent - kid.target;
      }

      // "Who comes next" mirrors the assignment's selection: first
      // the frequency guard (a child over their time-proportional
      // share + FREQUENCY_TOLERANCE takes a break), then the smallest
      // difference from target, then fewer previous assignments. The
      // seed-based random tie-break belongs to a CONCRETE event, so
      // the name is the final stable tie-break here.
      const totalTimes = perKid.reduce((sum, k) => sum + k.timesAssigned, 0);
      const groupFrequency = 0 < totalWeeks ? totalTimes / totalWeeks : 0;
      const overFrequency = (kid) =>
        kid.timesAssigned >
        groupFrequency * kid.weeksInKita + FREQUENCY_TOLERANCE
          ? 1
          : 0;

      perKid.sort((a, b) => {
        const overA = overFrequency(a);
        const overB = overFrequency(b);

        if (overA !== overB) {
          return overA - overB;
        }

        if (a.difference !== b.difference) {
          return a.difference - b.difference;
        }

        if (a.timesAssigned !== b.timesAssigned) {
          return a.timesAssigned - b.timesAssigned;
        }

        return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
      });

      // How far apart the group currently is (0 for < 2 children).
      const averageSpent =
        0 < perKid.length ? totalSpent / perKid.length : 0;
      const countValues = perKid.map((k) => k.timesAssigned);
      const spentValues = perKid.map((k) => k.totalSpent);
      const costSpread =
        2 <= perKid.length
          ? Math.max.apply(null, spentValues) -
            Math.min.apply(null, spentValues)
          : 0;
      const frequencySpread =
        2 <= perKid.length
          ? Math.max.apply(null, countValues) -
            Math.min.apply(null, countValues)
          : 0;
      const costSpreadPct = 0 < averageSpent ? costSpread / averageSpent : 0;

      return {
        costSpread: costSpread,
        costSpreadPct: costSpreadPct,
        frequencySpread: frequencySpread,
        groupRatePerWeek: groupRatePerWeek,
        perKid: perKid,
      };
    }

    /**
     * Deterministic pseudo-random number in [0, 1) derived from a seed
     * and two salt strings (e.g. child id and ingredient index).
     *
     * FNV-1a based: for a fixed seed the result is always the same, so
     * an assignment stays reproducible and explainable ("why did child
     * X get the cheese?").
     *
     * @param {number} seed
     * @param {string} saltA
     * @param {string} saltB
     * @returns {number}
     */
    static deterministicRandom(seed, saltA, saltB) {
      const str = seed + '|' + saltA + '|' + saltB;
      let hash = 0x811c9dc5; // FNV offset basis
      for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193); // FNV prime
      }

      return (hash >>> 0) / 4294967296;
    }

    /**
     * The group's average spending rate in EUR per week.
     *
     * Total paid by the group, spread over the group's combined time in
     * the group:
     *
     *   groupRate = sum(totalSpent) / sum(weeksInKita)
     *
     * @param {Array<{id: string, enrolledOn: string}>} activeKids
     * @param {Object.<string, {totalSpent: number}>} runningTotals
     * @param {string} asOfDate
     * @returns {number}
     */
    static groupRatePerWeek(activeKids, runningTotals, asOfDate) {
      let totalSpent = 0;
      let totalWeeks = 0;
      for (const kid of activeKids) {
        totalSpent += (
          runningTotals[kid.id] || { totalSpent: 0 }
        ).totalSpent;
        totalWeeks += Fairness.weeksInKita(kid.enrolledOn, asOfDate);
      }

      return 0 < totalWeeks ? totalSpent / totalWeeks : 0;
    }

    /**
     * The group's average assignment frequency in ASSIGNMENTS per
     * week - the frequency twin of the group rate:
     *
     *   groupFrequency = sum(timesAssigned) / sum(weeksInKita)
     *
     * Multiplied with a child's own weeks in the group this yields
     * their time-proportional EXPECTED number of assignments, which
     * the frequency guard in assign() compares the actual count
     * against. A newcomer with few weeks therefore expects few
     * assignments - no catch-up, no disadvantage.
     *
     * @param {Array<{id: string, enrolledOn: string}>} activeKids
     * @param {Object.<string, {timesAssigned: number}>} runningTotals
     * @param {string} asOfDate
     * @returns {number}
     */
    static groupFrequencyPerWeek(activeKids, runningTotals, asOfDate) {
      let totalTimes = 0;
      let totalWeeks = 0;
      for (const kid of activeKids) {
        totalTimes += (
          runningTotals[kid.id] || { timesAssigned: 0 }
        ).timesAssigned;
        totalWeeks += Fairness.weeksInKita(kid.enrolledOn, asOfDate);
      }

      return 0 < totalWeeks ? totalTimes / totalWeeks : 0;
    }

    /**
     * How long a child has been in the group, in weeks.
     *
     * Both dates are ISO strings ("YYYY-MM-DD"). The result is clamped
     * to a minimum of ONE DAY so that a child enrolled today already
     * has a tiny (almost zero) target instead of a division by zero.
     *
     * @param {string} enrolledOn - "YYYY-MM-DD"
     * @param {string} asOfDate   - "YYYY-MM-DD" (event date when assigning,
     *                              "today" for the overview)
     * @returns {number} weeks, always >= 1/7
     */
    static weeksInKita(enrolledOn, asOfDate) {
      const start = Util.parseIsoDate(enrolledOn);
      const end = Util.parseIsoDate(asOfDate);
      const daysBetween = (end.getTime() - start.getTime()) / 86400000;
      // Enrolled in the future (data entry mistake) -> "just started".
      const days = Math.max(1, Math.floor(daysBetween));

      return days / 7;
    }
  }

  /* The export footer stays at the bottom by convention. */
  const api = {
    Fairness: Fairness,
  };

  if ('undefined' !== typeof window) {
    window.FairShare = window.FairShare || {};
    Object.assign(window.FairShare, api);
  }

  if ('undefined' !== typeof module && module.exports) {
    module.exports = api;
  }
})();
