# How the numbers work

Every number in the app comes from one place: your log history. The app never saves a level, a villain's power, or a streak. It recalculates all of them from your logs each time. If you delete a log, everything adjusts.

All the rules live in `src/engine/`. The default values are in `src/engine/config.ts`.

There are six things to cover:

1. A day
2. XP and pillar levels
3. Overall level and rank
4. Villains (two different numbers)
5. Today's threat
6. "I'm tired Alfred" rest weeks

Plus the weekly debrief and the streak at the end.

---

## 1. A day

A day runs midnight to midnight, in your local time.

- A log at 11:59pm counts for that day.
- A log at 12:01am counts for the next day.

Weeks run Monday to Sunday.

---

## 2. XP and pillar levels

Every log gives XP to one pillar. The amount depends on the button you press.

| Pillar | Villain | Actions (XP) |
|---|---|---|
| THE FORGE (gym) | BANE | Workout 50, PR 80, Steps / Cardio 30 |
| THE CRAFT (work) | THE PENGUIN | Task done 40, Deep work hr 35, Ship 90 |
| THE ARCHIVE (reading) | THE RIDDLER | Chapter 30, 30 min read 25, Finish book 120 |
| THE MIRROR (self-review) | TWO-FACE | Daily reflection 30, Weekly synthesis 70 |
| DISCIPLINE (habits) | THE JOKER | Habit kept 25, Streak day 20 |

Each pillar levels up on its own. Every level costs a bit more XP than the last one:

```
XP to go up one level = 80 x 1.18 ^ (current level)
```

| From level | To level | XP needed | Total XP to get here |
|---|---|---|---|
| 0 | 1 | 80 | 80 |
| 1 | 2 | 94 | 174 |
| 2 | 3 | 111 | 285 |
| 3 | 4 | 131 | 416 |
| 4 | 5 | 155 | 571 |
| 9 | 10 | 355 | 1,881 |

Leftover XP carries over. If you're level 1 with 30 XP and log a Workout (+50), you're at 80 of the 94 you need for level 2.

**Example:** you log 2 Workouts and 1 PR. That's 50 + 50 + 80 = 180 XP in THE FORGE. You spend 80 to reach level 1 and 94 to reach level 2. The last 6 XP carries toward level 3.

Code: `src/engine/xp.ts`.

---

## 3. Overall level and rank

Your overall level is all five pillar levels added together.

FORGE 4 + CRAFT 3 + ARCHIVE 2 + MIRROR 1 + DISCIPLINE 2 = **overall level 12**.

Your rank is the highest one whose threshold you've reached:

| Tier | Rank | Overall level needed |
|---|---|---|
| 0 | Drifter | 0 |
| 1 | Initiate | 6 |
| 2 | Vigilante | 14 |
| 3 | Knight Errant | 24 |
| 4 | The Knight | 36 |
| 5 | Dark Knight | 50 |
| 6 | Sentinel | 66 |
| 7 | Warden of Gotham | 84 |
| 8 | Overlord | 104 |
| 9 | Supreme Leader | 128 |
| 10 | The Legend | 156 |

So overall level 12 makes you an **Initiate**. Two more pillar levels and you're a Vigilante.

The profile card gets one step more legendary every two tiers. Only The Legend reaches the final look.

The progress bar toward your next overall level follows whichever pillar is closest to levelling up. Any one pillar levelling up adds 1 to your overall level.

Code: `src/engine/ranks.ts`.

---

## 4. Villains

Each pillar has one villain, and a villain has **two separate numbers**. They answer different questions.

| Number | Where you see it | What it looks at |
|---|---|---|
| **Power** (0 to 100%) | Rogues gallery, the meter under each villain | Only the **last 14 days** |
| **Villain XP** | The bar on each pillar card (you vs the villain) | **Every day since you started** that pillar |

### 4a. Power (rogues gallery)

```
power = days you skipped that pillar / days that counted
```

It looks at the last 14 days, today included. A day **counts** unless one of these applies:

- It came **before your first-ever log** for that pillar. You can't skip a habit you hadn't started.
- It's in a **rest week**.
- It's **today and you haven't logged yet**. Today isn't a skip until it's over, so the villain doesn't jump every morning. The moment you log today, today counts as a win.

A counted day with no log for that pillar is a **skip**.

**Example: BANE (THE FORGE), going from 0 to 100%.** Say you've used the app for weeks and gym every day. Over the last 14 days you have 14 logged days and 0 skips, so BANE is at **0%**.

Now you stop going to the gym:

