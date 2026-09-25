import { useCallback, useEffect, useRef, useState } from "react";

const SPACING = 34;      // px between dots
const DOT_R = 1.1;       // dot radius
const BUCKETS = 14;      // alpha steps — dots are batched per step, 14 fills a frame
const BASE = 0.16;       // faint floor so the grid never fully disappears
const PEAK = 0.84;       // extra brightness inside the travelling light
const AMP = 3.6;         // px each dot swims from its grid slot
const SHARP = 1.8;       // contrast curve — pushes the mid tones down so bands read

/**
 * Black ground, fine grid of white dots, with a slow soft light drifting
 * across it so the grid breathes. Decorative only.
 *
 * Dots are grouped into alpha buckets and each bucket is filled once, so a
 * 1900-dot field costs fourteen fills per frame rather than nineteen hundred.
 *
 * Returns a callback ref rather than a plain one: the canvas only mounts after
 * the save has loaded, so the effect has to re-run when the node attaches.
 */
export function useDotField(enabled: boolean) {
  const nodeRef = useRef<HTMLCanvasElement | null>(null);
  const [attached, setAttached] = useState(0);

  const setCanvas = useCallback((el: HTMLCanvasElement | null) => {
    nodeRef.current = el;
    setAttached((n) => n + 1);
  }, []);

  useEffect(() => {
    const canvas = nodeRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let raf = 0;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const paths: Path2D[] = [];

    const draw = (time: number) => {
      ctx.clearRect(0, 0, w, h);

      const t = time * 0.0007;

      // the soft light wandering over the field
      const sx = w * (0.5 + 0.3 * Math.cos(t * 0.62));
      const sy = h * (0.5 + 0.34 * Math.sin(t * 0.47));
      const rx = w * 1.15;
      const ry = h * 1.15;

      for (let i = 0; i < BUCKETS; i++) paths[i] = new Path2D();

      for (let y = SPACING / 2; y < h; y += SPACING) {
        for (let x = SPACING / 2; x < w; x += SPACING) {
          // two waves crossing at different angles and speeds; where they meet
          // the grid brightens, and the whole field swims a few px with them
          const w1 = Math.sin(x * 0.009 + y * 0.011 - t * 2.4);
          const w2 = Math.sin(x * -0.006 + y * 0.014 + t * 1.6);
          const lum = Math.pow(0.5 + 0.5 * ((w1 + w2 * 0.8) / 1.8), SHARP);

          const dx = (x - sx) / rx;
          const dy = (y - sy) / ry;
          const spot = Math.max(0, 1 - (dx * dx + dy * dy));

          const px = x + Math.sin(y * 0.015 + t * 1.7) * AMP;
          const py = y + Math.cos(x * 0.013 - t * 1.4) * AMP;

          const b = Math.min(BUCKETS - 1, Math.max(0, Math.round(spot * lum * (BUCKETS - 1))));
          paths[b].moveTo(px + DOT_R, py);
          paths[b].arc(px, py, DOT_R, 0, 6.2832);
        }
      }

      ctx.fillStyle = "#ffffff";
      for (let i = 0; i < BUCKETS; i++) {
        ctx.globalAlpha = BASE + (i / (BUCKETS - 1)) * PEAK;
        ctx.fill(paths[i]);
      }
      ctx.globalAlpha = 1;
    };

    if (!enabled) {
      draw(0); // one still frame
    } else {
      const loop = (time: number) => {
        draw(time);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [enabled, attached]);

  return setCanvas;
}
