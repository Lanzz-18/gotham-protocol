import { useEffect } from "react";

import { Icon } from "./Icons";
import type { RankConfig } from "../engine/types";

interface RankUpOverlayProps {
  rank: RankConfig;
  onDone: () => void;
}

/** The bat-signal sweep that plays once when you cross into a new rank tier. */
export function RankUpOverlay({ rank, onDone }: RankUpOverlayProps) {
  useEffect(() => {
    const t = setTimeout(onDone, 3400);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div id="rankup-overlay" style={{ ["--aura" as string]: rank.aura }} aria-hidden="true">
      <div className="ru-dim" />
      <div className="ru-glitch" />
      <div className="ru-beam" />
      <div className="ru-signal"><Icon name="bat" /></div>
      <div className="ru-text">
        <div className="k">Rank Ascended</div>
        <div className="title">{rank.title}</div>
      </div>
    </div>
  );
}
