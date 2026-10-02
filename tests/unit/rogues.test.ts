import { describe, expect, it } from "vitest";

import { todayThreat, villainDays, villainPowers } from "../../src/engine/nemesis";
import { legendLevel } from "../../src/engine/ranks";
import { dayIndex } from "../../src/engine/streak";
import { fixedClock } from "../../src/engine/clock";
import { CONFIG, at, log } from "../helpers";

// Friday 2 Oct 2026, 3pm. The 14-day window is Sat 19 Sep – Fri 2 Oct, today included.
const NOW = fixedClock(at(2026, 10, 2, 15));
const B = CONFIG.dayBoundaryHour;
const forge = (h: Parameters<typeof villainPowers>[0], cfg = CONFIG) =>
  villainPowers(h, cfg, NOW).find((v) => v.pillar === "forge")!;
const daily = (fromDay: number, count: number, month = 9) =>
  Array.from({ length: count }, (_, i) => log("forge", 50, at(2026, month, fromDay + i)));

describe("Villain power from recent progress", () => {
  it("a pillar never logged has a dormant villain with no power", () => {
    const v = forge([]);
    expect(v.dormant).toBe(true);
    expect(v.power).toBe(0);
  });

  it("logging every day of the window, today included, keeps the villain at zero", () => {
    const v = forge([...daily(19, 12), log("forge", 50, at(2026, 10, 1)), log("forge", 50, at(2026, 10, 2, 9))]);
    expect(v.power).toBe(0);
    expect(v.counted).toBe(14);
  });

  it("today counts the moment it's logged", () => {
    const before = forge([log("forge", 50, at(2026, 9, 25))]);
    const after = forge([log("forge", 50, at(2026, 9, 25)), log("forge", 50, at(2026, 10, 2, 9))]);
    expect(before.missed).toBe(6); // 26 Sep – 1 Oct missed
    expect(before.counted).toBe(7); // 25 Sep – 1 Oct; today not logged yet, left out
    expect(after.counted).toBe(8); // today joins as a logged day
    expect(after.power).toBeLessThan(before.power);
  });

  it("an unlogged today is not a miss yet, so nothing jumps at the day boundary", () => {
    const v = forge([log("forge", 50, at(2026, 10, 1))]);
    expect(v.counted).toBe(1);
    expect(v.missed).toBe(0);
  });

  it("only counts days from the pillar's first log", () => {
    const v = forge([log("forge", 50, at(2026, 9, 25))]);
    expect(v.power).toBeCloseTo(6 / 7);
  });

  it("looks at recent days only — an old perfect run doesn't hide a recent slump", () => {
    const v = forge(daily(5, 14)); // perfect 5–18 Sep, nothing since
    expect(v.power).toBe(1);
    expect(v.trend).toBe(1);
  });

  it("trend goes negative when you're winning ground back", () => {
    const v = forge([log("forge", 50, at(2026, 9, 5)), ...daily(19, 12), log("forge", 50, at(2026, 10, 1)), log("forge", 50, at(2026, 10, 2, 9))]);
    expect(v.power).toBe(0);
    expect(v.trend).toBeCloseTo(-13 / 14); // the window before: 5 Sep logged, the other 13 days missed
  });

  it("rest-week days don't count either way", () => {
    const rested = { ...CONFIG, restWeeks: [dayIndex(at(2026, 9, 21), B)] }; // Mon 21 – Sun 27 Sep
    const v = forge(daily(5, 14), rested);
    expect(v.counted).toBe(6); // 19, 20 Sep and 28 Sep – 1 Oct; today unlogged
    expect(v.power).toBe(1);
  });
});

describe("Today's status report", () => {
  it("starts the day with every rogue loose — 100% threat", () => {
    const r = todayThreat([log("forge", 50, at(2026, 10, 1))], CONFIG, NOW); // yesterday doesn't help today
    expect(r.loose).toBe(CONFIG.pillars.length);
    expect(r.threat).toBe(1);
  });

  it("each pillar logged today handles one rogue", () => {
    const r = todayThreat(
      [log("forge", 50, at(2026, 10, 2, 8)), log("forge", 80, at(2026, 10, 2, 9)), log("archive", 30, at(2026, 10, 2, 10))],
      CONFIG, NOW,
    );
    expect(r.loose).toBe(3); // two logs on the same pillar still handle one rogue
    expect(r.threat).toBeCloseTo(3 / 5);
    expect(r.pillars.find((p) => p.pillar === "forge")?.handled).toBe(true);
    expect(r.pillars.find((p) => p.pillar === "craft")?.handled).toBe(false);
  });

  it("all five logged clears the threat", () => {
    const history = CONFIG.pillars.map((p) => log(p.id, 20, at(2026, 10, 2, 9)));
    expect(todayThreat(history, CONFIG, NOW).threat).toBe(0);
  });

  it("a log at 11:59pm last night is yesterday, not today", () => {
    const r = todayThreat([log("forge", 50, at(2026, 10, 1, 23, 59))], CONFIG, NOW);
    expect(r.pillars.find((p) => p.pillar === "forge")?.handled).toBe(false);
  });

  it("flags a rest week so the report can put the threat on hold", () => {
    const rested = { ...CONFIG, restWeeks: [dayIndex(at(2026, 9, 28), B)] };
    expect(todayThreat([], rested, NOW).rest).toBe(true);
    expect(todayThreat([], CONFIG, NOW).rest).toBe(false);
  });
});

describe("The case file's 14 days", () => {
  it("marks each day the way power counts it, oldest first", () => {
    const rested = { ...CONFIG, restWeeks: [dayIndex(at(2026, 9, 21), B)] }; // Mon 21 – Sun 27 Sep
    const days = villainDays([log("forge", 50, at(2026, 9, 20)), log("forge", 50, at(2026, 9, 28))], rested, NOW, "forge");
    expect(days).toHaveLength(14);
    expect(days.map((d) => d.mark)).toEqual([
      "before", // 19 Sep
      "logged", // 20 Sep — first log
      "rest", "rest", "rest", "rest", "rest", "rest", "rest", // 21–27 Sep
      "logged", // 28 Sep
      "missed", "missed", "missed", // 29 Sep – 1 Oct
      "today", // 2 Oct, not logged yet
    ]);
    expect(new Date(days[0].ts).getDate()).toBe(19);
    expect(new Date(days[13].ts).getDate()).toBe(2);
  });

  it("a pillar never logged is 'before' all the way through", () => {
    expect(villainDays([], CONFIG, NOW, "craft").every((d) => d.mark === "before")).toBe(true);
  });
});

describe("The legendary card", () => {
  it("steps up every two rank tiers, The Legend alone at the top", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(legendLevel)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5]);
  });
});
