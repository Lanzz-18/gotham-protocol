import { describe, expect, it } from "vitest";

import { computeStreak, dayIndex, weekStartOf } from "../../src/engine/streak";
import { fixedClock } from "../../src/engine/clock";
import { computeNemesis } from "../../src/engine/nemesis";
import {
  canRest, debriefLine, lastFullWeekStart, nextRestWeek, restWeeksUsed, weekSummary,
} from "../../src/engine/week";
import { CONFIG, at, log } from "../helpers";

// Friday 2 Oct 2026. The last full week is Mon 21 Sep – Sun 27 Sep.
const NOW = fixedClock(at(2026, 10, 2, 15));
const B = CONFIG.dayBoundaryHour;
const LAST = lastFullWeekStart(NOW, B);

describe("Week boundaries", () => {
  it("weeks start on Monday", () => {
    for (let d = 21; d <= 27; d++) {
      expect(weekStartOf(dayIndex(at(2026, 9, d), B))).toBe(dayIndex(at(2026, 9, 21), B));
    }
    expect(weekStartOf(dayIndex(at(2026, 9, 28), B))).toBe(dayIndex(at(2026, 9, 28), B));
  });

  it("the last full week is the one before the week you are in", () => {
    expect(LAST).toBe(dayIndex(at(2026, 9, 21), B));
    const w = weekSummary([], CONFIG, LAST, NOW);
    expect(new Date(w.startTs).getDate()).toBe(21);
    expect(new Date(w.endTs).getDate()).toBe(27);
  });

  it("a 1am Monday log still belongs to Sunday, and so to the earlier week", () => {
    const w = weekSummary([log("forge", 50, at(2026, 9, 28, 1))], CONFIG, LAST, NOW);
    expect(w.xp).toBe(50);
  });
});

describe("The numbers", () => {
  const history = [
    log("forge", 50, at(2026, 9, 21)),
    log("forge", 80, at(2026, 9, 21)),
    log("craft", 40, at(2026, 9, 23)),
    log("forge", 50, at(2026, 9, 15)), // the week before
    log("forge", 999, at(2026, 9, 29)), // this week, out of range
  ];
  const w = weekSummary(history, CONFIG, LAST, NOW);

  it("counts only the week's own logs", () => {
    expect(w.xp).toBe(170);
    expect(w.logs).toBe(3);
    expect(w.activeDays).toBe(2);
  });

  it("carries the previous week for comparison", () => {
    expect(w.prevXp).toBe(50);
  });

  it("finds the best day", () => {
    expect(w.best?.xp).toBe(130);
    expect(new Date(w.best!.ts).getDate()).toBe(21);
  });

  it("counts missed days only after a pillar's first-ever log", () => {
    const forge = w.pillars.find((p) => p.id === "forge")!;
    const craft = w.pillars.find((p) => p.id === "craft")!;
    const archive = w.pillars.find((p) => p.id === "archive")!;
    expect(forge.missedDays).toBe(6); // logged Monday only, started the week before
    expect(craft.missedDays).toBe(4); // first log Wednesday — Mon/Tue don't count
    expect(archive.missedDays).toBe(0); // never started
  });
});

describe("The current week is never charged for today", () => {
  it("only days that are over count as missed", () => {
    const thisWeek = weekStartOf(dayIndex(NOW.now(), B)); // Mon 28 Sep
    const w = weekSummary([log("forge", 50, at(2026, 9, 28))], CONFIG, thisWeek, NOW);
    // Tue, Wed, Thu are over; Friday is today.
    expect(w.pillars.find((p) => p.id === "forge")!.missedDays).toBe(3);
  });
});

