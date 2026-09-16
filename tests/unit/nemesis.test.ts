import { describe, expect, it } from "vitest";

import { computeNemesis, missedDaysFor, tugOfWar } from "../../src/engine/nemesis";
import { computePillars } from "../../src/engine/ranks";
import { fixedClock } from "../../src/engine/clock";
import { CONFIG, at, log } from "../helpers";

/**
 * THE NEMESIS
 *
 * Every pillar has a villain. The villain gains XP for each day you fully
 * missed that pillar — and only for days that are actually over. The day you
 * are standing in is never a miss, because it is not finished yet.
 */

const RATE = CONFIG.nemesis.xpPerMissedDay;

describe("A villain cannot exist before you start", () => {
  it("a pillar with no logs has a dormant villain on zero XP", () => {
    const n = computeNemesis([], CONFIG, fixedClock(at(2026, 5, 20)));
    expect(n.forge.dormant).toBe(true);
    expect(n.forge.xp).toBe(0);
    expect(n.forge.missedDays).toBe(0);
  });

  it("days before your very first log are not misses", () => {
    // First ever forge log is 3 May. Nothing in January counts against you.
    const history = [log("forge", 50, at(2026, 5, 3, 12))];
    expect(missedDaysFor(history, "forge", fixedClock(at(2026, 5, 4, 12)), 4)).toBe(0);
  });
});

describe("The day you are standing in is never a miss", () => {
  it("logging only today means zero missed days", () => {
    const history = [log("forge", 50, at(2026, 5, 20, 9))];
    expect(missedDaysFor(history, "forge", fixedClock(at(2026, 5, 20, 23)), 4)).toBe(0);
  });

  it("an untouched today, with yesterday logged, is still zero", () => {
    const history = [log("forge", 50, at(2026, 5, 19, 12))];
    expect(missedDaysFor(history, "forge", fixedClock(at(2026, 5, 20, 23, 30)), 4)).toBe(0);
  });

  it("at 00:30 it is still last night, so nothing has been missed yet", () => {
    const history = [log("forge", 50, at(2026, 5, 19, 12))];
    expect(missedDaysFor(history, "forge", fixedClock(at(2026, 5, 21, 0, 30)), 4)).toBe(0);
  });

  it("the miss lands once the 4am boundary is crossed", () => {
    const history = [log("forge", 50, at(2026, 5, 19, 12))];
    expect(missedDaysFor(history, "forge", fixedClock(at(2026, 5, 21, 5, 0)), 4)).toBe(1);
  });
});

describe("Counting the days you actually missed", () => {
  it("five days after a single log, four are missed", () => {
    const history = [log("forge", 50, at(2026, 5, 1, 12))];
    expect(missedDaysFor(history, "forge", fixedClock(at(2026, 5, 6, 12)), 4)).toBe(4);
  });

  it("logging every single day leaves the villain on zero", () => {
    const history = Array.from({ length: 10 }, (_, i) => log("forge", 50, at(2026, 5, 1 + i, 12)));
    expect(missedDaysFor(history, "forge", fixedClock(at(2026, 5, 10, 20)), 4)).toBe(0);
  });

  it("a gap in the middle is counted", () => {
    const history = [
      log("forge", 50, at(2026, 5, 1, 12)),
      log("forge", 50, at(2026, 5, 5, 12)), // 2nd, 3rd, 4th missed
      log("forge", 50, at(2026, 5, 6, 12)),
    ];
    expect(missedDaysFor(history, "forge", fixedClock(at(2026, 5, 7, 9)), 4)).toBe(3);
  });

  it("two logs on one day still only count that day once", () => {
    const history = [
      log("forge", 50, at(2026, 5, 1, 8)),
      log("forge", 50, at(2026, 5, 1, 19)),
    ];
    expect(missedDaysFor(history, "forge", fixedClock(at(2026, 5, 3, 12)), 4)).toBe(1);
  });

  it("a 1am log counts for the night before, so that night is not a miss", () => {
    const history = [
      log("forge", 50, at(2026, 5, 1, 12)),
      log("forge", 50, at(2026, 5, 3, 1, 30)), // 1:30am on the 3rd -> counts as the 2nd
    ];
    expect(missedDaysFor(history, "forge", fixedClock(at(2026, 5, 3, 20)), 4)).toBe(0);
  });
});

