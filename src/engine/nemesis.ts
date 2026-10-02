import { dayIndex, isRestDay } from "./streak";
import { dayIndexToTs } from "./week";
import { levelFromTotal, pillarTotalXP } from "./xp";
import type { Clock } from "./clock";
import type { EngineConfig, LogEntry, PillarId } from "./types";

export interface NemesisState {
  pillar: PillarId;
  name: string;
  /** Days that are fully over and carried no log for this pillar. */
  missedDays: number;
  xp: number;
  level: number;
  /** True until the pillar has ever been logged — no villain exists yet. */
  dormant: boolean;
}

export interface TugOfWar {
  playerShare: number;
  villainShare: number;
  losing: boolean;
}

const FALLBACK_NAME = "THE VOID";

/**
 * Days fully missed for one pillar.
 *
 * The window opens on the day of your FIRST log for that pillar — you cannot
 * miss a habit you had not started — and closes YESTERDAY. The day you are
 * standing in is never counted, because it is not over yet. Days in a rest
 * week are never counted either: the villain holds position.
 */
export function missedDaysFor(
  history: readonly LogEntry[],
  pillar: PillarId,
  clock: Clock,
  boundaryHour = 0,
  restWeeks: readonly number[] = [],
): number {
  let first = Infinity;
  const active = new Set<number>();

  for (const h of history) {
    if (h.pillar !== pillar) continue;
    const idx = dayIndex(h.ts, boundaryHour);
    if (idx < first) first = idx;
    active.add(idx);
  }
  if (first === Infinity) return 0;

  const windowEnd = dayIndex(clock.now(), boundaryHour) - 1;
  let missed = 0;
  for (let d = first; d <= windowEnd; d++) {
    if (!active.has(d) && !isRestDay(d, restWeeks)) missed++;
  }
  return missed;
}

/** The villain standing opposite every pillar. */
export function computeNemesis(
  history: readonly LogEntry[],
  config: EngineConfig,
  clock: Clock,
): Record<PillarId, NemesisState> {
  const rate = config.nemesis?.xpPerMissedDay ?? 20;
  const out: Record<PillarId, NemesisState> = {};

  for (const p of config.pillars) {
    const missedDays = missedDaysFor(history, p.id, clock, config.dayBoundaryHour, config.restWeeks);
    const xp = missedDays * rate;
    out[p.id] = {
      pillar: p.id,
      name: p.nemesis ?? FALLBACK_NAME,
      missedDays,
      xp,
      level: levelFromTotal(xp, config.xpCurve).level,
      dormant: !history.some((h) => h.pillar === p.id),
    };
  }
  return out;
}

/** How far back the rogues gallery looks when it measures a villain's power. */
export const POWER_WINDOW_DAYS = 14;

export interface VillainPower {
  pillar: PillarId;
  name: string;
  /** Share of the recent days that counted where this pillar went unlogged, 0..1. */
  power: number;
  /** Power now minus power in the window before. Positive = the villain is gaining. */
  trend: number;
  missed: number;
  /** Days in the window that counted: after the first log, not a rest day, and today only once logged. */
  counted: number;
  /** Never logged — no villain exists yet. */
  dormant: boolean;
}

function windowMisses(
  active: ReadonlySet<number>,
  first: number,
  from: number,
  to: number,
  restWeeks: readonly number[],
  today: number,
) {
  let missed = 0;
  let counted = 0;
  for (let d = Math.max(from, first); d <= to; d++) {
    if (isRestDay(d, restWeeks)) continue;
    // Today counts the moment you log it, but isn't a miss until it's over —
    // otherwise every villain would jump at the day boundary each morning.
    if (d === today && !active.has(d)) continue;
    counted++;
    if (!active.has(d)) missed++;
  }
  return { missed, counted };
}

/**
 * Each villain's power from your RECENT progress, not your whole history: the
 * share of the last POWER_WINDOW_DAYS days (today included) its pillar went
 * untouched. Days before the pillar's first log and rest days never count.
 */
