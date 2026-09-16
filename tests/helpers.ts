import type { EngineConfig, LogEntry } from "../src/engine/types";
import { DEFAULT_CONFIG } from "../src/engine/config";

let seq = 0;

export function log(pillar: string, xp: number, ts: number, action = "test"): LogEntry {
  return { id: `t${seq++}`, ts, pillar, action, xp, note: "" };
}

/** A local-time timestamp. Month is 1-indexed here, unlike the Date constructor. */
export function at(y: number, m: number, d: number, h = 12, min = 0): number {
  return new Date(y, m - 1, d, h, min, 0, 0).getTime();
}

export const CONFIG: EngineConfig = DEFAULT_CONFIG;

export const PILLAR_IDS = DEFAULT_CONFIG.pillars.map((p) => p.id);

export function shuffle<T>(arr: readonly T[], seed: number): T[] {
  const out = arr.slice();
  let s = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) % 4294967296;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
