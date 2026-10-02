import { useState } from "react";

import { useStore } from "../store/useStore";
import { pillarTotalXP, lifetimeXP } from "../engine/xp";
import { computeStreak } from "../engine/streak";
import { currentRank, currentRankIndex, nextRank, overallLevel } from "../engine/ranks";
import { averagePerDay, bestDay, dailySeries, rankProgress, type DayPoint } from "../engine/series";
import { debriefLine, lastFullWeekStart, weekSummary } from "../engine/week";
import { systemClock } from "../engine/clock";
import { fmt } from "../lib/format";

const RANGES = [
  [30, "30 days"],
  [90, "90 days"],
  [365, "1 year"],
] as const;

export function StatsView() {
  const [days, setDays] = useState<number>(30);

  return (
    <div className="view">
      <div className="toolbar-row">
        <h2 className="section-title" style={{ flex: 1 }}>Analytics</h2>
        <div className="range-pills">
          {RANGES.map(([n, label]) => (
            <button
              key={n}
              className={"range-pill" + (days === n ? " on" : "")}
              onClick={() => setDays(n)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <RankRoad />
      <WeeklyDebrief />
      <Summary days={days} />

      <div className="stats-grid">
        <div className="chart-card wide">
          <h3>Lifetime XP</h3>
          <TotalLine days={days} />
        </div>
        <div className="chart-card wide">
          <h3>XP per day</h3>
          <DailyBars days={days} />
        </div>
        <div className="chart-card">
          <h3>Pillar share</h3>
          <PillarShare />
        </div>
        <div className="chart-card">
          <h3>Levels</h3>
          <LevelsChart />
        </div>
        <div className="chart-card wide">
          <h3>Activity</h3>
          <Heatmap days={days} />
        </div>
      </div>
    </div>
  );
}

/* ================= batmobile rank track ================= */

function RankRoad() {
  const config = useStore((s) => s.config);
  const pillars = useStore((s) => s.pillars);

  const overall = overallLevel(pillars, config);
  const idx = currentRankIndex(overall, config.ranks);
  const rank = currentRank(overall, config.ranks);
  const next = nextRank(overall, config.ranks);
  const frac = rankProgress(overall, rank.threshold, next ? next.threshold : null);

  const x = 6 + frac * 88; // percent along the road

  return (
    <div className="road-card">
      <div className="road-head">
        <div>
          <div className="road-k">Current rank</div>
          <div className="road-rank">{rank.title}</div>
        </div>
        <div className="road-right">
          <div className="road-k">{next ? "Next" : "Status"}</div>
          <div className="road-next">
            {next ? <>{next.title} <span>@ Lv {next.threshold}</span></> : "Max rank"}
          </div>
        </div>
      </div>

      <div className="road">
        <div className="road-line" />
        <div className="road-fill" style={{ width: `${x}%` }} />
        <div className="road-glow" style={{ left: `${x}%` }} />
        <div className="road-car" style={{ left: `${x}%` }}>
          <Batmobile />
        </div>
      </div>

      <div className="road-foot">
        <span>Lv {rank.threshold}</span>
        <span className="road-pct">{Math.round(frac * 100)}% to tier {idx + (next ? 1 : 0)}</span>
        <span>{next ? `Lv ${next.threshold}` : `Lv ${overall}`}</span>
      </div>
    </div>
  );
}

/**
 * Batmobile in profile, nose to the right, so it reads as driving forward
 * along the road. Black body with a rim light, red tail lamps at the back
 * throwing the glow that runs down the road behind it.
 */
function Batmobile() {
  return (
    <svg viewBox="0 0 124 44" className="car" role="img" aria-label="Progress marker">
      {/* exhaust wash, trailing behind */}
      <g className="car-flare">
        <path d="M6 27 L-20 25 L-20 29 Z" fill="var(--accent)" opacity="0.7" />
        <path d="M6 27 L-40 26.2 L-40 27.8 Z" fill="var(--accent)" opacity="0.35" />
      </g>

      {/* rear fin */}
      <path d="M5 23 L2 8 L19 24 Z" fill="#050506" stroke="rgba(255,255,255,0.22)" strokeWidth="1" strokeLinejoin="round" />

      {/* body — long wedge, cockpit set back, nose low and far right */}
      <path
        d="M5 33 L4 22 L20 26 L31 16 C41 10 53 8 65 9 C75 10 84 13 92 18 C102 23 113 27 121 31 L121 33 Z"
        fill="#050506" stroke="rgba(255,255,255,0.3)" strokeWidth="1.1" strokeLinejoin="round"
      />

      {/* canopy glass */}
      <path d="M40 19 C47 12 56 10 65 11 C71 12 76 14 80 17 Z" fill="rgba(255,255,255,0.13)" />

      {/* tail lamps */}
      <g className="car-lamps">
        <circle cx="8" cy="26" r="2.1" fill="var(--accent)" />
        <circle cx="14" cy="27.5" r="1.5" fill="var(--accent)" opacity="0.8" />
      </g>

      {/* wheels */}
      <circle className="wheel" cx="31" cy="32" r="8.5" fill="#050506" stroke="rgba(255,255,255,0.4)" strokeWidth="2.2" />
      <circle className="wheel" cx="95" cy="32" r="8.5" fill="#050506" stroke="rgba(255,255,255,0.4)" strokeWidth="2.2" />
    </svg>
  );
}

/* ================= weekly debrief ================= */

const shortDate = (ts: number) => new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/** Last full Monday-to-Sunday week: the numbers, each pillar, and one line on what to do next. */
function WeeklyDebrief() {
  const config = useStore((s) => s.config);
  const history = useStore((s) => s.history);

  const w = weekSummary(history, config, lastFullWeekStart(systemClock, config.dayBoundaryHour), systemClock);
  const range = `${shortDate(w.startTs)} – ${shortDate(w.endTs)}`;

  if (!w.started) {
    return (
      <div className="debrief-card">
        <div className="debrief-head">
          <h3>Weekly debrief</h3>
          <span className="debrief-range">{range}</span>
        </div>
        <p className="debrief-line">Your first debrief lands after your first full week.</p>
      </div>
    );
  }

  const change = w.prevXp > 0 ? Math.round(((w.xp - w.prevXp) / w.prevXp) * 100) : null;
  const max = Math.max(1, ...w.pillars.map((p) => p.xp));

  return (
    <div className="debrief-card">
      <div className="debrief-head">
        <h3>Weekly debrief</h3>
        <span className="debrief-range">{range}</span>
      </div>

      <div className="debrief-nums">
        <div>
          <b>{fmt(w.xp)}</b>
          <span>XP{change !== null && <em className={change < 0 ? "down" : ""}> {change >= 0 ? "+" : ""}{change}%</em>}</span>
        </div>
        <div><b>{w.activeDays}/7</b><span>active days</span></div>
        <div><b>{w.logs}</b><span>logs</span></div>
        <div>
          <b>{w.best ? fmt(w.best.xp) : "0"}</b>
          <span>{w.best ? `best · ${new Date(w.best.ts).toLocaleDateString(undefined, { weekday: "short" })}` : "best day"}</span>
        </div>
      </div>

      <ul className="debrief-pillars">
        {w.pillars.map((p) => (
          <li key={p.id}>
            <span className="nm">{p.name}</span>
            <span className="track"><i style={{ width: `${(p.xp / max) * 100}%` }} /></span>
            <span className="vl">{fmt(p.xp)}</span>
            <span className={"foe" + (p.missedDays > 0 ? " on" : "")}>
              {p.missedDays > 0 ? `${p.nemesis} +${p.missedDays}d` : p.logs > 0 ? "held" : "—"}
            </span>
          </li>
        ))}
      </ul>

      <p className="debrief-line">{debriefLine(w)}</p>
    </div>
  );
}

/* ================= summary tiles ================= */

function Summary({ days }: { days: number }) {
  const config = useStore((s) => s.config);
  const history = useStore((s) => s.history);

  const series = dailySeries(history, systemClock, days, config.dayBoundaryHour);
  const best = bestDay(series);
  const avg = averagePerDay(series);
  const windowXp = series.reduce((s, p) => s + p.xp, 0);
  const active = series.filter((p) => p.logs > 0).length;
  const streak = computeStreak(history, systemClock, config.dayBoundaryHour);

  const tiles: Array<[string, string, string]> = [
    ["Lifetime XP", fmt(lifetimeXP(history)), `${fmt(windowXp)} in range`],
    ["Per day", fmt(avg), "average, gaps counted"],
    ["Best day", best ? fmt(best.xp) : "0", best ? new Date(best.ts).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "nothing yet"],
    ["Active days", `${active}/${days}`, `${Math.round((active / days) * 100)}% turnout`],
    ["Streak", String(streak), streak === 1 ? "day" : "days"],
  ];

  return (
    <div className="tiles">
      {tiles.map(([k, v, sub]) => (
        <div className="tile" key={k}>
          <div className="tile-k">{k}</div>
          <div className="tile-v">{v}</div>
          <div className="tile-sub">{sub}</div>
        </div>
      ))}
    </div>
  );
}

/* ================= charts ================= */

const W = 560;
const H = 150;
const PAD_L = 4;
const PAD_R = 4;
const PAD_T = 10;
const PAD_B = 18;

function xAt(i: number, n: number) {
  if (n <= 1) return PAD_L;
  return PAD_L + (i / (n - 1)) * (W - PAD_L - PAD_R);
}
function yAt(v: number, max: number) {
  if (max <= 0) return H - PAD_B;
  return PAD_T + (1 - v / max) * (H - PAD_T - PAD_B);
}

type Anchor = "start" | "middle" | "end";

function axisLabels(series: readonly DayPoint[]) {
  const n = series.length;
  const picks = [0, Math.floor((n - 1) / 2), n - 1];
  return picks.map((i) => ({
    x: xAt(i, n),
    label: new Date(series[i].ts).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
    anchor: (i === 0 ? "start" : i === n - 1 ? "end" : "middle") as Anchor,
  }));
}

function TotalLine({ days }: { days: number }) {
  const config = useStore((s) => s.config);
  const history = useStore((s) => s.history);
  const series = dailySeries(history, systemClock, days, config.dayBoundaryHour);

  const max = Math.max(1, ...series.map((p) => p.total));
  const min = Math.min(...series.map((p) => p.total));
  const n = series.length;

  const pts = series.map((p, i) => `${xAt(i, n).toFixed(1)},${yAt(p.total - min, max - min || 1).toFixed(1)}`);
  const line = "M" + pts.join("L");
  const area = `${line}L${xAt(n - 1, n).toFixed(1)},${H - PAD_B}L${xAt(0, n).toFixed(1)},${H - PAD_B}Z`;
  const last = series[n - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Lifetime XP over time">
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={PAD_L} x2={W - PAD_R} y1={PAD_T + g * (H - PAD_T - PAD_B)} y2={PAD_T + g * (H - PAD_T - PAD_B)}
          stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
      ))}
      <path d={area} fill="url(#fade)" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={xAt(n - 1, n)} cy={yAt(last.total - min, max - min || 1)} r="3.5" fill="var(--accent)" />
      {axisLabels(series).map((a) => (
        <text key={a.label + a.x} x={a.x} y={H - 5} fill="var(--muted-2)" fontSize="9"
          fontFamily="monospace" textAnchor={a.anchor}>{a.label}</text>
      ))}
    </svg>
  );
}

function DailyBars({ days }: { days: number }) {
  const config = useStore((s) => s.config);
  const history = useStore((s) => s.history);
  const series = dailySeries(history, systemClock, days, config.dayBoundaryHour);

  const max = Math.max(1, ...series.map((p) => p.xp));
  const n = series.length;
  const slot = (W - PAD_L - PAD_R) / n;
  const bw = Math.max(1.5, slot * 0.62);
  const avg = averagePerDay(series);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="XP earned per day">
      <line x1={PAD_L} x2={W - PAD_R} y1={yAt(avg, max)} y2={yAt(avg, max)}
        stroke="var(--muted-2)" strokeWidth="1" strokeDasharray="3 4" />
      {series.map((p, i) => {
        const x = PAD_L + i * slot + (slot - bw) / 2;
        const y = yAt(p.xp, max);
        const hgt = Math.max(p.xp > 0 ? 2 : 0, H - PAD_B - y);
        return (
          <rect key={p.ts} x={x} y={H - PAD_B - hgt} width={bw} height={hgt} rx={Math.min(2, bw / 2)}
            fill={p.xp >= avg && p.xp > 0 ? "var(--accent)" : "rgba(255,255,255,0.22)"}>
            <title>{new Date(p.ts).toLocaleDateString()}: {p.xp} XP</title>
          </rect>
        );
      })}
      {axisLabels(series).map((a) => (
        <text key={a.label + a.x} x={a.x} y={H - 5} fill="var(--muted-2)" fontSize="9"
          fontFamily="monospace" textAnchor={a.anchor}>{a.label}</text>
      ))}
    </svg>
  );
}