export function villainPowers(
  history: readonly LogEntry[],
  config: EngineConfig,
  clock: Clock,
  windowDays = POWER_WINDOW_DAYS,
): VillainPower[] {
  const b = config.dayBoundaryHour;
  const rest = config.restWeeks ?? [];
  const end = dayIndex(clock.now(), b);
  const start = end - windowDays + 1;

  return config.pillars.map((p) => {
    let first = Infinity;
    const active = new Set<number>();
    for (const h of history) {
      if (h.pillar !== p.id) continue;
      const idx = dayIndex(h.ts, b);
      if (idx < first) first = idx;
      active.add(idx);
    }
    const name = p.nemesis ?? FALLBACK_NAME;
    if (first === Infinity) {
      return { pillar: p.id, name, power: 0, trend: 0, missed: 0, counted: 0, dormant: true };
    }

    const now = windowMisses(active, first, start, end, rest, end);
    const before = windowMisses(active, first, start - windowDays, start - 1, rest, end);
    const power = now.counted ? now.missed / now.counted : 0;
    // No earlier window to compare against reads as flat, not as a surge.
    const prior = before.counted ? before.missed / before.counted : power;
    return { pillar: p.id, name, power, trend: power - prior, missed: now.missed, counted: now.counted, dormant: false };
  });
}

/** How one day in the power window counted for a villain. */
export type DayMark = "logged" | "missed" | "rest" | "before" | "today";

/**
 * The villain's last POWER_WINDOW_DAYS, oldest first, one mark per day — the
 * same rules villainPowers counts by, laid out so the case file can show them:
 * "before" the pillar's first log, "rest" in a rest week, "today" while today
 * is still unlogged, otherwise "logged" or "missed".
 */
export function villainDays(
  history: readonly LogEntry[],
  config: EngineConfig,
  clock: Clock,
  pillar: PillarId,
  windowDays = POWER_WINDOW_DAYS,
): Array<{ ts: number; mark: DayMark }> {
  const b = config.dayBoundaryHour;
  const rest = config.restWeeks ?? [];
  const today = dayIndex(clock.now(), b);
  let first = Infinity;
  const active = new Set<number>();
  for (const h of history) {
    if (h.pillar !== pillar) continue;
    const idx = dayIndex(h.ts, b);
    if (idx < first) first = idx;
    active.add(idx);
  }

  const out: Array<{ ts: number; mark: DayMark }> = [];
  for (let d = today - windowDays + 1; d <= today; d++) {
    let mark: DayMark;
    if (d < first) mark = "before";
    else if (isRestDay(d, rest)) mark = "rest";
    else if (active.has(d)) mark = "logged";
    else if (d === today) mark = "today";
    else mark = "missed";
    out.push({ ts: dayIndexToTs(d), mark });
  }
  return out;
}

export interface TodayThreat {
  /** Share of pillars not logged yet today, 0..1. */
  threat: number;
  pillars: Array<{ pillar: PillarId; name: string; villain: string; handled: boolean }>;
  loose: number;
  /** Today sits in a rest week — the threat is on hold. */
  rest: boolean;
}

/**
 * Tonight's status report: every pillar is one rogue to deal with today, and
 * the threat is the share still loose. Counts all pillars, started or not,
 * since today's checklist is the whole protocol.
 */
export function todayThreat(history: readonly LogEntry[], config: EngineConfig, clock: Clock): TodayThreat {
  const b = config.dayBoundaryHour;
  const today = dayIndex(clock.now(), b);
  const done = new Set<PillarId>();
  for (const h of history) if (dayIndex(h.ts, b) === today) done.add(h.pillar);

  const pillars = config.pillars.map((p) => ({
    pillar: p.id,
    name: p.name,
    villain: p.nemesis ?? FALLBACK_NAME,
    handled: done.has(p.id),
  }));
  const loose = pillars.filter((p) => !p.handled).length;
  return {
    threat: pillars.length ? loose / pillars.length : 0,
    pillars,
    loose,
    rest: isRestDay(today, config.restWeeks ?? []),
  };
}

/** How the pillar bar splits between you and your villain. */
export function tugOfWar(playerXp: number, villainXp: number): TugOfWar {
  const p = Math.max(0, Number.isFinite(playerXp) ? playerXp : 0);
  const v = Math.max(0, Number.isFinite(villainXp) ? villainXp : 0);
  const total = p + v;
  if (total <= 0) return { playerShare: 0.5, villainShare: 0.5, losing: false };
  return { playerShare: p / total, villainShare: v / total, losing: v > p };
}

/** Convenience for the UI: the tug of war for one pillar, straight from history. */
export function tugOfWarFor(
  history: readonly LogEntry[],
  pillar: PillarId,
  config: EngineConfig,
  clock: Clock,
): TugOfWar {
  const villainXp = missedDaysFor(history, pillar, clock, config.dayBoundaryHour, config.restWeeks)
    * (config.nemesis?.xpPerMissedDay ?? 20);
  return tugOfWar(pillarTotalXP(history, pillar), villainXp);
}
