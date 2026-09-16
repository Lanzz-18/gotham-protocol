import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { levelFromTotal, xpConsumedTo, xpToNext, pillarTotalXP, lifetimeXP } from "../../src/engine/xp";
import { computePillars, overallLevel, currentRankIndex } from "../../src/engine/ranks";
import { CONFIG, PILLAR_IDS, log, shuffle } from "../helpers";

/**
 * These do not check known answers. They assert laws that must hold for EVERY
 * possible history, then let fast-check attack them with thousands of random ones.
 */

const curve = () =>
  fc.record({
    base: fc.integer({ min: 20, max: 300 }),
    growth: fc.float({ min: Math.fround(1.05), max: Math.fround(1.5), noNaN: true }),
  });

const anyHistory = () =>
  fc.array(
    fc.record({
      pillar: fc.constantFrom(...PILLAR_IDS),
      xp: fc.integer({ min: 0, max: 500 }),
      day: fc.integer({ min: 0, max: 400 }),
    }),
    { maxLength: 120 },
  ).map((rows) =>
    rows.map((r, i) => log(r.pillar, r.xp, new Date(2026, 0, 1 + r.day, 12).getTime() + i)),
  );

describe("XP is conserved", () => {
  it("every point logged is either spent on a level or carried as remainder", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5_000_000 }), curve(), (total, c) => {
        const r = levelFromTotal(total, c);
        expect(xpConsumedTo(r.level, c) + r.xp).toBe(total);
      }),
      { numRuns: 2000 },
    );
  });

  it("the carried remainder is never enough to buy the next level", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5_000_000 }), curve(), (total, c) => {
        const r = levelFromTotal(total, c);
        expect(r.xp).toBeLessThan(r.need);
        expect(r.xp).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 2000 },
    );
  });
});

describe("History order does not matter", () => {
  it("shuffling the log never changes any pillar level", () => {
    fc.assert(
      fc.property(anyHistory(), fc.integer({ min: 1, max: 99999 }), (history, seed) => {
        const a = computePillars(history, CONFIG);
        const b = computePillars(shuffle(history, seed), CONFIG);
        for (const id of PILLAR_IDS) {
          expect(b[id].level).toBe(a[id].level);
          expect(b[id].xp).toBe(a[id].xp);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("lifetime XP equals the sum of every pillar total", () => {
    fc.assert(
      fc.property(anyHistory(), (history) => {
        const perPillar = PILLAR_IDS.reduce((s, id) => s + pillarTotalXP(history, id), 0);
        expect(perPillar).toBe(lifetimeXP(history));
      }),
      { numRuns: 300 },
    );
  });
});

describe("Progress only ever moves forward", () => {
  it("adding a log can never lower a level", () => {
    fc.assert(
      fc.property(
        anyHistory(),
        fc.constantFrom(...PILLAR_IDS),
        fc.integer({ min: 0, max: 500 }),
        (history, pillar, xp) => {
          const before = computePillars(history, CONFIG);
          const after = computePillars([...history, log(pillar, xp, Date.now())], CONFIG);
          for (const id of PILLAR_IDS) {
            expect(after[id].level).toBeGreaterThanOrEqual(before[id].level);
          }
        },
      ),
      { numRuns: 400 },
    );
  });

  it("rank index never decreases as overall level rises", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 400 }), fc.integer({ min: 0, max: 60 }), (base, bump) => {
        const lo = currentRankIndex(base, CONFIG.ranks);
        const hi = currentRankIndex(base + bump, CONFIG.ranks);
        expect(hi).toBeGreaterThanOrEqual(lo);
      }),
      { numRuns: 1000 },
    );
  });

  it("the XP cost of a level never shrinks as you climb", () => {
    fc.assert(
      fc.property(curve(), fc.integer({ min: 0, max: 60 }), (c, level) => {
        expect(xpToNext(level + 1, c)).toBeGreaterThanOrEqual(xpToNext(level, c));
      }),
      { numRuns: 1000 },
    );
  });
});

describe("Overall level is exactly the sum of its parts", () => {
  it("holds for any random history", () => {
    fc.assert(
      fc.property(anyHistory(), (history) => {
        const pillars = computePillars(history, CONFIG);
        const summed = PILLAR_IDS.reduce((s, id) => s + pillars[id].level, 0);
        expect(overallLevel(pillars, CONFIG)).toBe(summed);
      }),
      { numRuns: 300 },
    );
  });
});