describe("Villains do not share a grudge", () => {
  it("missing the gym does not feed the work villain", () => {
    const history = [
      log("forge", 50, at(2026, 5, 1, 12)),
      log("craft", 40, at(2026, 5, 1, 12)),
      log("craft", 40, at(2026, 5, 2, 12)),
      log("craft", 40, at(2026, 5, 3, 12)),
    ];
    const n = computeNemesis(history, CONFIG, fixedClock(at(2026, 5, 4, 12)));
    expect(n.forge.missedDays).toBe(2);
    expect(n.craft.missedDays).toBe(0);
  });

  it("every pillar gets its own named villain", () => {
    const n = computeNemesis([], CONFIG, fixedClock(at(2026, 5, 4)));
    const names = CONFIG.pillars.map((p) => n[p.id].name);
    expect(new Set(names).size).toBe(CONFIG.pillars.length);
    for (const name of names) expect(name.length).toBeGreaterThan(0);
  });
});

describe("Villain XP", () => {
  it("is missed days times the configured rate", () => {
    const history = [log("forge", 50, at(2026, 5, 1, 12))];
    const n = computeNemesis(history, CONFIG, fixedClock(at(2026, 5, 6, 12)));
    expect(n.forge.missedDays).toBe(4);
    expect(n.forge.xp).toBe(4 * RATE);
  });

  it("survives the spring-forward weekend without inventing a day", () => {
    const history = [log("forge", 50, at(2026, 3, 6, 12))];
    // 6th logged; 7th and 8th missed; 9th is today and does not count.
    expect(missedDaysFor(history, "forge", fixedClock(at(2026, 3, 9, 12)), 4)).toBe(2);
  });

  it("survives the autumn fall-back weekend without losing one", () => {
    const history = [log("forge", 50, at(2026, 10, 23, 12))];
    expect(missedDaysFor(history, "forge", fixedClock(at(2026, 10, 26, 12)), 4)).toBe(2);
  });
});

describe("The tug of war", () => {
  it("splits the bar in proportion to the two scores", () => {
    const t = tugOfWar(300, 100);
    expect(t.playerShare).toBeCloseTo(0.75);
    expect(t.villainShare).toBeCloseTo(0.25);
  });

  it("always sums to one", () => {
    for (const [p, v] of [[0, 500], [500, 0], [1, 1], [9999, 3]] as const) {
      const t = tugOfWar(p, v);
      expect(t.playerShare + t.villainShare).toBeCloseTo(1);
    }
  });

  it("sits dead even when nothing has happened yet", () => {
    expect(tugOfWar(0, 0).playerShare).toBeCloseTo(0.5);
  });

  it("says you are losing only when the villain is genuinely ahead", () => {
    expect(tugOfWar(100, 99).losing).toBe(false);
    expect(tugOfWar(100, 101).losing).toBe(true);
  });
});

describe("The nemesis never punishes you", () => {
  it("a villain on 10,000 XP does not move your level or your XP", () => {
    const history = [log("forge", 400, at(2026, 1, 1, 12))];
    const clockNow = fixedClock(at(2027, 6, 1, 12));

    const pillars = computePillars(history, CONFIG);
    const n = computeNemesis(history, CONFIG, clockNow);

    expect(n.forge.xp).toBeGreaterThan(5000);
    expect(pillars.forge.level).toBe(3);
    expect(pillars.forge.xp).toBe(115);
  });

  it("returning after a long absence leaves past misses banked, not erased", () => {
    const history = [
      log("forge", 50, at(2026, 1, 1, 12)),
      log("forge", 50, at(2026, 2, 1, 12)),
    ];
    const n = computeNemesis(history, CONFIG, fixedClock(at(2026, 2, 2, 12)));
    expect(n.forge.missedDays).toBe(30); // all of January after the 1st
  });

  it("never reports a negative villain score", () => {
    const history = [log("forge", 50, at(2026, 5, 10, 12))];
    for (const day of [10, 11, 12, 20]) {
      const n = computeNemesis(history, CONFIG, fixedClock(at(2026, 5, day, 12)));
      expect(n.forge.xp).toBeGreaterThanOrEqual(0);
      expect(n.forge.missedDays).toBeGreaterThanOrEqual(0);
    }
  });
});
