import { useEffect, useRef } from "react";

interface Particle {
  x: number; y: number; r: number;
  vx: number; vy: number;
  life: number; age: number;
}

// The portrait sits centred in the canvas, inset by the CSS margins (50px all sides).
const PAD_X = 50;
const PAD_TOP = 50;
const PAD_BOTTOM = 50;
const COUNT = 34;

/**
 * White smoke curling off the OUTLINE of the portrait. Ported from legacy
 * initPortraitSmoke(). Re-seeds across particle lifetimes so the effect starts
 * full instead of flashing empty on every rank change.
 */
export function usePortraitSmoke(enabled: boolean, rankKey: string | number) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(60, rect.width);
    const h = Math.max(80, rect.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Pick a spawn point on the portrait outline plus an outward/upward launch vector.
    const edge = () => {
      const x0 = PAD_X;
      const y0 = PAD_TOP;
      const x1 = w - PAD_X;
      const y1 = h - PAD_BOTTOM;
      const r = Math.random();
      if (r < 0.42) return { x: x0 + Math.random() * (x1 - x0), y: y0, nx: (Math.random() - 0.5) * 0.5, ny: -1 };
      if (r < 0.71) return { x: x0, y: y0 + Math.random() * (y1 - y0) * 0.85, nx: -1, ny: -0.35 };
      return { x: x1, y: y0 + Math.random() * (y1 - y0) * 0.85, nx: 1, ny: -0.35 };
    };

    const make = (seed: boolean): Particle => {
      const e = edge();
      const life = 2200 + Math.random() * 2600;
      const spd = 0.13 + Math.random() * 0.2;
      return {
        x: e.x,
        y: e.y,
        r: 5 + Math.random() * 10,
        vx: e.nx * spd + (Math.random() - 0.5) * 0.05,
        vy: e.ny * spd - (0.04 + Math.random() * 0.09),
        life,
        age: seed ? Math.random() * life : 0,
      };
    };

    const parts: Particle[] = [];
    for (let i = 0; i < COUNT; i++) parts.push(make(true));

    const step = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter"; // white wisps build luminously against the dark
      for (const p of parts) {
        p.age += 16;
        p.x += p.vx;
        p.y += p.vy;
        p.r += 0.06;
        p.vy -= 0.0006;
        const t = p.age / p.life;
        if (t >= 1) {
          Object.assign(p, make(false));
          continue;
        }
        const a = Math.sin(Math.min(1, t) * Math.PI) * 0.16;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, `rgba(255,255,255,${a.toFixed(3)})`);
        g.addColorStop(0.5, `rgba(226,228,235,${(a * 0.55).toFixed(3)})`);
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 6.2832);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    };

    let raf = 0;
    if (!enabled) {
      step();
    } else {
      const loop = () => {
        step();
        raf = requestAnimationFrame(loop);
      };
      loop();
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [enabled, rankKey]);

  return ref;
}
