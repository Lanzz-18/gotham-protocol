import { useEffect, useRef } from "react";

import { useStore } from "../store/useStore";
import { currentRank, currentRankIndex, legendLevel, nextRank, overallLevel, progressToNextOverall } from "../engine/ranks";
import { computeStreak } from "../engine/streak";
import { currentWeekStart } from "../engine/week";
import { lifetimeXP } from "../engine/xp";
import { systemClock } from "../engine/clock";
import { usePortraitSmoke } from "../fx/usePortraitSmoke";
import { fmt } from "../lib/format";
import { readJSON, writeJSON } from "../lib/storage";
import { Icon } from "./Icons";
import { Roll } from "./Roll";

const FLAVOR_LINES = [
  "Gotham sleeps. You don't.",
  "The night is a discipline.",
  "Every log is a brick in the cave.",
  "Fear is a tool. So is consistency.",
  "The city doesn't need a hero today. It needs your reps.",
  "Order, forged from routine.",
  "You are the protocol.",
  "One more entry. One step deeper into legend.",
];

/** Streak lengths that get a burst. 66 days is the average time a habit takes to stick (Lally et al.). */
const MILESTONES = [66, 30, 7];
const MILESTONE_KEY = "gp-flame-milestone";

/** Smoke thickens as the card gets more legendary. */
const SMOKE_BY_LEGEND = [34, 34, 46, 52, 60, 64];

interface ProfilePanelProps {
  onUploadPortrait: (tier: number) => void;
  motion: boolean;
  /** The console is actually on screen (not behind the menu), so celebrations can play. */
  live?: boolean;
}

export function ProfilePanel({ onUploadPortrait, motion, live = true }: ProfilePanelProps) {
  const config = useStore((s) => s.config);
  const pillars = useStore((s) => s.pillars);
  const history = useStore((s) => s.history);
  const portraits = useStore((s) => s.portraits);
  const pushToast = useStore((s) => s.pushToast);

  const overall = overallLevel(pillars, config);
  const idx = currentRankIndex(overall, config.ranks);
  const rank = currentRank(overall, config.ranks);
  const next = nextRank(overall, config.ranks);
  const prog = progressToNextOverall(pillars, config);
  const streak = computeStreak(history, systemClock, config.dayBoundaryHour, config.restWeeks);
  const resting = (config.restWeeks ?? []).includes(currentWeekStart(systemClock, config.dayBoundaryHour));
  const aura = rank.aura;

  // The card's legendary layers: every step keeps the ones before it.
  const lg = legendLevel(idx);
  const lgClasses = Array.from({ length: lg }, (_, i) => ` lg-${i + 1}`).join("");

  const smokeRef = usePortraitSmoke(motion, idx, SMOKE_BY_LEGEND[lg]);
  const portrait = portraits[idx];

  // The flame grows with the streak and bursts once at each milestone.
  const heat = Math.min(streak, 66) / 66;
  const flameTier = streak >= 66 ? 3 : streak >= 30 ? 2 : streak >= 7 ? 1 : 0;
  const badgeRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!live) return;
    const reached = MILESTONES.find((m) => streak >= m) ?? 0;
    const celebrated = readJSON(MILESTONE_KEY, 0);
    // Falling back below a milestone resets it, so it can be earned again.
    writeJSON(MILESTONE_KEY, reached);
    if (reached <= celebrated) return;
    pushToast(`${reached}-day streak`, "levelup");
    const badge = badgeRef.current;
    if (!badge || !motion) return;
    badge.classList.remove("burst");
    void badge.offsetWidth;
    badge.classList.add("burst");
    const t = window.setTimeout(() => badge.classList.remove("burst"), 1400);
    return () => clearTimeout(t);
  }, [streak, live, motion, pushToast]);

  return (
    <aside
      className={"panel" + lgClasses}
      id="profile-panel"
      data-legend={lg}
      style={{ ["--aura" as string]: aura }}
      aria-label="Profile and rank"
    >
      <div className="portrait-wrap">
        <div className="portrait-halo" aria-hidden="true"><Icon name="bat" /></div>
        <canvas className="portrait-smoke" ref={smokeRef} aria-hidden="true" />
        <div className="portrait-aura" />
        <div className="portrait-embers" aria-hidden="true">
          {Array.from({ length: 10 }, (_, i) => <i key={i} />)}
        </div>
        <div className="portrait-frame">
          {portrait ? (
            <img src={portrait} alt={`Portrait for rank ${rank.title}`} />
          ) : (
            <div className="portrait-placeholder">
              <Icon name="bat" />
              <span className="ph-tier">{rank.title}</span>
            </div>
          )}
        </div>
        <div className="portrait-ring" />
        <div className="portrait-sweep" aria-hidden="true" />
        {(["tl", "tr", "bl", "br"] as const).map((c) => (
          <span key={c} className={`portrait-corner ${c}`} aria-hidden="true"><Icon name="bat" /></span>
        ))}
        <button
          className="btn ghost sm portrait-upload"
          onClick={() => onUploadPortrait(idx)}
          aria-label="Upload portrait for this rank"
        >
          Upload
        </button>
      </div>

      <div className="rank-tier-label">RANK TIER {idx}</div>
      <div className="rank-title">{rank.title}</div>
      {resting && <div className="rest-tag">Resting · back Monday</div>}

      <div className="overall-block">
        <div className="overall-row">
          <span className="lbl">Overall Level</span>
          <span className="lvl"><Roll value={overall} /></span>
        </div>
        <div className="bar pulse" style={{ ["--barc" as string]: aura }}>
          <div className="fill" style={{ width: `${(prog.frac * 100).toFixed(1)}%` }} />
          <div className="segments" />
        </div>
        <div className="mini-stats">
          <span>
            {next ? <>NEXT: <b>{next.title}</b> @ Lv {next.threshold}</> : <b>MAX RANK</b>}
          </span>
          <span>Lifetime <b><Roll value={lifetimeXP(history)} format={fmt} /></b> XP</span>
        </div>
      </div>

      <div>
        <span
          className={`streak-badge heat-${flameTier}`}
          style={{ ["--heat" as string]: heat }}
          ref={badgeRef}
          data-heat={flameTier}
        >
          <span className="flame">
            <Icon name="flame" />
            <span className="flame-embers" aria-hidden="true"><i /><i /><i /></span>
          </span>
          <span className="n"><Roll value={streak} /></span>
          <span className="t">DAY<br />STREAK</span>
        </span>
      </div>

      <div className="flavor">"{FLAVOR_LINES[idx % FLAVOR_LINES.length]}"</div>
    </aside>
  );
}
