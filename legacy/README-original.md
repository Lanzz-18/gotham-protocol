# GOTHAM PROTOCOL

A personal, single-user, gamified self-improvement tracker. Five life pillars,
each with its own XP and level; the sum drives an overall rank with an evolving
profile portrait. Batman-meets-cyberpunk command-console aesthetic.

Everything lives in one file: `index.html`. No server, no build step, no
internet, no dependencies.

---

## How to run

Double-click `index.html`. It opens in your default browser from `file://`
and works fully offline. Nothing loads over the network.

Recommended browsers: Edge, Chrome, or Firefox (current versions). Your data is
saved automatically to that browser's local storage on that machine.

---

## The five pillars (defaults)

| Pillar     | Theme           | Sample quick-log actions (XP)                 |
|------------|-----------------|-----------------------------------------------|
| THE FORGE  | Gym / Body      | Workout (50), PR (80), Steps/Cardio (30)      |
| THE CRAFT  | Work / Career   | Task done (40), Deep work hr (35), Ship (90)  |
| THE ARCHIVE| Reading / Mind  | Chapter (30), 30 min read (25), Finish book (120) |
| THE MIRROR | Self-Review     | Daily reflection (30), Weekly synthesis (70)  |
| DISCIPLINE | Keystone Habits | Habit kept (25), Streak day (20)              |

Everything above is editable in the Settings tab (rename, recolor, reorder,
change icons, add/remove actions and their XP). DISCIPLINE is the intended
slot to rename to your real fifth focus.

---

## How it works

- Click a quick-log button (or use "+ Custom Log") to add XP to a pillar.
- Everything starts at level 0. Each pillar levels up when its bar fills, and the
  remainder carries into the next level. XP to go from level L to L+1 follows
  `round(80 * 1.18^L)` (levels 0-indexed): 80, 94, 111, 131, ... — a smooth
  escalating curve you can tune in Settings.
- Overall level = the sum of all five pillar levels (so a fresh profile is 0).
- Your rank is the highest tier whose threshold your overall level has reached.
  Ranking up plays a cinematic bat-signal moment and swaps your portrait.
- Streaks count consecutive days with at least one log. They only ever
  encourage — there are no penalties and bars never decay.

### Rank ladder (defaults)

| Tier | Title             | Reaches at overall level |
|------|-------------------|--------------------------|
| 0    | Drifter           | 0                        |
| 1    | Initiate          | 6                        |
| 2    | Vigilante         | 14                       |
| 3    | Knight Errant     | 24                       |
| 4    | The Knight        | 36                       |
| 5    | Dark Knight       | 50                       |
| 6    | Sentinel          | 66                       |
| 7    | Warden of Gotham  | 84                       |
| 8    | Overlord          | 104                      |
| 9    | Supreme Leader    | 128                      |
| 10   | The Legend        | 156                      |

Titles and thresholds are editable in Settings. Each tier has an uploadable
portrait slot; until you upload one it shows a glowing bat-emblem placeholder.

---

## Backing up your data (Export)

Your data auto-saves locally, but local storage is per-browser and per-machine.
To keep a real backup:

1. Click "Export" in the header (or Settings -> Backup & Data).
2. It downloads a single `.json` file containing your entire state: pillars,
   XP, full history, settings, and all uploaded images (as base64).

That JSON file is your portable save. Keep it somewhere safe.

To restore: click "Import" and select a previously exported `.json`. It fully
replaces the current state and recomputes all levels.

---

## Moving between machines

You have two portable options. Pick whichever you prefer.

| Method              | What you send        | On the other machine                          |
|---------------------|----------------------|-----------------------------------------------|
| JSON backup         | The exported `.json` | Open `index.html`, click Import, pick the file |
| Standalone copy     | One `.html` file     | Just open it — your data is already inside     |

"Download standalone copy" (in the header) generates a fresh `index.html` with
your current state baked directly into the file. Email that single HTML to
yourself and it already contains everything when opened elsewhere.

Tip: the standalone copy is a snapshot from the moment you clicked. For ongoing
use, export a JSON backup periodically.

---

## Customizing

All defaults live in the `CONFIG` block near the top of the `<script>` in
`index.html`, and almost everything is also editable from the Settings tab:

- Pillars: name, theme, icon, accent color, order, and quick-log actions/XP.
- Ranks: titles, unlock thresholds, and a portrait image per tier.
- XP curve: base and growth (with a live preview of the effect).
- App name, theme accent, and toggles for motion/effects and sound.

Uploaded images are downscaled to a 512px maximum dimension before storing, to
keep the save file reasonable. If local storage fills up from images, the app
falls back to IndexedDB for image blobs while still including them in Export.

---

## Notes and safeguards

- Destructive actions (Reset, delete a pillar action, delete a log entry) ask
  for confirmation first. Nothing is deleted silently.
- Reduced motion is respected: if your OS requests reduced motion, or you turn
  off effects in Settings, animations are disabled.
- The interface is keyboard-navigable with basic ARIA labels; Escape closes
  dialogs.

---

## Files

| File         | Purpose                                              |
|--------------|------------------------------------------------------|
| `index.html` | The entire application. This is the only file needed.|
| `README.md`  | This document.                                       |
