import { lazy, Suspense, useState, useSyncExternalStore } from "react";

import { PillarGrid } from "./PillarGrid";

// three.js is only downloaded when the Batsuit is actually going to show.
const BatsuitScene = lazy(() => import("./BatsuitScene"));

const WIDE = "(min-width: 761px)";

function subscribeWide(cb: () => void) {
  const mq = window.matchMedia?.(WIDE);
  mq?.addEventListener("change", cb);
  return () => mq?.removeEventListener("change", cb);
}
const isWide = () => !!window.matchMedia?.(WIDE)?.matches;

function canWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * The Pillars page: the 3D Batsuit where it can run well, otherwise the
 * pillar cards — on phones, with reduced motion, or without WebGL — so logging
 * never depends on the 3D scene.
 */
export function PillarsView({ motion }: { motion: boolean }) {
  const wide = useSyncExternalStore(subscribeWide, isWide, () => false);
  const [webgl] = useState(canWebGL);

  if (!motion || !wide || !webgl) return <PillarGrid motion={motion} />;
  return (
    <Suspense fallback={<div className="suit"><div className="suit-box loading">Suiting up…</div></div>}>
      <BatsuitScene motion={motion} />
    </Suspense>
  );
}
