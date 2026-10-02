/**
 * The opening bat swarm, Arkham style: bats pour out of the bottom-left
 * corner and the darkness is carved away behind them, revealing the main
 * menu underneath. Everything is drawn on one full-screen canvas:
 *
 *   1. paint the darkness (near-black plus a faint moonlit haze)
 *   2. erase it: a soft front sweeping corner to corner, plus the trails the
 *      bats have carved so far (accumulated on a half-res mask)
 *   3. draw the bats on top — far ones small and sharp, a few giants right
 *      past the camera, blurred
 */

const TAU = Math.PI * 2;
const SPRITE_W = 120;
const SPRITE_H = 80;
const FRAMES = 8;

/* Timeline, in seconds from the moment the swarm starts. */
const EMIT_FOR = 0.9;      // bats keep pouring out of the corner this long
const FRONT_START = 0.12;
const FRONT_FOR = 1.6;     // the darkness front takes this long to cross
const END_AT = 2.2;        // after this the splash fades and hands over

const DARK = "#050506";
const RIM = "rgba(199,204,214,0.30)";

interface Bat {
  x: number; y: number;
  vx: number; vy: number;
  size: number;
  z: number;
  born: number;
  flapHz: number;
  phase: number;
  seed: number;
  giant: boolean;
}

/**
 * One wing laid flat: shoulder at the origin, spreading to +x, with the
 * classic scalloped trailing edge running finger to finger back to the body.
 */
function wingPath(g: CanvasRenderingContext2D) {
  g.moveTo(0, -3);
  g.quadraticCurveTo(14, -15, 30, -13);
  g.quadraticCurveTo(43, -12, 50, -4); // tip
  g.quadraticCurveTo(44, 0, 42, 11);
  g.quadraticCurveTo(36, 5, 29, 15);
  g.quadraticCurveTo(22, 8, 15, 14);
  g.quadraticCurveTo(9, 8, 2, 10);
  g.closePath();
}

/** The whole bat at flap `w` (1 = wings up, -1 = down). Wings pivot at the shoulder and foreshorten at the ends of the stroke. */
function silhouette(g: CanvasRenderingContext2D, w: number, color: string, ox: number, oy: number) {
  g.save();
  g.translate(SPRITE_W / 2 + ox, SPRITE_H / 2 + 4 + oy);
  g.fillStyle = color;
  for (const side of [1, -1]) {
    g.save();
    g.scale(side, 1);
    g.translate(4, -4);
    g.rotate(-w * 0.55);
    g.scale(0.72 + 0.28 * (1 - Math.abs(w)), 1);
    g.beginPath();
    wingPath(g);
    g.fill();
    g.restore();
  }
  g.beginPath();
  g.ellipse(0, 0, 6, 12, 0, 0, TAU);
  g.fill();
  g.beginPath();
  g.arc(0, -14, 5.5, 0, TAU);
  g.moveTo(-4.8, -16); g.lineTo(-3.6, -23); g.lineTo(-1.2, -17.5);
  g.moveTo(4.8, -16); g.lineTo(3.6, -23); g.lineTo(1.2, -17.5);
  g.fill();
  g.restore();
}

/**
 * The flap cycle pre-rendered once. With `rim`, a lighter silhouette nudged a
 * pixel each way sits under the black one, leaving a thin moonlit edge — that
 * is what makes a black bat visible against black. The giants skip it: up
 * close and blurred, a rim reads as a neon outline.
 */
function makeFrames(scale: number, blur: number, rim: boolean): HTMLCanvasElement[] {
  const out: HTMLCanvasElement[] = [];
  for (let k = 0; k < FRAMES; k++) {
    const w = Math.cos((k / FRAMES) * TAU);
    const c = document.createElement("canvas");
    c.width = Math.round(SPRITE_W * scale);
    c.height = Math.round(SPRITE_H * scale);
    const g = c.getContext("2d");
    if (g) {
      if (blur > 0) g.filter = `blur(${blur}px)`;
      g.scale(scale, scale);
      if (rim) for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) silhouette(g, w, RIM, ox, oy);
      silhouette(g, w, DARK, 0, 0);
    }
    out.push(c);
  }
  return out;
}

/** Soft disc used to carve trails into the darkness. */
function makeBlob(): HTMLCanvasElement {
  const S = 64;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0, "rgba(0,0,0,1)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
  }
  return c;
}

const ease = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, t)));

export interface SwarmOptions {
  /** Fewer bats, for phones. */
  light: boolean;
  /** Called once the swarm has finished revealing. */
  onEnd: () => void;
}

export interface Swarm {
  start: () => void;
  stop: () => void;
  destroy: () => void;
}

