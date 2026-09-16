import { dayIndex } from "./streak";
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
 * standing in is never counted, because it is not over yet.
 */
export function missedDaysFor(
  history: readonly LogEntry[],
  pillar: PillarId,
  clock: Clock,
  boundaryHour = 0,
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
  const span = Math.max(0, windowEnd - first + 1);
  if (span === 0) return 0;

  let logged = 0;
  for (const idx of active) if (idx >= first && idx <= windowEnd) logged++;

  return Math.max(0, span - logged);
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
    const missedDays = missedDaysFor(history, p.id, clock, config.dayBoundaryHour);
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
  const villainXp = missedDaysFor(history, pillar, clock, config.dayBoundaryHour)
    * (config.nemesis?.xpPerMissedDay ?? 20);
  return tugOfWar(pillarTotalXP(history, pillar), villainXp);
}
