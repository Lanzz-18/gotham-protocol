import { useEffect, useRef } from "react";

import { useStore } from "../store/useStore";
import { currentRank, overallLevel } from "../engine/ranks";
import { computeStreak } from "../engine/streak";
import { systemClock } from "../engine/clock";
import { Icon } from "./Icons";
import { useMenuSmoke } from "../fx/useMenuSmoke";
import { useRain } from "../fx/useRain";

interface MainMenuProps {
  onEnter: () => void;
  leaving: boolean;
  motion: boolean;
  /** The opening splash is still over it: unreachable until it hands over. */
  blocked?: boolean;
}

/** Landing screen: the Arkham plate with smoke off the shoulders, one way in. */
export function MainMenu({ onEnter, leaving, motion, blocked = false }: MainMenuProps) {
  const smokeRef = useMenuSmoke(motion);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const rainRef = useRain(motion, menuRef);
  const enterRef = useRef<HTMLButtonElement | null>(null);

  // autoFocus can't land while the menu is inert, so focus it on the hand-off.
  useEffect(() => { if (!blocked) enterRef.current?.focus(); }, [blocked]);

  const config = useStore((s) => s.config);
  const pillars = useStore((s) => s.pillars);
  const history = useStore((s) => s.history);
  const user = useStore((s) => s.user);

  const overall = overallLevel(pillars, config);
  const rank = currentRank(overall, config.ranks);
  const streak = computeStreak(history, systemClock, config.dayBoundaryHour, config.restWeeks);

  return (
    <div className={"menu" + (leaving ? " leaving" : "")} inert={blocked} ref={menuRef}>
      <div className="menu-stage" aria-hidden="true">
        <div className="menu-frame">
          <img className="menu-plate" src="menu-hero.webp" alt="" />
        </div>
        <canvas className="menu-smoke" ref={smokeRef} />
      </div>
      <canvas className="menu-rain" ref={rainRef} aria-hidden="true" />
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

          <button className="menu-enter" onClick={onEnter} ref={enterRef}>
            Go to home
          </button>
        </div>
      </div>
    </div>
  );
}
