import { useEffect, useRef } from "react";

import { useStore } from "../store/useStore";
import { currentRank, overallLevel } from "../engine/ranks";
import { computeStreak } from "../engine/streak";
import { systemClock } from "../engine/clock";
import { Icon } from "./Icons";
import { useMenuSmoke } from "../fx/useMenuSmoke";

interface MainMenuProps {
  onEnter: () => void;
  leaving: boolean;
  motion: boolean;
}

/** Landing screen: the Arkham plate with smoke off the shoulders, one way in. */
export function MainMenu({ onEnter, leaving, motion }: MainMenuProps) {
  const smokeRef = useMenuSmoke(motion);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const queued = useRef(0);

  /* The plate leans a few pixels toward the cursor. Tiny, but it is what stops
     the screen reading as a flat photograph — it answers back. */
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!motion || queued.current) return;
    const { clientX, clientY } = e;
    queued.current = requestAnimationFrame(() => {
      queued.current = 0;
      const stage = stageRef.current;
      if (!stage) return;
      const dx = clientX / window.innerWidth - 0.5;
      const dy = clientY / window.innerHeight - 0.5;
      stage.style.setProperty("--px", `${(dx * 18).toFixed(1)}px`);
      stage.style.setProperty("--py", `${(dy * 12).toFixed(1)}px`);
    });
  };

  useEffect(() => () => { if (queued.current) cancelAnimationFrame(queued.current); }, []);
  const config = useStore((s) => s.config);
  const pillars = useStore((s) => s.pillars);
  const history = useStore((s) => s.history);
  const user = useStore((s) => s.user);

  const overall = overallLevel(pillars, config);
  const rank = currentRank(overall, config.ranks);
  const streak = computeStreak(history, systemClock, config.dayBoundaryHour);

  return (
    <div className={"menu" + (leaving ? " leaving" : "")} onPointerMove={onPointerMove}>
      <div className="menu-stage" ref={stageRef} aria-hidden="true">
        <div className="menu-frame">
          <img className="menu-plate" src="menu-hero.webp" alt="" />
          <div className="menu-gleam" />
        </div>
        <canvas className="menu-smoke" ref={smokeRef} />
      </div>
      <div className="menu-scrim" aria-hidden="true" />

      <div className="menu-inner">
        <div className="menu-top">
          <span className="menu-mark" aria-hidden="true"><Icon name="bat" /></span>
          <h1 className="menu-title">{config.appName}</h1>
          <p className="menu-rank">{rank.title}</p>

          <dl className="menu-stats">
            <div><dt>Overall</dt><dd>{overall}</dd></div>
            <div><dt>Streak</dt><dd>{streak}</dd></div>
            <div><dt>Logs</dt><dd>{history.length}</dd></div>
          </dl>
        </div>

        <div className="menu-bottom">
          {user && <p className="menu-welcome">Welcome, {user.name}</p>}

          <button className="menu-enter" onClick={onEnter} autoFocus>
            Go to home
          </button>
        </div>
      </div>
    </div>
  );
}
