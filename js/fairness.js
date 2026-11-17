/*
 * js/fairness.js - the Fairness domain logic
 * ---------------------------------------------------------------------------
 * The heart of the app:
 *
 *   - how "time in the group" is measured,
 *   - how the group rate and each child's fair target are computed,
 *   - the assignment algorithm itself.
 *
 * Optimize the complete event against two participation-based targets:
 * money and assignment frequency. A greedy starting plan is improved
 * by moving and swapping ingredients, without changing past events.
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

  // One assignment deviation is weighted like twice the event's average
  // ingredient price. These are soft objectives, not guaranteed spread caps.
  const FREQUENCY_WEIGHT = 2;
  const MAX_IMPROVEMENTS = 100;
  const SCORE_EPSILON = 1e-8;

  class Fairness {
    /** Derive cumulative fair shares from each event's participant snapshot.
     * Attending children without an ingredient also accrue a fair share.
     * Missing snapshots are invalid: attendance must never be guessed.
     */
    static buildTargets(state, excludeEventId) {
      const targets = {};
      for (const event of state.events) {
        if (event.id === excludeEventId && undefined !== excludeEventId) {
          continue;
        }
        if (!Array.isArray(event.participantIds)) {
          throw new Error('Event participantIds are required');
        }
        const ids = [...new Set(event.participantIds)];
        if (!ids.length) {
          continue;
        }
        const cost = event.ingredients.reduce((sum, ing) => sum + ing.price, 0) /
          ids.length;
        const times = event.ingredients.length / ids.length;
        for (const id of ids) {
          const target = targets[id] || (targets[id] = { totalSpent: 0,
            timesAssigned: 0 });
          target.totalSpent += cost;
          target.timesAssigned += times;
        }
      }
      return targets;
    }

    /**
     * Assign the ingredients of one event to the children of the group.
     *
     * Targets add equal shares of this event to prior participation targets.
     * Minimize the sum of squared cost and weighted frequency deviations.
     * Start with expensive ingredients, then repeatedly choose the best
     * improving move or swap (at most 100 iterations for live previews).
     * Moves preserve per-event round limits; swaps preserve counts.
     * Exact initial ties use the saved event seed. This is a deterministic
     * local search, not a guarantee of the global optimum or a spread cap.
     *
     * @param {object} params
     * @param {Array<{id: string, enrolledOn: string}>} params.activeKids
     * @param {Object.<string, {totalSpent: number, timesAssigned: number}>} params.priorTotals
     *        - what each child got in ALL PREVIOUS events
     * @param {Object.<string, {totalSpent: number, timesAssigned: number}>} params.priorTargets
     *        - cumulative fair shares before this event
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
      const ingredients = params.ingredients;
      const maxPerChild = Number.isFinite(params.maxPerChild)
        ? Math.max(1, Math.floor(params.maxPerChild))
        : 1;
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

      const cost = activeKids.map((kid) =>
        (priorTotals[kid.id] || {}).totalSpent || 0
      );
      const times = activeKids.map((kid) =>
        (priorTotals[kid.id] || {}).timesAssigned || 0
      );
      const eventCost = ingredients.reduce((sum, ing) => sum + ing.price, 0);
      const priorTargets = params.priorTargets || {};
      const targetCost = activeKids.map((kid) =>
        ((priorTargets[kid.id] || {}).totalSpent || 0) +
          eventCost / activeKids.length);
      const targetTimes = activeKids.map((kid) =>
        ((priorTargets[kid.id] || {}).timesAssigned || 0) +
          ingredients.length / activeKids.length);
      // Free ingredients still count as work. Use historical average cost
      // (or 1 EUR for an entirely free history) only when this event is free.
      const priorCount = times.reduce((sum, value) => sum + value, 0);
      const averagePrice = eventCost > 0
        ? eventCost / ingredients.length
        : (priorCount > 0 ? cost.reduce((sum, value) => sum + value, 0) /
          priorCount : 0) || 1;
      const weight = Math.pow(FREQUENCY_WEIGHT * averagePrice, 2);
      const score = (kid, spent, count) =>
        Math.pow(spent - targetCost[kid], 2) +
        weight * Math.pow(count - targetTimes[kid], 2);
      const counts = activeKids.map(() => 0);
      const assigned = [];
      let roundCap = maxPerChild;
      for (const ingredientIndex of order) {
        const price = ingredients[ingredientIndex].price;
        if (counts.every((count) => count >= roundCap)) {
          roundCap += 1;
        }
        let bestKid = -1;
        let bestKey = null;
        for (let kid = 0; kid < activeKids.length; kid++) {
          if (counts[kid] >= roundCap) {
            continue;
          }
          const key = [
            score(kid, cost[kid] + price, times[kid] + 1) -
              score(kid, cost[kid], times[kid]),
            Fairness.deterministicRandom(seed, activeKids[kid].id,
              String(ingredientIndex)),
          ];
          if (null === bestKey || compareTuples(key, bestKey) < 0) {
            bestKid = kid;
            bestKey = key;
          }
        }
        cost[bestKid] += price;
        times[bestKid] += 1;
        counts[bestKid] += 1;
        assigned[ingredientIndex] = bestKid;
      }

      // With the default limit each child gets floor(m/n) or ceil(m/n).
      // A configured larger first-round limit keeps its existing semantics.
      const minimum = ingredients.length >= activeKids.length * maxPerChild
        ? Math.floor(ingredients.length / activeKids.length) : 0;
      const maximum = Math.max(maxPerChild,
        Math.ceil(ingredients.length / activeKids.length));
      for (let step = 0; step < MAX_IMPROVEMENTS; step++) {
        let bestDelta = -SCORE_EPSILON;
        let action = null;
        for (let i = 0; i < ingredients.length; i++) {
          const a = assigned[i];
          const price = ingredients[i].price;
          const beforeA = score(a, cost[a], times[a]);
          if (counts[a] > minimum) {
            for (let b = 0; b < activeKids.length; b++) {
              if (a === b || counts[b] >= maximum) {
                continue;
              }
              const delta = score(a, cost[a] - price, times[a] - 1) +
                score(b, cost[b] + price, times[b] + 1) - beforeA -
                score(b, cost[b], times[b]);
              if (delta < bestDelta) {
                bestDelta = delta;
                action = { i: i, a: a, b: b };
              }
            }
          }
          for (let j = i + 1; j < ingredients.length; j++) {
            const b = assigned[j];
            if (a === b) {
              continue;
            }
            const change = ingredients[j].price - price;
            const delta = score(a, cost[a] + change, times[a]) +
              score(b, cost[b] - change, times[b]) - beforeA -
              score(b, cost[b], times[b]);
            if (delta < bestDelta) {
              bestDelta = delta;
              action = { i: i, j: j, a: a, b: b };
            }
          }
        }
        if (!action) {
          break;
        }
        const { i, j, a, b } = action;
        if (undefined !== j) {
          const change = ingredients[j].price - ingredients[i].price;
          cost[a] += change;
          cost[b] -= change;
          assigned[i] = b;
          assigned[j] = a;
        } else {
          cost[a] -= ingredients[i].price;
          cost[b] += ingredients[i].price;
          times[a] -= 1;
          times[b] += 1;
          counts[a] -= 1;
          counts[b] += 1;
          assigned[i] = b;
        }
      }
      return order.map((i) => ({
        ingredientIndex: i,
        childId: activeKids[assigned[i]].id,
      }));
    }

    /**
     * Compute the numbers shown in the Overview, as of a given date.
     *
     * Participation-based fairness:
     *
     *   target     = sum(eventCost / participantCount for attended events)
     *   difference = totalSpent - target
     *
     * Negative difference  -> family paid less than their participation share.
     * Positive difference   -> the opposite (paid recently).
     *
     * New children accrue targets only for events they participate in.
     *
     * Works on the plain state object (DataModel.toJson() shape).
     *
     * @param {object} state    - plain state
     * @param {string} asOfDate - "YYYY-MM-DD", usually today
     * @returns {object} { groupRatePerWeek, costSpread, costSpreadPct,
     *                     frequencySpread, perKid: [...] }
     *          perKid: only ACTIVE kids. The first entry is a provisional
     *          recommendation for one average-price ingredient, using assign().
     */
    static buildOverview(state, asOfDate) {
      const activeKids = state.kids.filter((kid) => kid.active &&
        kid.enrolledOn <= asOfDate);

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
      const targets = Fairness.buildTargets(state);

      for (const kid of perKid) {
        kid.target = (targets[kid.id] || {}).totalSpent || 0;
        kid.frequencyTarget = (targets[kid.id] || {}).timesAssigned || 0;
        kid.frequencyDifference = kid.timesAssigned - kid.frequencyTarget;
        kid.difference = kid.totalSpent - kid.target;
      }

      // An exact recommendation needs an event plan. Estimate with the
      // same optimizer using one historical average-price ingredient.
      const totalTimes = perKid.reduce((sum, k) => sum + k.timesAssigned, 0);
      const recommendation = Fairness.assign({
        activeKids: activeKids,
        priorTotals: totals,
        priorTargets: targets,
        ingredients: [{ price: totalTimes > 0 ? totalSpent / totalTimes : 1 }],
        eventDate: asOfDate,
        maxPerChild: 1,
        seed: 0,
      });
      const nextId = recommendation.length ? recommendation[0].childId : null;
      perKid.sort((a, b) => {
        if (a.id === nextId || b.id === nextId) {
          return a.id === nextId ? -1 : 1;
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
      const costTargetSpread = perKid.length > 1
        ? Math.max(...perKid.map((kid) => kid.difference)) -
          Math.min(...perKid.map((kid) => kid.difference)) : 0;
      const frequencyTargetSpread = perKid.length > 1
        ? Math.max(...perKid.map((kid) => kid.frequencyDifference)) -
          Math.min(...perKid.map((kid) => kid.frequencyDifference)) : 0;
      const costSpreadPct = 0 < averageSpent ? costSpread / averageSpent : 0;

      return {
        costSpread: costSpread,
        costSpreadPct: costSpreadPct,
        frequencySpread: frequencySpread,
        costTargetSpread: costTargetSpread,
        frequencyTargetSpread: frequencyTargetSpread,
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
     * their time-proportional EXPECTED number of assignments.
     * A newcomer with few weeks therefore expects few
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
