import { describe, expect, it } from "vitest";

import { dayIndex } from "../../src/engine/streak";
import { fixedClock } from "../../src/engine/clock";
import { debriefLine, lastFullWeekStart, weekStartOf, weekSummary } from "../../src/engine/week";
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

  it("never reads as a punishment — every line points at the next move", () => {
    const quiet = weekSummary([log("forge", 50, at(2026, 9, 1))], CONFIG, LAST, NOW);
    expect(debriefLine(quiet)).toMatch(/tomorrow/);
  });
});
