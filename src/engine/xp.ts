import type { LevelResult, LogEntry, PillarId, XpCurve } from "./types";

const MAX_LEVEL = 9999;

/** XP needed to go from `level` to `level + 1`. Levels are 0-indexed. */
export function xpToNext(level: number, curve: XpCurve): number {
  if (!Number.isFinite(level) || level < 0) return Math.max(1, Math.round(curve.base));
  return Math.max(1, Math.round(curve.base * Math.pow(curve.growth, level)));
}

/** Total XP that must be spent to reach `level` from zero. */
export function xpConsumedTo(level: number, curve: XpCurve): number {
  let sum = 0;
  for (let l = 0; l < level; l++) sum += xpToNext(l, curve);
  return sum;
}

/** Resolve a level plus the carried remainder from a lifetime XP total. */
export function levelFromTotal(total: number, curve: XpCurve): LevelResult {
  let level = 0;
  let xp = Number.isFinite(total) ? Math.max(0, total) : 0;
  while (xp >= xpToNext(level, curve)) {
    xp -= xpToNext(level, curve);
    level++;
    if (level >= MAX_LEVEL) break;
  }
  return { level, xp, need: xpToNext(level, curve) };
}

export function pillarTotalXP(history: readonly LogEntry[], pillar: PillarId): number {
  let t = 0;
  for (const h of history) if (h.pillar === pillar) t += toXp(h.xp);
  return t;
}

export function lifetimeXP(history: readonly LogEntry[]): number {
  let t = 0;
  for (const h of history) t += toXp(h.xp);
  return t;
}

function toXp(v: number): number {
  return Number.isFinite(v) ? v : 0;
}
