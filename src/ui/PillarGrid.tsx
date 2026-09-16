import { useEffect, useRef } from "react";

import { useStore } from "../store/useStore";
import { pillarTotalXP, xpToNext } from "../engine/xp";
import { computeNemesis, tugOfWar } from "../engine/nemesis";
import { systemClock } from "../engine/clock";
import { fmt, relTime } from "../lib/format";
import { Icon } from "./Icons";

export function PillarGrid() {
  const config = useStore((s) => s.config);
  const pillars = useStore((s) => s.pillars);
  const history = useStore((s) => s.history);
  const addLog = useStore((s) => s.addLog);

  // Flash a card when its level goes up, then let the steady aura pulse resume.
  const prevLevels = useRef<Record<string, number>>({});
  const gridRef = useRef<HTMLDivElement | null>(null);

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
          const bar = card.querySelector(".bar");
          bar?.classList.add("surge");
          setTimeout(() => bar?.classList.remove("surge"), 700);
          setTimeout(() => card.classList.remove("levelup"), 1050);
        }
      }
      prevLevels.current[p.id] = now;
    }
  }, [pillars, config.pillars]);

  const nemesis = computeNemesis(history, config, systemClock);

  return (
    <div className="pillar-grid" ref={gridRef}>
      {config.pillars.map((p, i) => {
        const st = pillars[p.id] ?? { xp: 0, level: 0, lastActivity: null };
        const need = xpToNext(st.level, config.xpCurve);
        const frac = Math.min(1, st.xp / need);
        const count = history.filter((h) => h.pillar === p.id).length;

        const foe = nemesis[p.id];
        const tug = tugOfWar(pillarTotalXP(history, p.id), foe.xp);
        const yourPct = (tug.playerShare * 100).toFixed(1);

        return (
          <div
            key={p.id}
            className="panel pillar-card"
            data-pillar={p.id}
            style={{ ["--pc" as string]: p.accent, animationDelay: `${(i * 0.7).toFixed(2)}s` }}
          >
            <div className="glowline" />
            <div className="pc-head">
              <div className="pc-icon"><Icon name={p.icon} /></div>
              <div className="pc-title">
                <div className="name">{p.name}</div>
                <div className="theme">{p.theme}</div>
              </div>
              <div className="pc-level">
                <div className="lv-num">{st.level}</div>
                <div className="lv-lbl">Level</div>
              </div>
            </div>

            <div className="pc-barrow">
              <div className="bar pulse" style={{ ["--barc" as string]: p.accent }}>
                <div className="fill" style={{ width: `${(frac * 100).toFixed(1)}%` }} />
                <div className="segments" />
              </div>
              <div className="pc-xp">
                <span>{fmt(st.xp)} / {fmt(need)} XP</span>
                <span>{Math.floor(frac * 100)}%</span>
              </div>
            </div>

            {!foe.dormant && (
              <div className="nemesis-row" data-nemesis={p.id}>
                <div className="tug">
                  <div className="tug-you" style={{ width: `${yourPct}%` }} />
                  <div className="tug-edge" style={{ left: `${yourPct}%` }} />
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
              <span className="last">Last: <b>{st.lastActivity ? relTime(st.lastActivity) : "never"}</b></span>
              <span>{count} logs</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
