import { useCallback, useEffect, useRef, useState } from "react";

interface Particle {
  x: number; y: number; r: number;
  vx: number; vy: number;
  life: number; age: number;
  seed: number;
  /** Per-wisp brightness, so the cloud has light and dark in it. */
  dim: number;
  /** Sheared, slowly turning ellipse — a round stamp reads as a bubble. */
  aspect: number;
  ang: number;
  spin: number;
}

const COUNT = 140;   // many small wisps read as smoke; few large ones read as blobs
const PEAK = 0.17;   // per-wisp alpha at its fullest
const FLOW = 0.32;   // strength of the turbulence field

/* The canvas overhangs the frame so wisps can drift outside it without being
   clipped. Everything below is authored in FRAME coordinates and mapped in. */
const PAD = 0.08;
const F0 = PAD / (1 + 2 * PAD);
const SPAN = 1 - 2 * F0;
const toCanvas = (v: number) => F0 + v * SPAN;
const toFrame = (v: number) => (v - F0) / SPAN;

/* The ceiling smoke dissolves at, as a fraction of the box height (0 = top).
   Over the cowl it sits just under the chin so the face is never veiled; out
   at the sides there is nothing to hide, so wisps are free to climb. */
const CEIL_SIDE = 0.36;
const CEIL_HEAD = 0.80;   // the chin sits at 0.766, so this stops short of it
const HEAD_X0 = 0.40;     // the neck column, narrower than the cowl above it
const HEAD_X1 = 0.66;
const MARGIN = 0.09;

/** `fx` is in frame coordinates; outside the frame there is no face to protect. */
function ceilAt(fx: number): number {
  if (fx < 0 || fx > 1) return CEIL_SIDE;
  let k = 0;
  if (fx > HEAD_X0 - MARGIN && fx < HEAD_X1 + MARGIN) {
    const d = Math.min(fx - (HEAD_X0 - MARGIN), HEAD_X1 + MARGIN - fx) / MARGIN;
    k = Math.min(1, Math.max(0, d));
    k = k * k * (3 - 2 * k); // smoothstep, so the ceiling has no hard step
  }
  return CEIL_SIDE + k * (CEIL_HEAD - CEIL_SIDE);
}

/* The two shoulder blades, as line segments in frame coordinates, traced from
   the armour in the plate. Wisps are born just ABOVE the line, in the dark
   behind the figure, so they read as rising from behind his back. */
const SHOULDERS = [
  { x0: 0.295, y0: 0.895, x1: 0.440, y1: 0.795, drift: -0.45, weight: 1 },
  { x0: 0.735, y0: 0.735, x1: 0.985, y1: 0.845, drift: 0.45, weight: 1 },
];
const TOTAL_WEIGHT = SHOULDERS.reduce((s, p) => s + p.weight, 0);

function pickShoulder() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const p of SHOULDERS) {
    r -= p.weight;
    if (r <= 0) return p;
  }
  return SHOULDERS[0];
}

/** One soft dot, drawn once and reused — far cheaper than a gradient per wisp. */
function makeSprite(): HTMLCanvasElement {
  const S = 64;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0, "rgba(232,236,244,1)");
    grad.addColorStop(0.45, "rgba(206,212,224,0.45)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
  }
  return c;
}

/**
 * Smoke drifting off the shoulders of the menu plate.
 *
 * Wisps are pushed through a rolling flow field rather than sent straight up,
 * which is what gives the curl. They spread far more than they climb, and an
 * alpha ceiling dissolves them before they reach the cowl, so the face never
 * ends up behind a veil.
 */
export function useMenuSmoke(enabled: boolean) {
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

    const sprite = makeSprite();
    let w = 0;
    let h = 0;
    let raf = 0;
    let dpr = 1;
    let parts: Particle[] = [];

    /* Everything below is expressed against a 560px-tall reference box and
       scaled, so the smoke looks identical whatever size the plate renders at. */
    let S = 1;

    const make = (seed: boolean): Particle => {
      const p = pickShoulder();
      const u = Math.random();                       // position along the blade
      const life = 2800 + Math.random() * 3000;
      // sit just above the armour, in the dark, so the smoke reads as behind him
      const lift = 0.006 + Math.random() * 0.032;
      const jitter = (Math.random() - 0.5) * 0.035;
      return {
        x: toCanvas(p.x0 + (p.x1 - p.x0) * u + jitter) * w,
        y: toCanvas(p.y0 + (p.y1 - p.y0) * u - lift) * h,
        r: (8 + Math.random() * 15) * S,
        vx: (p.drift * (0.02 + Math.random() * 0.06) + (Math.random() - 0.5) * 0.30) * S,
        vy: -(0.35 + Math.random() * 0.55) * S,
        life,
        age: seed ? Math.random() * life : 0,
        seed: Math.random() * 100,
        dim: 0.6 + Math.random() * 0.4,
        aspect: 1.7 + Math.random() * 1.6,
        ang: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.004,
      };
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return; // plate has not laid out yet
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = rect.width;
      h = rect.height;
      S = h / 560;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      parts = [];
      for (let i = 0; i < COUNT; i++) parts.push(make(true));
    };

    /* A plain resize listener missed the moment the image finished loading and
       gave the figure its height — which left the canvas at zero and stretched
       every wisp into a vertical streak. ResizeObserver catches that. */
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(resize);
      ro.observe(canvas);
    } else {
      window.addEventListener("resize", resize);
    }
    resize();

    let t = 0;

    const step = () => {
      t += 0.016;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      for (const p of parts) {
        p.age += 16;

        /* Rolling flow field, sampled in normalised coordinates so the swirl
           keeps its shape at any plate size. Two sine terms at different
           scales stand in for curl noise — enough to make the smoke fold. */
        const ny = p.y / h;
        const nx = p.x / w;
        const fx =
          Math.sin(ny * 11 + t * 0.7 + p.seed) * 0.85 +
          Math.sin(ny * 29 - t * 1.15 + p.seed * 0.5) * 0.35;
        const fy = Math.cos(nx * 17 - t * 0.55 + p.seed) * 0.3;

        p.x += p.vx + fx * FLOW * S;
        p.y += p.vy + fy * FLOW * 0.45 * S;
        p.r += 0.095 * S;
        p.ang += p.spin;

        const t01 = p.age / p.life;
        if (t01 >= 1) {
          Object.assign(p, make(false));
          continue;
        }

        // fade in and out over the life, then again as it nears its ceiling
        let a = Math.sin(t01 * Math.PI) * PEAK * p.dim;
        const c = ceilAt(toFrame(nx));
        const fadeFrom = c + 0.16;
        const fy01 = toFrame(ny);
        if (fy01 < fadeFrom) {
          a *= Math.max(0, (fy01 - c) / (fadeFrom - c));
        }
        if (a <= 0.002) continue;

        ctx.globalAlpha = a;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.ang);
        const rw = p.r * p.aspect;
        ctx.drawImage(sprite, -rw, -p.r, rw * 2, p.r * 2);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };

    if (!enabled) {
      step();
    } else {
      const loop = () => {
        step();
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      else window.removeEventListener("resize", resize);
    };
  }, [enabled, attached]);

  return setCanvas;
}