/** Returns null when the canvas can't draw (no 2D context), so the caller can fall back to a fade. */
export function createSwarm(canvas: HTMLCanvasElement, opts: SwarmOptions): Swarm | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const mask = document.createElement("canvas");
  const mctx = mask.getContext("2d");
  const small = makeFrames(1, 0, true);
  const giantFrames = makeFrames(3, 4, false);
  const blob = makeBlob();

  let W = 0;
  let H = 0;
  let dpr = 1;
  let diag = 1;
  let bats: Bat[] = [];
  let raf = 0;
  let t0 = 0;
  let last = 0;
  let running = false;
  let ended = false;

  const paintDark = () => {
    ctx.fillStyle = DARK;
    ctx.fillRect(0, 0, W, H);
    const haze = ctx.createRadialGradient(W * 0.5, H * 0.36, 0, W * 0.5, H * 0.36, Math.max(W, H) * 0.62);
    haze.addColorStop(0, "rgba(199,204,214,0.055)");
    haze.addColorStop(1, "rgba(199,204,214,0)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, W, H);
  };

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    dpr = Math.min(1.5, window.devicePixelRatio || 1);
    diag = Math.hypot(W, H);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    mask.width = Math.max(1, Math.round(W / 2));
    mask.height = Math.max(1, Math.round(H / 2));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!running) paintDark();
  };

  const spawn = () => {
    // Floored so a phone's narrow side doesn't shrink the bats to specks.
    const unit = Math.max(0.6, Math.min(W, H) / 900);
    const base = Math.atan2(-H, W); // aimed at the top-right corner
    const count = opts.light ? 120 : 320;
    const out: Bat[] = [];

    for (let i = 0; i < count; i++) {
      const z = Math.random();
      const ang = base + (Math.random() - 0.5) * 1.15;
      const spd = diag * (0.6 + Math.random() * 0.6) * (0.85 + 0.35 * z);
      out.push({
        x: W * (-0.08 + Math.random() * 0.13),
        y: H * (0.95 + Math.random() * 0.13),
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        size: (12 + 50 * Math.pow(z, 1.5)) * unit,
        z,
        born: EMIT_FOR * Math.pow(Math.random(), 1.4),
        flapHz: 7 + Math.random() * 4,
        phase: Math.random(),
        seed: Math.random() * 100,
        giant: false,
      });
    }

    // Two or three huge, blurred bats skimming past the lens.
    const giants = opts.light ? 2 : 3;
    for (let i = 0; i < giants; i++) {
      const size = Math.min(W, H) * (0.35 + Math.random() * 0.25);
      const ang = base + (Math.random() - 0.5) * 0.4;
      out.push({
        x: -size * 0.6,
        y: H + size * 0.2 - Math.random() * H * 0.45,
        vx: Math.cos(ang) * diag * 1.8,
        vy: Math.sin(ang) * diag * 1.8,
        size,
        z: 2,
        born: 0.3 + i * 0.25 + Math.random() * 0.1,
        flapHz: 4 + Math.random(),
        phase: Math.random(),
        seed: Math.random() * 100,
        giant: true,
      });
    }

    out.sort((a, b) => a.z - b.z); // far first, so near bats draw over them
    return out;
  };

  const frame = (now: number) => {
    const t = (now - t0) / 1000;
    const dt = Math.min(1 / 30, (now - last) / 1000); // a hidden tab must not teleport the flock
    last = now;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    paintDark();

    // The front: everything behind it is gone, with a wide soft edge.
    ctx.globalCompositeOperation = "destination-out";
    const feather = diag * 0.28;
    const d = ease((t - FRONT_START) / FRONT_FOR) * (diag + feather);
    const ux = W / diag;
    const uy = -H / diag;
    if (d > 0) {
      const grad = ctx.createLinearGradient(ux * (d - feather), H + uy * (d - feather), ux * d, H + uy * d);
      grad.addColorStop(0, "rgba(0,0,0,1)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }
    // ...and the trails, so the edge looks carved by the bats, not wiped by a ruler.
    ctx.drawImage(mask, 0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";

    for (const b of bats) {
      if (t < b.born) continue;
      const wob = b.giant ? 0.08 : 0.35;
      b.vx += Math.sin(t * 5 + b.seed) * diag * wob * dt;
      b.vy += Math.cos(t * 4.2 + b.seed * 1.3) * diag * wob * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x > W + b.size || b.y < -b.size) continue;

      // Only bats inside the soft edge carve, so the edge goes ragged while the
      // dark ahead of the swarm stays dark — leaders are silhouettes, not holes.
      const s = b.x * ux + (b.y - H) * uy;
      if (!b.giant && mctx && s < d && s > d - feather * 1.2) {
        const R = b.size * 1.6;
        mctx.globalAlpha = 0.04 + b.z * 0.04;
        mctx.drawImage(blob, (b.x - R) / 2, (b.y - R) / 2, R, R);
      }

      const frames = b.giant ? giantFrames : small;
      const f = frames[Math.floor((t * b.flapHz + b.phase) * FRAMES) % FRAMES];
      const r = Math.atan2(b.vy, b.vx) + Math.PI / 2 + Math.sin(t * 6 + b.seed) * 0.25;
      const cos = Math.cos(r);
      const sin = Math.sin(r);
      const w = b.size;
      const h = (b.size * SPRITE_H) / SPRITE_W;
      ctx.globalAlpha = Math.min(1, (t - b.born) / 0.08) * (b.giant ? 0.95 : 0.92);
      ctx.setTransform(cos * dpr, sin * dpr, -sin * dpr, cos * dpr, b.x * dpr, b.y * dpr);
      ctx.drawImage(f, -w / 2, -h / 2, w, h);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;

    if (t >= END_AT && !ended) {
      ended = true;
      opts.onEnd();
    }
    if (running) raf = requestAnimationFrame(frame);
  };

  let ro: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(resize);
    ro.observe(canvas);
  } else {
    window.addEventListener("resize", resize);
  }
  resize();

  return {
    start() {
      if (running) return;
      running = true;
      bats = spawn();
      mctx?.clearRect(0, 0, mask.width, mask.height);
      t0 = last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
    },
    destroy() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      else window.removeEventListener("resize", resize);
    },
  };
}
