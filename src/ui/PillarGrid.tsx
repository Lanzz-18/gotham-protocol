import { useEffect, useRef } from "react";

import { useStore } from "../store/useStore";
import { pillarTotalXP, xpToNext } from "../engine/xp";
import { computeNemesis, tugOfWar } from "../engine/nemesis";
import { systemClock } from "../engine/clock";
import { fmt, relTime } from "../lib/format";
import { Icon } from "./Icons";

const R = 33;
const CIRC = 2 * Math.PI * R;

/** Level sits inside a ring whose fill is progress toward the next level. */
function LevelRing({ level, frac, accent }: { level: number; frac: number; accent: string }) {
  return (
    <div className="pc-ring">
      <svg viewBox="0 0 76 76" aria-hidden="true">
        <circle cx="38" cy="38" r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="5" />
        <circle
          cx="38" cy="38" r={R} fill="none"
          stroke={accent} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - Math.min(1, Math.max(0, frac)))}
          style={{ transition: "stroke-dashoffset .7s cubic-bezier(.2,.9,.25,1)" }}
        />
      </svg>
      <div className="lv">
        <b>{level}</b>
        <span>Level</span>
      </div>
    </div>
  );
}

export function PillarGrid() {
  const config = useStore((s) => s.config);
  const pillars = useStore((s) => s.pillars);
  const history = useStore((s) => s.history);
  const addLog = useStore((s) => s.addLog);

  // Flash a card once when its level goes up.
  const prevLevels = useRef<Record<string, number>>({});
  const gridRef = useRef<HTMLDivElement | null>(null);

  const pillarIds = config.pillars.map((p) => p.id).join(",");

  /* Roll each card's sheen timing once, in an effect rather than during render
     so the randomness never runs twice for one paint. The negative delay drops
     each card at a random point mid-cycle, so they are already out of step on
     the first frame instead of marching together. */
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    grid.querySelectorAll<HTMLElement>("[data-pillar]").forEach((card) => {
      if (card.dataset.sheen) return;
      const dur = 9 + Math.random() * 8;
      card.style.setProperty("--sheen-dur", dur.toFixed(2) + "s");
      card.style.setProperty("--sheen-delay", (-Math.random() * dur).toFixed(2) + "s");
      card.dataset.sheen = "1";
    });
  }, [pillarIds]);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    for (const p of config.pillars) {
      const now = pillars[p.id]?.level ?? 0;
      const was = prevLevels.current[p.id];
      if (was !== undefined && now > was) {
        const card = grid.querySelector<HTMLElement>(`[data-pillar="${p.id}"]`);
        if (card) {
          card.classList.remove("levelup");
          void card.offsetWidth;
          card.classList.add("levelup");
          setTimeout(() => card.classList.remove("levelup"), 1050);
        }
      }
      prevLevels.current[p.id] = now;
    }
  }, [pillars, config.pillars]);

  const nemesis = computeNemesis(history, config, systemClock);

  return (
    <div className="pillar-grid" ref={gridRef}>
      {config.pillars.map((p) => {
        const st = pillars[p.id] ?? { xp: 0, level: 0, lastActivity: null };
        const need = xpToNext(st.level, config.xpCurve);
        const frac = Math.min(1, st.xp / need);
        const toGo = Math.max(0, need - st.xp);
        const count = history.filter((h) => h.pillar === p.id).length;

        const foe = nemesis[p.id];
        const tug = tugOfWar(pillarTotalXP(history, p.id), foe.xp);
        const yourPct = (tug.playerShare * 100).toFixed(1);

        return (
          <div
            key={p.id}
            className="pillar-card"
            data-pillar={p.id}
            style={{ ["--pc" as string]: p.accent }}
          >
            <div className="pc-head">
              <LevelRing level={st.level} frac={frac} accent={p.accent} />
              <div className="pc-title">
                <div className="name">{p.name}</div>
                <div className="theme">{p.theme}</div>
                <div className="togo">
                  <b>{fmt(toGo)} XP</b> to level {st.level + 1}
                  {" · "}{Math.floor(frac * 100)}%
                </div>
              </div>
              <div className="pc-icon"><Icon name={p.icon} /></div>
            </div>

            {!foe.dormant && (
              <div className="nemesis-row" data-nemesis={p.id}>
                <div className="tug">
                  <div className="tug-you" style={{ width: `${yourPct}%` }} />
                </div>
                <div className="nemesis-meta">
                  <span className={"vs" + (tug.losing ? " ahead" : "")}>vs {foe.name}</span>
                  <span className="nx">
                    {foe.missedDays === 0
                      ? "held the line"
                      : `${foe.missedDays} day${foe.missedDays === 1 ? "" : "s"} lost · ${fmt(foe.xp)} XP`}
                  </span>
                </div>
              </div>
            )}

            <div className="pc-actions">
              {p.actions.map((a, ai) => (
                <button key={ai} className="log-btn" onClick={() => addLog(p.id, a.label, a.xp)}>
                  {a.label} <span className="xp">+{a.xp}</span>
                </button>
              ))}
            </div>

            <div className="pc-foot">
              <span>Last <b>{st.lastActivity ? relTime(st.lastActivity) : "never"}</b></span>
              <span>{fmt(st.xp)} / {fmt(need)} XP{" · "}{count} logs</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
