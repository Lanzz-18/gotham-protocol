import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import { DEFAULT_CONFIG, DEFAULT_PORTRAITS } from "../engine/config";
import { computePillars, currentRankIndex, overallLevel } from "../engine/ranks";
import { systemClock } from "../engine/clock";
import { levelShade } from "../engine/shade";
import { canRest, currentWeekStart } from "../engine/week";
import type { EngineConfig, LogEntry, PillarId, PillarProgress } from "../engine/types";
import { uid } from "../lib/format";
import { clearState, loadState, saveState, type PersistedState } from "./db";
import {
  type CloudUser,
  getCloudUser,
  onAuthChange,
  pullAndMergeHistory,
  pullProfileIfNewer,
  pushProfile,
  signInWithPassword,
  signOutCloud,
  signUpWithPassword,
} from "./cloudSync";
import { outbox } from "./outbox";
import type { PendingOp } from "../engine/sync";

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

  /** null = signed out (or cloud sync isn't configured on this build). */
  user: CloudUser | null;
  authBusy: boolean;
  authMessage: string | null;
  /** When the local profile (config/settings/portraits) was last synced, so a
   *  pull knows whether the cloud's copy is actually newer. */
  profileSyncedAt: number;

  hydrate: () => Promise<void>;
  /** Returns true on success, so the caller (the auth modal) knows to close. */
  signUp: (name: string, email: string, password: string) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOutUser: () => Promise<void>;
  addLog: (pillar: PillarId, action: string, xp: number, note?: string) => void;
  editLog: (id: string, patch: Partial<Omit<LogEntry, "id">>) => void;
  deleteLog: (id: string) => void;

  setConfig: (fn: (c: EngineConfig) => void) => void;
  /** Mark or unmark the current week as a rest week. "blocked" = already 2 in the last 4 weeks. */
  toggleRestWeek: () => "on" | "off" | "blocked";
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
    portraits: DEFAULT_PORTRAITS,
    settings: DEFAULT_SETTINGS,
    pillars: computePillars([], DEFAULT_CONFIG),
    toasts: [],
    rankUpTier: null,

    user: null,
    authBusy: false,
    authMessage: null,
    profileSyncedAt: 0,

    hydrate: async () => {
      // 1. Local first — the app is fully usable the instant this resolves,
      //    online or not. Cloud sync layers on top, never gates this.
      const saved = await loadState();
      await outbox.restore();
      set((s) => {
        if (saved) {
          s.config = migrateConfig(saved.config);
          s.history = Array.isArray(saved.history) ? saved.history : [];
          s.portraits = { ...DEFAULT_PORTRAITS, ...(saved.portraits ?? {}) };
          s.settings = { ...DEFAULT_SETTINGS, ...(saved.settings ?? {}) };
        }
        s.pillars = computePillars(s.history, s.config);
        s.ready = true;
      });

      // 2. If already signed in (a returning session), reconcile with the
      //    cloud right away. If not, wait for onAuthChange to fire — that
      //    covers both a magic-link completing and a fresh sign-in.
      const user = await getCloudUser();
      if (user) {
        set((s) => { s.user = user; });
        await syncFromCloud(get, set);
      }
      onAuthChange((u) => {
        const was = get().user;
        set((s) => { s.user = u; });
        if (u && !was) void syncFromCloud(get, set);
      });
      // Changes queued while offline go up the moment the connection is back.
      window.addEventListener("online", () => {
        const u = get().user;
        if (u) void outbox.flush(u.id);
      });
    },

    // Neither of these sets `user` directly — the onAuthChange listener
    // registered in hydrate() is the single place that happens, so a
    // password sign-in and a session restored on page load both flow
    // through exactly one path into syncFromCloud, never two.
    signUp: async (name, email, password) => {
      set((s) => { s.authBusy = true; s.authMessage = null; });
      const result = await signUpWithPassword(name, email, password);
      set((s) => {
        s.authBusy = false;
        if (result.error) s.authMessage = result.error;
        else if (result.needsConfirmation) s.authMessage = "Account created — check your email to confirm it, then sign in.";
      });
      return !result.error && !result.needsConfirmation && !!result.user;
    },

    signIn: async (email, password) => {
      set((s) => { s.authBusy = true; s.authMessage = null; });
      const result = await signInWithPassword(email, password);
      set((s) => {
        s.authBusy = false;
        if (result.error) s.authMessage = result.error;
      });
      return !result.error && !!result.user;
    },

    signOutUser: async () => {
      await signOutCloud();
      set((s) => { s.user = null; s.authMessage = null; });
    },

    addLog: (pillar, action, xp, note = "") => {
      const before = snapshot(get().pillars, get().config);
      const entry = { id: uid(), ts: systemClock.now(), pillar, action, xp: Number(xp) || 0, note };
      set((s) => {
        s.history.push(entry);
        s.pillars = computePillars(s.history, s.config);
      });
      commit(get, set, before);
      sendToCloud(get, [{ kind: "upsert", entry }]);
    },

    editLog: (id, patch) => {
      set((s) => {
        const e = s.history.find((h) => h.id === id);
        if (!e) return;
        Object.assign(e, patch);
        s.pillars = computePillars(s.history, s.config);
      });
      persist(get());
      const edited = get().history.find((h) => h.id === id);
      if (edited) sendToCloud(get, [{ kind: "upsert", entry: edited }]);
    },

    deleteLog: (id) => {
      set((s) => {
        s.history = s.history.filter((h) => h.id !== id);
        s.pillars = computePillars(s.history, s.config);
      });
      persist(get());
      sendToCloud(get, [{ kind: "delete", id }]);
    },

    setConfig: (fn) => {
      set((s) => {
        fn(s.config);
        s.pillars = computePillars(s.history, s.config);
      });
      persist(get());
      schedulePushProfile(get, set);
    },

    toggleRestWeek: () => {
      const { config } = get();
      const week = currentWeekStart(systemClock, config.dayBoundaryHour);
      const list = config.restWeeks ?? [];
      if (list.includes(week)) {
        get().setConfig((c) => { c.restWeeks = list.filter((w) => w !== week); });
        return "off";
      }
      if (!canRest(list, week)) return "blocked";
      get().setConfig((c) => { c.restWeeks = [...list, week]; });
      return "on";
    },

    setSettings: (patch) => {
      set((s) => {
        s.settings = { ...s.settings, ...patch };
      });
      persist(get());
      schedulePushProfile(get, set);
    },

    setPortrait: (tier, dataUrl) => {
      set((s) => {
        s.portraits[tier] = dataUrl;
      });
      persist(get());
      schedulePushProfile(get, set);
    },

    removePortrait: (tier) => {
      set((s) => {
        delete s.portraits[tier];
      });
      persist(get());
      schedulePushProfile(get, set);
    },

    replaceAll: (incoming) => {
      set((s) => {
        s.config = migrateConfig(incoming.config);
        s.history = Array.isArray(incoming.history) ? incoming.history : [];
        s.portraits = { ...DEFAULT_PORTRAITS, ...(incoming.portraits ?? {}) };
        s.settings = { ...DEFAULT_SETTINGS, ...(incoming.settings ?? {}) };
        s.pillars = computePillars(s.history, s.config);
      });
      persist(get());
      // An imported backup is signed in for a reason — push it up too, so
      // the other devices on this account see it on their next sync.
      if (get().user) {
        sendToCloud(get, get().history.map((entry) => ({ kind: "upsert", entry })));
        schedulePushProfile(get, set);
      }
    },

    resetAll: () => {
      set((s) => {
        s.config = DEFAULT_CONFIG;
        s.history = [];
        s.portraits = DEFAULT_PORTRAITS;
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

type Get = () => Store;
type Set = (fn: (s: Store) => void) => void;

/**
 * Runs right after sign-in (and once on app load if already signed in):
 * pull the cloud's history and profile, merge, then push back whatever the
 * cloud had never seen — the two-way handshake that makes a brand-new device
 * end up with everything and a device with pre-existing local data doesn't
 * lose it.
 */
async function syncFromCloud(get: Get, set: Set) {
  const user = get().user;
  if (!user) return;
  // Send unsent changes first, and let whatever still couldn't go win the
  // merge — otherwise the cloud's older copy would overwrite them.
  await outbox.flush(user.id);
  const { merged, toPush } = await pullAndMergeHistory(get().history, outbox.pending(user.id));
  set((s) => {
    s.history = merged;
    s.pillars = computePillars(s.history, s.config);
  });
  persist(get());
  sendToCloud(get, toPush.map((entry) => ({ kind: "upsert", entry })));

  const newer = await pullProfileIfNewer(get().profileSyncedAt);
  if (newer) {
    set((s) => {
      s.config = migrateConfig(newer.blob.config);
      s.settings = { ...DEFAULT_SETTINGS, ...newer.blob.settings };
      s.portraits = newer.blob.portraits;
      s.pillars = computePillars(s.history, s.config);
      s.profileSyncedAt = newer.updatedAt;
    });
    persist(get());
  }
}

/** Queue history changes for the signed-in account and try to send them now. */
function sendToCloud(get: Get, ops: PendingOp[]) {
  const user = get().user;
  if (!user || ops.length === 0) return;
  for (const op of ops) outbox.enqueue(user.id, op);
  void outbox.flush(user.id);
}

let profilePushTimer: number | null = null;

/** Debounced: a dragged slider fires setConfig on every `input` event, and
 *  pushing a network request per pixel would be wasteful and noisy. */
function schedulePushProfile(get: Get, set: Set) {
  if (!get().user) return;
  if (profilePushTimer) clearTimeout(profilePushTimer);
  profilePushTimer = window.setTimeout(() => {
    const s = get();
    void pushProfile({ config: s.config, settings: s.settings, portraits: s.portraits }).then(() => {
      set((d) => { d.profileSyncedAt = Date.now(); });
    });
  }, 900);
}
