import type { Clock } from "./clock";
import type { LogEntry } from "./types";

const HOUR_MS = 3_600_000;

/**
 * Which day a timestamp belongs to, honouring a late-night boundary.
 * With boundaryHour = 4, a 1:00am gym log still counts for the night before.
 */
export function dayKey(ts: number, boundaryHour = 0): string {
  return keyOf(new Date(ts - boundaryHour * HOUR_MS));
}

function keyOf(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * A stable integer day number for a timestamp, honouring the same boundary.
 * Rebuilt in UTC from the LOCAL calendar parts, so subtracting two of these
 * gives an exact day count even across a daylight-saving change.
 */
export function dayIndex(ts: number, boundaryHour = 0): number {
  const d = new Date(ts - boundaryHour * HOUR_MS);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

/**
 * Consecutive days ending today (or yesterday) that have at least one log.
 * Never penalises: a day still in progress cannot break the streak, so the
 * count only ever holds or grows until a full day is genuinely missed.
 */
export function computeStreak(
  history: readonly LogEntry[],
  clock: Clock,
  boundaryHour = 0,
): number {
  if (history.length === 0) return 0;

  const days = new Set(history.map((h) => dayKey(h.ts, boundaryHour)));
  const cursor = new Date(clock.now() - boundaryHour * HOUR_MS);
  cursor.setHours(0, 0, 0, 0);

  // Grace: today may simply not be logged yet, so start from yesterday instead.
  if (!days.has(keyOf(cursor))) cursor.setDate(cursor.getDate() - 1);

  let streak = 0;
  while (days.has(keyOf(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Distinct days that carry at least one log. Used by the heatmap and stats. */
export function activeDays(history: readonly LogEntry[], boundaryHour = 0): Set<string> {
  return new Set(history.map((h) => dayKey(h.ts, boundaryHour)));
}

/** Whole days since the last log. Returns null when nothing has been logged. */
export function daysSinceLastLog(
  history: readonly LogEntry[],
  clock: Clock,
  boundaryHour = 0,
): number | null {
  if (history.length === 0) return null;
  let last = -Infinity;
  for (const h of history) if (h.ts > last) last = h.ts;

  const a = new Date(last - boundaryHour * HOUR_MS);
  a.setHours(0, 0, 0, 0);
  const b = new Date(clock.now() - boundaryHour * HOUR_MS);
  b.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / (24 * HOUR_MS)));
}
