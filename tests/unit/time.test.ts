import { describe, expect, it } from "vitest";

import { computeStreak, dayKey, daysSinceLastLog, activeDays } from "../../src/engine/streak";
import { fixedClock, mutableClock } from "../../src/engine/clock";
import { at, log } from "../helpers";

/**
 * The streak is the only part of the app that can silently lie, because it
 * depends on "what day is it". Every case here pins the clock, so these run
 * identically in January and in July.
 */

describe("Late-night logging (4am patrol boundary)", () => {
  it("a 1:00am workout counts for the night before", () => {
    const lateNight = at(2026, 3, 10, 1, 30);
    expect(dayKey(lateNight, 4)).toBe(dayKey(at(2026, 3, 9, 22), 4));
  });

  it("a 5:00am workout counts for the new day", () => {
    expect(dayKey(at(2026, 3, 10, 5), 4)).toBe(dayKey(at(2026, 3, 10, 12), 4));
  });

  it("a 2am Tuesday log keeps a Monday-ending streak alive", () => {
    const history = [
      log("forge", 50, at(2026, 3, 8, 20)),
      log("forge", 50, at(2026, 3, 9, 20)),
      log("forge", 50, at(2026, 3, 10, 2)), // 2am Tuesday -> counts as Monday the 9th
    ];
    // Without the boundary this reads as 3 separate days; with it, the 9th is logged twice.
    expect(activeDays(history, 4).size).toBe(2);
    expect(computeStreak(history, fixedClock(at(2026, 3, 9, 23)), 4)).toBe(2);
  });
});

describe("Daylight saving transitions", () => {
  // 2026-03-08 is spring-forward in US zones; 2026-10-25 is the EU autumn change.
  // Constructed from local components, so whatever zone this machine runs in,
  // these are real consecutive local days.
  it("a streak survives the spring-forward weekend", () => {
    const history = [
      log("forge", 50, at(2026, 3, 6, 12)),
      log("forge", 50, at(2026, 3, 7, 12)),
      log("forge", 50, at(2026, 3, 8, 12)),
      log("forge", 50, at(2026, 3, 9, 12)),
    ];
    expect(computeStreak(history, fixedClock(at(2026, 3, 9, 20)))).toBe(4);
  });

  it("a streak survives the autumn fall-back weekend", () => {
    const history = [
      log("forge", 50, at(2026, 10, 23, 12)),
      log("forge", 50, at(2026, 10, 24, 12)),
      log("forge", 50, at(2026, 10, 25, 12)),
      log("forge", 50, at(2026, 10, 26, 12)),
    ];
    expect(computeStreak(history, fixedClock(at(2026, 10, 26, 20)))).toBe(4);
  });

  it("every day in a 400-day sweep gets its own distinct key", () => {
    const keys = new Set<string>();
    const clock = mutableClock(at(2026, 1, 1, 12));
    for (let i = 0; i < 400; i++) {
      keys.add(dayKey(clock.now()));
      clock.advanceDays(1);
    }
    expect(keys.size).toBe(400);
  });
});

describe("Leap day", () => {
  it("2028-02-29 into 2028-03-01 is an unbroken streak", () => {
    const history = [
      log("forge", 50, at(2028, 2, 28, 12)),
      log("forge", 50, at(2028, 2, 29, 12)),
      log("forge", 50, at(2028, 3, 1, 12)),
    ];
    expect(computeStreak(history, fixedClock(at(2028, 3, 1, 20)))).toBe(3);
  });

  it("2026 has no Feb 29, so Feb 28 rolls straight into Mar 1", () => {
    const history = [log("forge", 50, at(2026, 2, 28, 12)), log("forge", 50, at(2026, 3, 1, 12))];
    expect(computeStreak(history, fixedClock(at(2026, 3, 1, 20)))).toBe(2);
  });
});

describe("Year boundary", () => {
  it("New Year's Eve into New Year's Day is unbroken", () => {
    const history = [
      log("forge", 50, at(2026, 12, 30, 12)),
      log("forge", 50, at(2026, 12, 31, 12)),
      log("forge", 50, at(2027, 1, 1, 12)),
    ];
    expect(computeStreak(history, fixedClock(at(2027, 1, 1, 20)))).toBe(3);
  });
});

describe("The grace rule", () => {
  it("today not being logged yet does not break yesterday's streak", () => {
    const history = [
      log("forge", 50, at(2026, 5, 10, 12)),
      log("forge", 50, at(2026, 5, 11, 12)),
    ];
    expect(computeStreak(history, fixedClock(at(2026, 5, 12, 9)))).toBe(2);
  });

  it("two full missed days does break it", () => {
    const history = [
      log("forge", 50, at(2026, 5, 10, 12)),
      log("forge", 50, at(2026, 5, 11, 12)),
    ];
    expect(computeStreak(history, fixedClock(at(2026, 5, 13, 9)))).toBe(0);
  });

  it("an empty history is a streak of zero, not a crash", () => {
    expect(computeStreak([], fixedClock(at(2026, 5, 13)))).toBe(0);
    expect(daysSinceLastLog([], fixedClock(at(2026, 5, 13)))).toBeNull();
  });
});

describe("daysSinceLastLog", () => {
  it("counts whole days, not hours", () => {
    const history = [log("forge", 50, at(2026, 5, 1, 23, 59))];
    expect(daysSinceLastLog(history, fixedClock(at(2026, 5, 2, 0, 5)))).toBe(1);
  });

  it("is zero on the same day", () => {
    const history = [log("forge", 50, at(2026, 5, 1, 8))];
    expect(daysSinceLastLog(history, fixedClock(at(2026, 5, 1, 23)))).toBe(0);
  });
});
