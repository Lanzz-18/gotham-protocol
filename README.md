# Gotham Protocol

A Batman-themed habit tracker. You log habits across five pillars, earn XP, rank up from Drifter to The Legend, and keep five villains from taking over Gotham.

Live on Vercel. Every push to `main` deploys.

## What's in it

- **Five pillars.** THE FORGE (gym), THE CRAFT (work), THE ARCHIVE (reading), THE MIRROR (self-review), DISCIPLINE (keystone habits). Each one has its own log actions and XP values.
- **Levels and ranks.** Each pillar levels up on its own. Your overall level is all five pillar levels added together, and that decides your rank (11 tiers). The profile card looks more legendary as you climb.
- **Rogues gallery.** One villain per pillar. Each villain's power is how much of the last 14 days you skipped that pillar.
- **Today's threat.** A status report at the top of the rogues page. It shows how many pillars are still unlogged today.
- **"I'm tired Alfred".** Take a rest week. Villains freeze and your streak holds. You get at most 2 in any 4 weeks.
- **Weekly debrief.** A Monday-to-Sunday recap with XP, logs, your best day, and one line of advice.
- **3D Batsuit.** The Pillars page shows a 3D Batman. Click a body part and the camera swings to it and opens that pillar's stats.
- **Offline first, optional cloud sync.** Everything is saved in the browser (IndexedDB). If you sign in, it also syncs to Supabase. Changes made offline wait in an outbox and get sent when you're back online.

How every number is worked out is in [docs/how-the-numbers-work.md](docs/how-the-numbers-work.md).

## Stack

React 19, Vite, TypeScript, zustand + immer, idb, Supabase, three.js with @react-three/fiber, Vitest.

## Run it

```powershell
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

### Cloud sync (optional)

Leave this out and the app runs local-only, with no network calls.

1. Copy `.env.example` to `.env.local`.
2. Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from your Supabase project (Settings > API).
3. Run `supabase/schema.sql` in the Supabase SQL editor to create the tables.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Typecheck, then build to `dist/` |
| `npm run preview` | Serve the built `dist/` locally |
| `npm test` | Run the Vitest suite once |
| `npm run lint` | ESLint over the project |

## Where things live

| Folder | What's in it |
|---|---|
| `src/engine/` | The rules: XP, levels, ranks, streaks, villains, rest weeks, weekly stats. Pure functions, no UI. |
| `src/store/` | App state (zustand), local saving (IndexedDB), Supabase sync and the offline outbox |
| `src/ui/` | React screens and components |
| `src/fx/` | Effects: bat-swarm splash, XP flight, rain, and the 3D Batsuit |
| `src/styles/` | CSS |
| `public/` | Rank portraits (`ranks/`) and villain figures (`villains/`) |
| `supabase/schema.sql` | Cloud tables |
| `tests/` | Unit and design tests |
| `legacy/` | The original single-file version the app was ported from |

## Villain and rank images

- Villain figures: drop a transparent PNG at `public/villains/<name>.png` (`bane`, `penguin`, `riddler`, `two-face`, `joker`). Until a file is there, the gallery shows an empty plinth.
- Rank portraits: `public/ranks/tier-0.webp` to `tier-10.webp`. A portrait you upload in the app replaces the default for that tier.
