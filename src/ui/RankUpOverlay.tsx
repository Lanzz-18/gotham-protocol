import { useEffect, type CSSProperties } from "react";

import { Icon } from "./Icons";
import type { RankConfig } from "../engine/types";

interface RankUpOverlayProps {
  rank: RankConfig;
  /** Portrait of the rank you just left, and of the one you reached. */
  from?: string;
  to?: string;
  motion?: boolean;
  onDone: () => void;
}

const COLS = 5;
const ROWS = 6;
const DURATION = 3600;

/** Same scatter every time for the same tile — keeps render pure, no Math.random. */
function hash(i: number, k: number): number {
  const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** One portrait cut into COLS×ROWS tiles that either blow apart ("out") or fly together ("in"). */
function Shards({ src, mode }: { src: string; mode: "out" | "in" }) {
  const tiles = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      // Outward from the centre of the card, plus some spread.
      const dx = c - (COLS - 1) / 2 + (hash(i, mode === "out" ? 1 : 4) - 0.5) * 1.4;
      const dy = r - (ROWS - 1) / 2 + (hash(i, mode === "out" ? 2 : 5) - 0.5) * 1.4;
      const dist = 70 + hash(i, 3) * 120;
      const len = Math.hypot(dx, dy) || 1;
      const style = {
        left: `${(c / COLS) * 100}%`,
        top: `${(r / ROWS) * 100}%`,
        width: `${100 / COLS}%`,
        height: `${100 / ROWS}%`,
        "--tx": `${((dx / len) * dist).toFixed(1)}px`,
        "--ty": `${((dy / len) * dist).toFixed(1)}px`,
        "--r": `${((hash(i, 6) - 0.5) * 140).toFixed(0)}deg`,
        // centre tiles go first on the way out, last on the way in
        "--dl": `${((len / 3.2) * 0.22).toFixed(3)}s`,
      } as CSSProperties;
      tiles.push(
        <div key={i} className="ru-tile" style={style}>
          <img
            src={src}
            alt=""
            style={{ width: `${COLS * 100}%`, height: `${ROWS * 100}%`, left: `${-c * 100}%`, top: `${-r * 100}%` }}
          />
        </div>,
      );
    }
  }
  return <div className={`ru-shards ${mode}`}>{tiles}</div>;
}

/**
 * Plays once when you cross into a new rank. The suit-up: your old rank's
 * portrait shatters, the pieces of the new one fly together in its place,
 * flash, and the new title lands under it — over the bat signal.
 */
export function RankUpOverlay({ rank, from, to, motion = true, onDone }: RankUpOverlayProps) {
  useEffect(() => {
    const t = setTimeout(onDone, DURATION);
    return () => clearTimeout(t);
  }, [onDone]);

  const suitUp = motion && !!from && !!to;

  return (
    <div id="rankup-overlay" style={{ ["--aura" as string]: rank.aura }} aria-hidden="true">
      <div className="ru-dim" />
      <div className="ru-signal"><Icon name="bat" /></div>
      {suitUp && (
        <div className="ru-card">
          <Shards src={from} mode="out" />
          <Shards src={to} mode="in" />
          <div className="ru-flash" />
        </div>
      )}
      <div className={"ru-text" + (suitUp ? " late" : "")}>
        <div className="k">Rank Ascended</div>
        <div className="title">{rank.title}</div>
      </div>
    </div>
  );
}
