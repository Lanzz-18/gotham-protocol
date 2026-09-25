import { describe, expect, it } from "vitest";

import { averagePerDay, bestDay, dailySeries, rankProgress } from "../../src/engine/series";
import { fixedClock } from "../../src/engine/clock";
import { at, log } from "../helpers";

/** Chart data is still data — the shapes the Stats page draws are pinned here. */

describe("dailySeries", () => {
  const clock = fixedClock(at(2026, 5, 10, 12));

  it("returns exactly one point per day, gaps included", () => {
    const s = dailySeries([log("forge", 50, at(2026, 5, 8, 12))], clock, 7, 4);
    expect(s).toHaveLength(7);
    expect(s.filter((p) => p.xp === 0)).toHaveLength(6);
  });

  it("puts each log on its own day and keeps a running lifetime total", () => {
    const s = dailySeries(
      [
        log("forge", 50, at(2026, 5, 8, 12)),
        log("craft", 30, at(2026, 5, 9, 12)),
        log("forge", 20, at(2026, 5, 10, 12)),
      ],
      clock, 5, 4,
    );
    expect(s.map((p) => p.xp)).toEqual([0, 0, 50, 30, 20]);
    expect(s.map((p) => p.total)).toEqual([0, 0, 50, 80, 100]);
  });

  it("carries XP earned before the window into the opening total", () => {
    const s = dailySeries(
      [log("forge", 500, at(2026, 1, 1, 12)), log("forge", 40, at(2026, 5, 10, 12))],
      clock, 3, 4,
    );
    expect(s[0].total).toBe(500);
    expect(s[2].total).toBe(540);
  });

  it("filters to one pillar when asked", () => {
    const history = [log("forge", 50, at(2026, 5, 10, 12)), log("craft", 90, at(2026, 5, 10, 12))];
    expect(dailySeries(history, clock, 3, 4, "forge").at(-1)?.xp).toBe(50);
    expect(dailySeries(history, clock, 3, 4, "craft").at(-1)?.xp).toBe(90);
  });

  it("is all zeroes for an empty history rather than empty", () => {
    const s = dailySeries([], clock, 4, 4);
    expect(s).toHaveLength(4);
    expect(s.every((p) => p.xp === 0 && p.total === 0)).toBe(true);
  });
});

describe("summary stats", () => {
  const clock = fixedClock(at(2026, 5, 10, 12));

  it("bestDay picks the biggest day and ignores empty ones", () => {
    const s = dailySeries(
      [log("forge", 50, at(2026, 5, 8, 12)), log("forge", 120, at(2026, 5, 9, 12))],
      clock, 5, 4,
    );
    expect(bestDay(s)?.xp).toBe(120);
  });

  it("bestDay is null when nothing was logged", () => {
    expect(bestDay(dailySeries([], clock, 5, 4))).toBeNull();
  });

  it("averagePerDay counts the zero days too", () => {
    const s = dailySeries([log("forge", 100, at(2026, 5, 10, 12))], clock, 4, 4);
    expect(averagePerDay(s)).toBe(25);
  });
});

describe("rankProgress", () => {
  it("is 0 on arrival and 1 at the next threshold", () => {
    expect(rankProgress(24, 24, 36)).toBe(0);
    expect(rankProgress(36, 24, 36)).toBe(1);
    expect(rankProgress(30, 24, 36)).toBeCloseTo(0.5);
  });

  it("reads full at max rank", () => {
    expect(rankProgress(200, 156, null)).toBe(1);
  });

  it("never leaves 0..1 even with nonsense thresholds", () => {
    expect(rankProgress(5, 24, 36)).toBe(0);
    expect(rankProgress(99, 24, 36)).toBe(1);
    expect(rankProgress(30, 40, 40)).toBe(1);
  });
});