function PillarShare() {
  const config = useStore((s) => s.config);
  const history = useStore((s) => s.history);

  const data = config.pillars.map((p) => ({ name: p.name, v: pillarTotalXP(history, p.id), c: p.accent }));
  const total = Math.max(1, data.reduce((s, d) => s + d.v, 0));

  return (
    <div className="share">
      <div className="share-bar">
        {data.map((d) => (
          <span key={d.name} style={{ width: `${(d.v / total) * 100}%`, background: d.c }} title={`${d.name} ${d.v} XP`} />
        ))}
      </div>
      <ul className="share-legend">
        {data.map((d) => (
          <li key={d.name}>
            <i style={{ background: d.c }} />
            <span className="nm">{d.name}</span>
            <span className="vl">{Math.round((d.v / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LevelsChart() {
  const config = useStore((s) => s.config);
  const pillars = useStore((s) => s.pillars);

  const data = config.pillars.map((p) => ({ name: p.name, v: pillars[p.id]?.level ?? 0, c: p.accent }));
  const max = Math.max(1, ...data.map((d) => d.v));

  return (
    <ul className="levels">
      {data.map((d) => (
        <li key={d.name}>
          <span className="nm">{d.name}</span>
          <span className="track"><i style={{ width: `${(d.v / max) * 100}%`, background: d.c }} /></span>
          <span className="vl">{d.v}</span>
        </li>
      ))}
    </ul>
  );
}

function Heatmap({ days }: { days: number }) {
  const config = useStore((s) => s.config);
  const history = useStore((s) => s.history);
  const span = Math.min(days, 182);
  const series = dailySeries(history, systemClock, span, config.dayBoundaryHour);
  const max = Math.max(1, ...series.map((p) => p.logs));

  return (
    <>
      <div className="heat">
        {series.map((p) => {
          const t = p.logs === 0 ? 0 : 0.3 + 0.7 * (p.logs / max);
          return (
            <span
              key={p.ts}
              title={`${new Date(p.ts).toLocaleDateString()}: ${p.logs} logs`}
              style={{ background: p.logs === 0 ? "rgba(255,255,255,0.05)" : `color-mix(in srgb, var(--accent) ${Math.round(t * 100)}%, transparent)` }}
            />
          );
        })}
      </div>
      <div className="heat-legend">
        less
        <span className="sw" style={{ background: "rgba(255,255,255,0.05)" }} />
        <span className="sw" style={{ background: "color-mix(in srgb,var(--accent) 40%,transparent)" }} />
        <span className="sw" style={{ background: "color-mix(in srgb,var(--accent) 70%,transparent)" }} />
        <span className="sw" style={{ background: "var(--accent)" }} />
        more
      </div>
    </>
  );
}

