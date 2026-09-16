import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import { DEFAULT_CONFIG } from "../engine/config";
import { computePillars, currentRankIndex, overallLevel } from "../engine/ranks";
import { systemClock } from "../engine/clock";
import { levelShade } from "../engine/shade";
import type { EngineConfig, LogEntry, PillarId, PillarProgress } from "../engine/types";
import { uid } from "../lib/format";
import { clearState, loadState, saveState, type PersistedState } from "./db";

export interface Toast {
  id: string;
  /** Rendered bold ahead of the text. Holds user-editable values like a pillar name. */
  subject?: string;
  text: string;
  kind: "ok" | "warn" | "levelup";
  color?: string;
}

export interface Settings {
  sound: boolean;
  motion: boolean;
  accent: string;
}

interface Store {
  ready: boolean;
  config: EngineConfig;
  history: LogEntry[];
  portraits: Record<number, string>;
  settings: Settings;

  /** Derived, recomputed from history on every mutation — never edited directly. */
  pillars: Record<PillarId, PillarProgress>;

  toasts: Toast[];
  rankUpTier: number | null;

  hydrate: () => Promise<void>;
  addLog: (pillar: PillarId, action: string, xp: number, note?: string) => void;
  editLog: (id: string, patch: Partial<Omit<LogEntry, "id">>) => void;
  deleteLog: (id: string) => void;

  setConfig: (fn: (c: EngineConfig) => void) => void;
  setSettings: (patch: Partial<Settings>) => void;
  setPortrait: (tier: number, dataUrl: string) => void;
  removePortrait: (tier: number) => void;

  replaceAll: (s: PersistedState) => void;
  resetAll: () => void;

  pushToast: (text: string, kind?: Toast["kind"], color?: string, subject?: string) => void;
  dismissToast: (id: string) => void;
  clearRankUp: () => void;
}

const DEFAULT_SETTINGS: Settings = { sound: false, motion: true, accent: "#ff2537" };

/**
 * Fill in fields a save predating the current shape will not have, so an older
 * backup still loads instead of rendering a villain called "undefined".
 */
function migrateConfig(c: EngineConfig | undefined): EngineConfig {
  if (!c) return DEFAULT_CONFIG;
  const byId = new Map(DEFAULT_CONFIG.pillars.map((p) => [p.id, p]));
  return {
    ...c,
    dayBoundaryHour: c.dayBoundaryHour ?? DEFAULT_CONFIG.dayBoundaryHour,
    nemesis: c.nemesis ?? DEFAULT_CONFIG.nemesis,
    pillars: (c.pillars ?? DEFAULT_CONFIG.pillars).map((p) => ({
      ...p,
      nemesis: p.nemesis ?? byId.get(p.id)?.nemesis ?? "THE VOID",
    })),
  };
}

function snapshot(pillars: Record<PillarId, PillarProgress>, config: EngineConfig) {
  const levels: Record<string, number> = {};
  for (const p of config.pillars) levels[p.id] = pillars[p.id]?.level ?? 0;
  const overall = overallLevel(pillars, config);
  return { levels, overall, tier: currentRankIndex(overall, config.ranks) };
}

export const useStore = create<Store>()(
  immer((set, get) => ({
    ready: false,
    config: DEFAULT_CONFIG,
    history: [],
    portraits: {},
    settings: DEFAULT_SETTINGS,
    pillars: computePillars([], DEFAULT_CONFIG),
    toasts: [],
    rankUpTier: null,

    hydrate: async () => {
      const saved = await loadState();
      set((s) => {
        if (saved) {
          s.config = migrateConfig(saved.config);
          s.history = Array.isArray(saved.history) ? saved.history : [];
          s.portraits = saved.portraits ?? {};
          s.settings = { ...DEFAULT_SETTINGS, ...(saved.settings ?? {}) };
        }
        s.pillars = computePillars(s.history, s.config);
        s.ready = true;
      });
    },

    addLog: (pillar, action, xp, note = "") => {
      const before = snapshot(get().pillars, get().config);
      set((s) => {
        s.history.push({ id: uid(), ts: systemClock.now(), pillar, action, xp: Number(xp) || 0, note });
        s.pillars = computePillars(s.history, s.config);
      });
      commit(get, set, before);
    },

    editLog: (id, patch) => {
      set((s) => {
        const e = s.history.find((h) => h.id === id);
        if (!e) return;
        Object.assign(e, patch);
        s.pillars = computePillars(s.history, s.config);
      });
      persist(get());
    },

    deleteLog: (id) => {
      set((s) => {
        s.history = s.history.filter((h) => h.id !== id);
        s.pillars = computePillars(s.history, s.config);
      });
      persist(get());
    },

    setConfig: (fn) => {
      set((s) => {
        fn(s.config);
        s.pillars = computePillars(s.history, s.config);
      });
      persist(get());
    },

    setSettings: (patch) => {
      set((s) => {
        s.settings = { ...s.settings, ...patch };
      });
      persist(get());
    },

    setPortrait: (tier, dataUrl) => {
      set((s) => {
        s.portraits[tier] = dataUrl;
      });
      persist(get());
    },

    removePortrait: (tier) => {
      set((s) => {
        delete s.portraits[tier];
      });
      persist(get());
    },

    replaceAll: (incoming) => {
      set((s) => {
        s.config = migrateConfig(incoming.config);
        s.history = Array.isArray(incoming.history) ? incoming.history : [];
        s.portraits = incoming.portraits ?? {};
        s.settings = { ...DEFAULT_SETTINGS, ...(incoming.settings ?? {}) };
        s.pillars = computePillars(s.history, s.config);
      });
      persist(get());
    },

    resetAll: () => {
      set((s) => {
        s.config = DEFAULT_CONFIG;
        s.history = [];
        s.portraits = {};
        s.settings = DEFAULT_SETTINGS;
        s.pillars = computePillars([], DEFAULT_CONFIG);
      });
      void clearState();
    },

    pushToast: (text, kind = "ok", color, subject) => {
      const id = uid();
      set((s) => {
        s.toasts.push({ id, text, kind, color, subject });
      });
      setTimeout(() => get().dismissToast(id), kind === "levelup" ? 3200 : 2400);
    },

    dismissToast: (id) => {
      set((s) => {
        s.toasts = s.toasts.filter((t) => t.id !== id);
      });
    },

    clearRankUp: () => {
      set((s) => {
        s.rankUpTier = null;
      });
    },
  })),
);

type Snap = ReturnType<typeof snapshot>;

/** After a log lands: persist, then fire level-up and rank-up celebrations. */
function commit(
  get: () => Store,
  set: (fn: (s: Store) => void) => void,
  before: Snap,
) {
  const s = get();
  persist(s);
  const after = snapshot(s.pillars, s.config);

  for (const p of s.config.pillars) {
    const now = after.levels[p.id];
    if (now > before.levels[p.id]) {
      s.pushToast(`reached Level ${now}`, "levelup", levelShade(now), p.name);
    }
  }

  if (after.tier > before.tier) {
    set((d) => {
      d.rankUpTier = after.tier;
    });
  }
}

function persist(s: Store) {
  void saveState({
    version: 2,
    config: s.config,
    history: s.history,
    portraits: s.portraits,
    settings: s.settings,
  });
}