describe("The debrief line", () => {
  it("says the first debrief is coming when nothing was logged yet", () => {
    expect(weekSummary([], CONFIG, LAST, NOW).started).toBe(false);
  });

  it("names the villain that took the most days, once it's 3 or more", () => {
    const w = weekSummary(
      [log("mirror", 30, at(2026, 9, 14)), log("forge", 50, at(2026, 9, 21))],
      CONFIG, LAST, NOW,
    );
    expect(debriefLine(w)).toMatch(/^TWO-FACE took 7 days from THE MIRROR/);
  });

  it("calls out a real jump on the week before", () => {
    const history = Array.from({ length: 7 }, (_, i) => log("forge", 50, at(2026, 9, 21 + i)));
    history.push(log("forge", 100, at(2026, 9, 14)));
    expect(debriefLine(weekSummary(history, CONFIG, LAST, NOW))).toMatch(/^Up 250%/);
  });

  it("a rest week gets its own line", () => {
    const w = weekSummary([log("forge", 50, at(2026, 9, 14))], { ...CONFIG, restWeeks: [LAST] }, LAST, NOW);
    expect(w.rest).toBe(true);
    expect(debriefLine(w)).toMatch(/^Rest week/);
  });

  it("never reads as a punishment — every line points at the next move", () => {
    const quiet = weekSummary([log("forge", 50, at(2026, 9, 1))], CONFIG, LAST, NOW);
    expect(debriefLine(quiet)).toMatch(/tomorrow/);
  });
});

describe("I'm tired Alfred — a rest week", () => {
  const THIS = weekStartOf(dayIndex(NOW.now(), B)); // Mon 28 Sep
  const rested = { ...CONFIG, restWeeks: [LAST] }; // Mon 21 – Sun 27 Sep off

  it("bridges the streak: rest days neither add to it nor break it", () => {
    const history = [
      ...Array.from({ length: 7 }, (_, i) => log("forge", 50, at(2026, 9, 14 + i))), // 14–20 Sep
      ...Array.from({ length: 4 }, (_, i) => log("forge", 50, at(2026, 9, 28 + i))), // 28 Sep – 1 Oct
    ];
    expect(computeStreak(history, NOW, B)).toBe(4);
    expect(computeStreak(history, NOW, B, rested.restWeeks)).toBe(11);
  });

  it("a day you did log in a rest week still counts toward the streak", () => {
    const history = [log("forge", 50, at(2026, 9, 20)), log("forge", 50, at(2026, 9, 22))];
    // Seen from Monday 28 Sep: 22 Sep logged, the rest of that week bridged, 20 Sep logged.
    expect(computeStreak(history, fixedClock(at(2026, 9, 28, 15)), B, rested.restWeeks)).toBe(2);
  });

  it("the villains hold position for the whole week", () => {
    const history = [log("forge", 50, at(2026, 9, 14))];
    expect(computeNemesis(history, CONFIG, NOW).forge.missedDays).toBe(17);
    expect(computeNemesis(history, rested, NOW).forge.missedDays).toBe(10);
  });

  it("the debrief charges no missed days for it", () => {
    const w = weekSummary([log("forge", 50, at(2026, 9, 14))], rested, LAST, NOW);
    expect(w.pillars.every((p) => p.missedDays === 0)).toBe(true);
  });

  it("the week after compares against the last real week, skipping the rest week", () => {
    const history = [log("forge", 100, at(2026, 9, 15)), log("forge", 10, at(2026, 9, 22))];
    expect(weekSummary(history, CONFIG, THIS, NOW).prevXp).toBe(10);
    expect(weekSummary(history, rested, THIS, NOW).prevXp).toBe(100);
  });
});

describe("The limit: 2 rest weeks in any 4", () => {
  const W = 1000 * 7 + 4; // any Monday
  it("allows a third only once one has rolled out of the 4-week window", () => {
    expect(canRest([W - 7], W)).toBe(true);
    expect(canRest([W - 7, W - 14], W)).toBe(false);
    expect(canRest([W - 14, W - 21], W)).toBe(false);
    expect(canRest([W - 21, W - 28], W)).toBe(true);
    expect(restWeeksUsed([W - 21, W - 28], W)).toBe(1);
  });

  it("a week already taken can always stay taken", () => {
    expect(canRest([W - 7, W - 14, W], W)).toBe(true);
  });

  it("says when the next rest week opens up", () => {
    expect(nextRestWeek([W - 7, W - 14], W)).toBe(W + 14);
    expect(nextRestWeek([], W)).toBe(W);
  });
});
