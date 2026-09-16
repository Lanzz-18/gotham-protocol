import type { EngineConfig } from "./types";

/**
 * Ported from legacy/index.html DEFAULT_CONFIG.
 *
 * Rank auras for tiers 0-3 were lifted in lightness (hue and saturation kept)
 * so every tier clears 3:1 against the panel and the ramp stays monotonic.
 * See tests/design/palette.test.ts — the original values failed those checks.
 */
export const DEFAULT_CONFIG: EngineConfig = {
  appName: "GOTHAM PROTOCOL",
  xpCurve: { base: 80, growth: 1.18 },
  dayBoundaryHour: 4,
  nemesis: { xpPerMissedDay: 20 },
  pillars: [
    {
      id: "forge", name: "THE FORGE", theme: "Gym / Body", icon: "dumbbell", accent: "#ff2537",
      nemesis: "BANE",
      actions: [{ label: "Workout", xp: 50 }, { label: "PR", xp: 80 }, { label: "Steps / Cardio", xp: 30 }],
    },
    {
      id: "craft", name: "THE CRAFT", theme: "Work / Career", icon: "gear", accent: "#ff5563",
      nemesis: "THE PENGUIN",
      actions: [{ label: "Task done", xp: 40 }, { label: "Deep work hr", xp: 35 }, { label: "Ship", xp: 90 }],
    },
    {
      id: "archive", name: "THE ARCHIVE", theme: "Reading / Mind", icon: "book", accent: "#c7ccd6",
      nemesis: "THE RIDDLER",
      actions: [{ label: "Chapter", xp: 30 }, { label: "30 min read", xp: 25 }, { label: "Finish book", xp: 120 }],
    },
    {
      id: "mirror", name: "THE MIRROR", theme: "Self-Review", icon: "eye", accent: "#8a8e99",
      nemesis: "TWO-FACE",
      actions: [{ label: "Daily reflection", xp: 30 }, { label: "Weekly synthesis", xp: 70 }],
    },
    {
      id: "discipline", name: "DISCIPLINE", theme: "Keystone Habits", icon: "shield", accent: "#b3141f",
      nemesis: "THE JOKER",
      actions: [{ label: "Habit kept", xp: 25 }, { label: "Streak day", xp: 20 }],
    },
  ],
  ranks: [
    { tier: 0, title: "Drifter", threshold: 0, aura: "#5e6169" },
    { tier: 1, title: "Initiate", threshold: 6, aura: "#bd383f" },
    { tier: 2, title: "Vigilante", threshold: 14, aura: "#df1e2b" },
    { tier: 3, title: "Knight Errant", threshold: 24, aura: "#e53742" },
    { tier: 4, title: "The Knight", threshold: 36, aura: "#ff2537" },
    { tier: 5, title: "Dark Knight", threshold: 50, aura: "#ff4350" },
    { tier: 6, title: "Sentinel", threshold: 66, aura: "#ff5f6b" },
    { tier: 7, title: "Warden of Gotham", threshold: 84, aura: "#ff7d87" },
    { tier: 8, title: "Overlord", threshold: 104, aura: "#ff9aa2" },
    { tier: 9, title: "Supreme Leader", threshold: 128, aura: "#ffc2c7" },
    { tier: 10, title: "The Legend", threshold: 156, aura: "#ffffff" },
  ],
};

/** The only colors allowed anywhere in the UI: neon red, crimson, greys, white. */
export const APPROVED_PALETTE = [
  "#050506", "#08080a", "#0d0d10", "#0f0f12",
  "#ff2537", "#ff5563", "#b3141f", "#6e0d15", "#7a0d14", "#ff8a94",
  "#5e6169", "#bd383f", "#df1e2b", "#e53742",
  "#ff4350", "#ff5f6b", "#ff7d87", "#ff9aa2", "#ffc2c7",
  "#edeef2", "#c7ccd6", "#8a8e99", "#787c8a", "#ffffff", "#ffb9c4",
] as const;

export const SURFACES = {
  bg: "#050506",
  panel: "#0f0f12",
} as const;