| Days since you stopped | Skips in the window | BANE's power |
|---|---|---|
| 0 | 0 of 14 | 0% |
| 1 | 1 of 14 | 7% |
| 3 | 3 of 14 | 21% |
| 7 | 7 of 14 | 50% |
| 14 | 14 of 14 | 100% |

Coming back works the same way. Every day you gym, one old skip slides out of the window and a logged day takes its place. That's about 7% back per day.

**The window slides. It doesn't reset.** It's always "the 14 days ending today". Nothing restarts every two weeks. A skip from 15 days ago has dropped out and stops counting.

**It counts days, not logs.** Three workouts in one day still count as one logged day. More logs get you more XP, but not less villain power.

**New pillar example:** you started DISCIPLINE 4 days ago and logged 3 of those days. Only 4 days count, so THE JOKER sits at 1 / 4 = **25%**.

**The trend arrow** compares this 14-day window with the 14 days before it. Up means the villain is gaining on you.

The case file under each villain shows the 14 days as marks: logged, missed, rest, before (you hadn't started yet), and today (not logged yet).

Code: `villainPowers` and `villainDays` in `src/engine/nemesis.ts`.

### 4b. Villain XP (pillar cards)

```
villain XP = days you skipped that pillar x 20
```

This counts every skipped day from your first log for that pillar up to **yesterday**. Today is never counted. Rest-week days are never counted.

The bar on the pillar card splits between your XP and the villain's:

```
your share = your XP / (your XP + villain XP)
```

If the villain's XP is bigger than yours, you're "losing" that pillar.

**Example:** you've earned 600 XP in THE CRAFT and skipped 10 days since you started. THE PENGUIN has 10 x 20 = 200 XP. You hold 600 / 800 = **75%** of the bar.

Villain XP never goes down, because old skips stay skips. You win the bar back by earning XP faster than the villain gains it.

Code: `computeNemesis` and `tugOfWar` in `src/engine/nemesis.ts`.

---

## 5. Today's threat

This is the status report at the top of the rogues page. It only looks at today.

```
threat = pillars not logged yet today / 5
```

| Pillars logged today | Still loose | Threat |
|---|---|---|
| 0 | 5 | 100% |
| 2 | 3 | 60% |
| 5 | 0 | 0% |

It counts all five pillars, even ones you've never started, because today's checklist is the whole protocol. In a rest week the report shows as on hold.

It resets at midnight.

Code: `todayThreat` in `src/engine/nemesis.ts`.

---

## 6. "I'm tired Alfred" (rest weeks)

The button is at the very bottom of the dashboard. It marks the **whole current week, Monday to Sunday**, as a rest week. The app saves that week's Monday.

**The limit: at most 2 rest weeks in any 4 weeks in a row.** The app checks the 3 weeks before the one you're asking for. If 2 of them are already rest weeks, the button says when you can rest next.

What a rest week does:

| Thing | Effect |
|---|---|
| Villain power | Rest days don't count, so the villains freeze where they were |
| Villain XP | Rest days are never skips, so it doesn't grow |
| Streak | Unlogged rest days don't break it and don't add to it |
| Today's threat | Shown as on hold |
| Weekly debrief | "Rest week. The villains held position." |
| Your XP | Still counts. If you log during a rest week, you still get the XP |

Code: `src/engine/week.ts` (the limit) and `isRestDay` in `src/engine/streak.ts`.

---

## Weekly debrief

A Monday-to-Sunday recap. It shows:

- the week's XP and number of logs
- active days (days with at least one log)
- your best day (the one with the most XP)
- XP per pillar, plus the days you skipped each one

The up/down comparison uses the week before. If that week was a rest week, it skips back to the last normal week, so coming back from a rest week doesn't look like a huge jump.

The advice line picks the first rule that fits:

1. Rest week: "The villains held position."
2. No logs: "One log tomorrow and the fight is back on."
3. A pillar skipped 3+ days: names the villain and that pillar.
4. XP up 10% or more on the week before: says by how much.
5. XP down 10% or more: "Pick one pillar and win it tomorrow."
6. Anything else: "Steady week. Same again."

Code: `weekSummary` and `debriefLine` in `src/engine/week.ts`.

## Streak

The streak is how many days in a row have at least one log, in any pillar.

- If you haven't logged today yet, it counts back from yesterday, so the morning never breaks your streak.
- Unlogged rest-week days are skipped over.
- The first fully skipped normal day ends the streak.

Code: `computeStreak` in `src/engine/streak.ts`.
