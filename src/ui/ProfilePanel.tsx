import { useStore } from "../store/useStore";
import { currentRank, currentRankIndex, nextRank, overallLevel, progressToNextOverall } from "../engine/ranks";
import { computeStreak } from "../engine/streak";
import { lifetimeXP } from "../engine/xp";
import { systemClock } from "../engine/clock";
import { usePortraitSmoke } from "../fx/usePortraitSmoke";
import { fmt } from "../lib/format";
import { Icon } from "./Icons";

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

interface ProfilePanelProps {
  onUploadPortrait: (tier: number) => void;
  motion: boolean;
}

export function ProfilePanel({ onUploadPortrait, motion }: ProfilePanelProps) {
  const config = useStore((s) => s.config);
  const pillars = useStore((s) => s.pillars);
  const history = useStore((s) => s.history);
  const portraits = useStore((s) => s.portraits);

  const overall = overallLevel(pillars, config);
  const idx = currentRankIndex(overall, config.ranks);
  const rank = currentRank(overall, config.ranks);
  const next = nextRank(overall, config.ranks);
  const prog = progressToNextOverall(pillars, config);
  const streak = computeStreak(history, systemClock, config.dayBoundaryHour);
  const aura = rank.aura;

  const smokeRef = usePortraitSmoke(motion, idx);
  const portrait = portraits[idx];

  return (
    <aside className="panel" id="profile-panel" style={{ ["--aura" as string]: aura }} aria-label="Profile and rank">
      <div className="portrait-wrap">
        <canvas className="portrait-smoke" ref={smokeRef} aria-hidden="true" />
        <div className="portrait-aura" />
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

      <div className="overall-block">
        <div className="overall-row">
          <span className="lbl">Overall Level</span>
          <span className="lvl">{overall}</span>
        </div>
        <div className="bar pulse" style={{ ["--barc" as string]: aura }}>
          <div className="fill" style={{ width: `${(prog.frac * 100).toFixed(1)}%` }} />
          <div className="segments" />
        </div>
        <div className="mini-stats">
          <span>
            {next ? <>NEXT: <b>{next.title}</b> @ Lv {next.threshold}</> : <b>MAX RANK</b>}
          </span>
          <span>Lifetime <b>{fmt(lifetimeXP(history))}</b> XP</span>
        </div>
      </div>

      <div>
        <span className="streak-badge">
          <span className="flame"><Icon name="flame" /></span>
          <span className="n">{streak}</span>
          <span className="t">DAY<br />STREAK</span>
        </span>
      </div>

      <div className="flavor">"{FLAVOR_LINES[idx % FLAVOR_LINES.length]}"</div>
    </aside>
  );
}
