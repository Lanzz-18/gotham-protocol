import { levelFromTotal, pillarTotalXP, xpToNext } from "./xp";
import type { EngineConfig, LogEntry, PillarId, PillarProgress, RankConfig } from "./types";

/** Recompute every pillar's level, carried XP and last activity straight from history. */
export function computePillars(
  history: readonly LogEntry[],
  config: EngineConfig,
): Record<PillarId, PillarProgress> {
  const out: Record<PillarId, PillarProgress> = {};
  for (const p of config.pillars) {
    const r = levelFromTotal(pillarTotalXP(history, p.id), config.xpCurve);
    let last: number | null = null;
    for (const h of history) {
      if (h.pillar === p.id && (last === null || h.ts > last)) last = h.ts;
    }
    out[p.id] = { xp: r.xp, level: r.level, lastActivity: last };
  }
  return out;
}

/** Overall level is the sum of every pillar level, so a fresh profile is 0. */
export function overallLevel(pillars: Record<PillarId, PillarProgress>, config: EngineConfig): number {
  return config.pillars.reduce((s, p) => s + (pillars[p.id]?.level ?? 0), 0);
}

/** Index of the highest rank whose threshold the overall level has reached. */
export function currentRankIndex(overall: number, ranks: readonly RankConfig[]): number {
  let idx = 0;
  for (let i = 0; i < ranks.length; i++) if (overall >= ranks[i].threshold) idx = i;
  return idx;
}

export function currentRank(overall: number, ranks: readonly RankConfig[]): RankConfig {
  return ranks[currentRankIndex(overall, ranks)];
}

export function nextRank(overall: number, ranks: readonly RankConfig[]): RankConfig | null {
  const idx = currentRankIndex(overall, ranks);
  return idx + 1 < ranks.length ? ranks[idx + 1] : null;
}

/**
 * Progress toward the next overall level. Overall level ticks the moment ANY
 * pillar levels, so the leading pillar is the one closest to filling.
 */
export function progressToNextOverall(
  pillars: Record<PillarId, PillarProgress>,
  config: EngineConfig,
): { frac: number; lead: PillarId | null } {
  let best = 0;
  let lead: PillarId | null = null;
  for (const p of config.pillars) {
    const st = pillars[p.id];
    if (!st) continue;
    const frac = st.xp / xpToNext(st.level, config.xpCurve);
    if (frac >= best) {
      best = frac;
      lead = p.id;
    }
  }
  return { frac: Math.min(0.999, Math.max(0, best)), lead };
}
