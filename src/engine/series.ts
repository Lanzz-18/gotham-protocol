import { dayIndex } from "./streak";
import type { Clock } from "./clock";
import type { LogEntry, PillarId } from "./types";

export interface DayPoint {
  /** Midnight-anchored timestamp for the day, in local time. */
  ts: number;
  /** XP earned on that day. */
  xp: number;
  /** Lifetime XP at the end of that day. */
  total: number;
  /** Number of logs that day. */
  logs: number;
}

/**
 * One point per day for the last `days` days, ending today. Days with no
 * activity are present with zeroes, so a chart never has to guess at gaps.
 */
export function dailySeries(
  history: readonly LogEntry[],
  clock: Clock,
  days: number,
  boundaryHour = 0,
  pillar?: PillarId,
): DayPoint[] {
  const rows = pillar ? history.filter((h) => h.pillar === pillar) : history;
  const today = dayIndex(clock.now(), boundaryHour);
  const first = today - days + 1;

  const perDay = new Map<number, { xp: number; logs: number }>();
  let before = 0; // lifetime XP earned before the window opens

  for (const h of rows) {
    const idx = dayIndex(h.ts, boundaryHour);
    const xp = Number.isFinite(h.xp) ? h.xp : 0;
    if (idx < first) {
      before += xp;
      continue;
    }
    if (idx > today) continue;
    const cur = perDay.get(idx) ?? { xp: 0, logs: 0 };
    cur.xp += xp;
    cur.logs += 1;
    perDay.set(idx, cur);
  }

  const out: DayPoint[] = [];
  let running = before;
  const anchor = new Date(clock.now());
  anchor.setHours(0, 0, 0, 0);

  for (let i = 0; i < days; i++) {
    const idx = first + i;
    const d = perDay.get(idx) ?? { xp: 0, logs: 0 };
    running += d.xp;
    const ts = new Date(anchor);
    ts.setDate(ts.getDate() - (days - 1 - i));
    out.push({ ts: ts.getTime(), xp: d.xp, total: running, logs: d.logs });
  }
  return out;
}

/** Best single day in a series. Returns null for an all-zero window. */
export function bestDay(series: readonly DayPoint[]): DayPoint | null {
  let best: DayPoint | null = null;
  for (const p of series) if (p.xp > 0 && (!best || p.xp > best.xp)) best = p;
  return best;
}

/** Mean XP per day across the whole window, zero days included. */
export function averagePerDay(series: readonly DayPoint[]): number {
  if (series.length === 0) return 0;
  return series.reduce((s, p) => s + p.xp, 0) / series.length;
}

/**
 * Progress along the current rank, 0..1. Sits at 0 the moment you arrive at a
 * rank and reaches 1 as you touch the next threshold. Maxed rank reads 1.
 */
export function rankProgress(overall: number, from: number, to: number | null): number {
  if (to === null) return 1;
  const span = to - from;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (overall - from) / span));
}
