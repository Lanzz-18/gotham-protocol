import { describe, expect, it } from "vitest";

import { computePillars, overallLevel, currentRank, nextRank, progressToNextOverall } from "../../src/engine/ranks";
import { computeStreak, daysSinceLastLog } from "../../src/engine/streak";
import { levelFromTotal, lifetimeXP } from "../../src/engine/xp";
import { fixedClock } from "../../src/engine/clock";
import { CONFIG, PILLAR_IDS, at, log } from "../helpers";

/**
 * THE ENCOURAGEMENT CONTRACT
 *
 * The product promise is that this app never punishes you. Bars do not decay,
 * numbers never go backwards on their own, and coming back after months away
 * still shows a usable dashboard. Those are product rules, not function specs,
 * so they are pinned here as executable rules rather than left in a README.
 */

describe("Nothing the user sees is ever negative", () => {
  it("holds for an empty profile", () => {
    const pillars = computePillars([], CONFIG);
    for (const id of PILLAR_IDS) {
      expect(pillars[id].level).toBeGreaterThanOrEqual(0);
      expect(pillars[id].xp).toBeGreaterThanOrEqual(0);
    }
    expect(overallLevel(pillars, CONFIG)).toBe(0);
    expect(lifetimeXP([])).toBe(0);
    expect(progressToNextOverall(pillars, CONFIG).frac).toBeGreaterThanOrEqual(0);
  });

  it("holds even when a corrupt entry carries NaN or a negative XP value", () => {
    const history = [
      log("forge", Number.NaN, at(2026, 5, 1)),
      log("forge", -9999, at(2026, 5, 2)),
      log("forge", 50, at(2026, 5, 3)),
    ];
    const pillars = computePillars(history, CONFIG);
    expect(pillars.forge.level).toBeGreaterThanOrEqual(0);
    expect(pillars.forge.xp).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(pillars.forge.xp)).toBe(true);
  });

  it("a level is never fractional", () => {
    for (const total of [0, 1, 79, 80, 81, 173, 5000, 250_000]) {
      const r = levelFromTotal(total, CONFIG.xpCurve);
      expect(Number.isInteger(r.level)).toBe(true);
    }
  });
});

describe("Bars never decay on their own", () => {
  it("six months of silence loses you nothing", () => {
    const history = [log("forge", 400, at(2026, 1, 15)), log("craft", 300, at(2026, 1, 15))];
    const justAfter = computePillars(history, CONFIG);
    const halfYearLater = computePillars(history, CONFIG);

    expect(halfYearLater.forge.level).toBe(justAfter.forge.level);
    expect(halfYearLater.forge.xp).toBe(justAfter.forge.xp);
    expect(overallLevel(halfYearLater, CONFIG)).toBe(overallLevel(justAfter, CONFIG));
  });

  it("only an explicit delete can move a level down", () => {
    const history = [log("forge", 400, at(2026, 1, 15))];
    const before = computePillars(history, CONFIG);
    const after = computePillars(history.slice(0, 0), CONFIG);
    expect(before.forge.level).toBeGreaterThan(0);
    expect(after.forge.level).toBe(0);
  });
});

describe("Coming back after a long absence", () => {
  const history = [
    log("forge", 400, at(2026, 1, 10)),
    log("craft", 300, at(2026, 1, 11)),
    log("archive", 200, at(2026, 1, 12)),
  ];
  const clock = fixedClock(at(2027, 2, 15)); // 400 days later

  it("the streak is zero but the levels are untouched", () => {
    const pillars = computePillars(history, CONFIG);
    expect(computeStreak(history, clock, CONFIG.dayBoundaryHour)).toBe(0);
    expect(pillars.forge.level).toBeGreaterThan(0);
    expect(overallLevel(pillars, CONFIG)).toBeGreaterThan(0);
  });

  it("the dashboard still renders real numbers, not null or NaN", () => {
    const pillars = computePillars(history, CONFIG);
    const overall = overallLevel(pillars, CONFIG);
    const rank = currentRank(overall, CONFIG.ranks);
    const prog = progressToNextOverall(pillars, CONFIG);

    expect(rank.title).toBeTruthy();
    expect(Number.isFinite(prog.frac)).toBe(true);
    expect(prog.frac).toBeGreaterThanOrEqual(0);
    expect(prog.frac).toBeLessThan(1);
    expect(daysSinceLastLog(history, clock, CONFIG.dayBoundaryHour)).toBeGreaterThan(300);
  });

  it("a single log after the gap immediately restarts the streak at 1", () => {
    const returned = [...history, log("forge", 50, at(2027, 2, 15, 10))];
    expect(computeStreak(returned, clock, CONFIG.dayBoundaryHour)).toBe(1);
  });
});

describe("There is always a next thing to chase", () => {
  it("every rank below the top names a next rank", () => {
    for (let overall = 0; overall < 156; overall++) {
      expect(nextRank(overall, CONFIG.ranks), `overall ${overall}`).not.toBeNull();
    }
  });

  it("the top rank is a real destination, not a dead end with a broken label", () => {
    const top = currentRank(200, CONFIG.ranks);
    expect(top.title).toBe("The Legend");
    expect(nextRank(200, CONFIG.ranks)).toBeNull();
  });

  it("the progress bar is never shown as full, so there is always headroom", () => {
    const history = Array.from({ length: 60 }, (_, i) => log("forge", 79, at(2026, 1, 1 + (i % 28), 12)));
    const pillars = computePillars(history, CONFIG);
    expect(progressToNextOverall(pillars, CONFIG).frac).toBeLessThan(1);
  });
});
