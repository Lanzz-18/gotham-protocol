import { dayIndex, isRestDay, weekStartOf } from "./streak";
import type { Clock } from "./clock";
import type { EngineConfig, LogEntry, PillarId } from "./types";

const DAY_MS = 86_400_000;

/** How many rest weeks fit in any run of REST_WINDOW_WEEKS weeks. */
export const REST_WEEKS_ALLOWED = 2;
export const REST_WINDOW_WEEKS = 4;

/** The Monday of the week you are standing in. */
export function currentWeekStart(clock: Clock, boundaryHour = 0): number {
  return weekStartOf(dayIndex(clock.now(), boundaryHour));
}

/** Rest weeks already taken in the three weeks before `week`. */
export function restWeeksUsed(restWeeks: readonly number[], week: number): number {
  return restWeeks.filter((w) => w < week && w > week - REST_WINDOW_WEEKS * 7).length;
}

/** Whether `week` can be a rest week without going over 2 in any 4 weeks. */
export function canRest(restWeeks: readonly number[], week: number): boolean {
  return restWeeks.includes(week) || restWeeksUsed(restWeeks, week) < REST_WEEKS_ALLOWED;
}

/** The first Monday, from `week` on, where a rest week is allowed again. */
export function nextRestWeek(restWeeks: readonly number[], week: number): number {
  let w = week;
  for (let i = 0; i < REST_WINDOW_WEEKS && !canRest(restWeeks, w); i++) w += 7;
  return w;
}

/** Local-midnight timestamp for a day index — the inverse of dayIndex. */
export function dayIndexToTs(idx: number): number {
  const u = new Date(idx * DAY_MS);
  return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate()).getTime();
}

/** The Monday of the most recent week that is fully over. */
export function lastFullWeekStart(clock: Clock, boundaryHour = 0): number {
  return weekStartOf(dayIndex(clock.now(), boundaryHour)) - 7;
}

export interface PillarWeek {
  id: PillarId;
  name: string;
  nemesis: string;
  xp: number;
  logs: number;
  /** Days that are over, came after the pillar's first-ever log, and had no log for it. */
  missedDays: number;
}

export interface WeekSummary {
  /** Day index of the Monday. */
  start: number;
  /** Local midnight of Monday and of Sunday. */
  startTs: number;
  endTs: number;
  xp: number;
  logs: number;
  activeDays: number;
  /** XP the week before, for the up/down comparison. Rest weeks are skipped. */
  prevXp: number;
  /** Taken off with "I'm tired Alfred". */
  rest: boolean;
  best: { ts: number; xp: number } | null;
  pillars: PillarWeek[];
  /** True once anything at all was logged on or before this week's Sunday. */
  started: boolean;
}

/** Everything the debrief needs about one Monday-to-Sunday week. */
export function weekSummary(
  history: readonly LogEntry[],
  config: EngineConfig,
  start: number,
  clock: Clock,
): WeekSummary {
  const b = config.dayBoundaryHour;
  const restWeeks = config.restWeeks ?? [];
  const end = start + 6;
  // A rest week would make the next week look like a huge jump, so compare
  // against the last week that wasn't one.
  let prevStart = start - 7;
  for (let i = 0; i < 52 && restWeeks.includes(prevStart); i++) prevStart -= 7;
  // Same rule as the nemesis: the day you are standing in is never counted as missed.
  const lastOver = Math.min(end, dayIndex(clock.now(), b) - 1);

  const perDay = new Map<number, number>();
  const firstLog = new Map<PillarId, number>();
  const pillarDays = new Map<PillarId, Set<number>>();
  const pillarXp = new Map<PillarId, { xp: number; logs: number }>();
  let xp = 0;
  let logs = 0;
  let prevXp = 0;
  let started = false;

  for (const h of history) {
    const idx = dayIndex(h.ts, b);
    const v = Number.isFinite(h.xp) ? h.xp : 0;
    if (idx <= end) started = true;
    if (idx < (firstLog.get(h.pillar) ?? Infinity)) firstLog.set(h.pillar, idx);
    if (idx >= prevStart && idx <= prevStart + 6) prevXp += v;
    if (idx < start || idx > end) continue;

    xp += v;
    logs++;
    perDay.set(idx, (perDay.get(idx) ?? 0) + v);
    if (!pillarDays.has(h.pillar)) pillarDays.set(h.pillar, new Set());
    pillarDays.get(h.pillar)!.add(idx);
    const px = pillarXp.get(h.pillar) ?? { xp: 0, logs: 0 };
    px.xp += v;
    px.logs++;
    pillarXp.set(h.pillar, px);
  }

  let best: WeekSummary["best"] = null;
  for (const [idx, v] of perDay) {
    if (v > 0 && (!best || v > best.xp)) best = { ts: dayIndexToTs(idx), xp: v };
  }

  const pillars = config.pillars.map((p): PillarWeek => {
    const first = firstLog.get(p.id);
    const days = pillarDays.get(p.id) ?? new Set<number>();
    let missedDays = 0;
    if (first !== undefined) {
      for (let d = Math.max(start, first); d <= lastOver; d++) {
        if (!days.has(d) && !isRestDay(d, restWeeks)) missedDays++;
      }
    }
    const px = pillarXp.get(p.id) ?? { xp: 0, logs: 0 };
    return { id: p.id, name: p.name, nemesis: p.nemesis ?? "THE VOID", xp: px.xp, logs: px.logs, missedDays };
  });

  return {
    start,
    startTs: dayIndexToTs(start),
    endTs: dayIndexToTs(end),
    xp,
    logs,
    activeDays: perDay.size,
    prevXp,
    rest: restWeeks.includes(start),
    best,
    pillars,
    started,
  };
}

/**
 * One line of advice for the week. It points at the next move, never at the
 * miss itself — the app's rule is that it never punishes you.
 */
export function debriefLine(w: WeekSummary): string {
  if (w.rest) return "Rest week. The villains held position. Back at it Monday.";
  if (w.logs === 0) return "A quiet week. One log tomorrow and the fight is back on.";

  const worst = w.pillars.reduce<PillarWeek | null>(
    (a, p) => (p.missedDays > (a?.missedDays ?? 0) ? p : a),
    null,
  );
  if (worst && worst.missedDays >= 3) {
    return `${worst.nemesis} took ${worst.missedDays} days from ${worst.name}. One log there tomorrow starts pushing back.`;
  }

  if (w.prevXp > 0) {
    const change = (w.xp - w.prevXp) / w.prevXp;
    if (change >= 0.1) return `Up ${Math.round(change * 100)}% on the week before. Keep the pressure on.`;
    if (change <= -0.1) return "Lighter than the week before. Pick one pillar and win it tomorrow.";
  }
  return "Steady week. Same again.";
}
