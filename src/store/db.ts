import { openDB, type IDBPDatabase } from "idb";

import type { EngineConfig, LogEntry } from "../engine/types";

const DB_NAME = "gotham-protocol";
const STORE = "kv";
const STATE_KEY = "state";

export interface PersistedState {
  version: number;
  config: EngineConfig;
  history: LogEntry[];
  portraits: Record<number, string>;
  settings: { sound: boolean; motion: boolean; accent: string };
}

let dbp: Promise<IDBPDatabase> | null = null;

function db() {
  if (!dbp) {
    dbp = openDB(DB_NAME, 1, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      },
    });
  }
  return dbp;
}

export async function loadState(): Promise<PersistedState | null> {
  try {
    const d = await db();
    return ((await d.get(STORE, STATE_KEY)) as PersistedState | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function saveState(state: PersistedState): Promise<void> {
  try {
    const d = await db();
    await d.put(STORE, state, STATE_KEY);
  } catch {
    // Storage unavailable (private window, quota). The app stays usable in memory;
    // Export remains the reliable backup path.
  }
}

export async function clearState(): Promise<void> {
  try {
    const d = await db();
    await d.delete(STORE, STATE_KEY);
  } catch {
    // nothing to do
  }
}
