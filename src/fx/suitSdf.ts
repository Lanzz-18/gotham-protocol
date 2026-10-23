/**
 * Batman's body as a signed distance field — one function that says how far
 * any point is from the skin — then meshed with surface nets. Masses are
 * blended with smooth-min, so they flow into each other instead of reading as
 * separate balls and tubes.
 *
 * Shaped after Batman: The Animated Series model sheet — a barrel chest on a
 * narrow waist, square shoulders, a small head with a block jaw, long lean
 * legs on pointed feet — in big simple forms that take flat cel shading.
 * ~1.9 units tall, feet at y = 0, facing +z, the figure's left at +x.
 *
 * No imports, so the same code runs in the mesh worker and on the main thread.
 */

export type Vec3 = [number, number, number];
/** 3x3, row-major, world → local. */
type Mat3 = number[];

interface Prim {
  d: (x: number, y: number, z: number) => number;
  /** How softly it blends into what is already there. */
  k: number;
  /** Carves into the shape instead of adding to it. */
  sub: boolean;
  box: number[];
}

/** Fold one shape into the running distance `d`. */
function apply(d: number, p: Prim, x: number, y: number, z: number): number {
  const pd = p.d(x, y, z);
  return p.sub ? smax(d, -pd, p.k) : smin(d, pd, p.k);
}

interface Group {
  prims: Prim[];
  box: number[];
}

/* ---------------- vectors ---------------- */

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, scale(sub(b, a), t));
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: Vec3): Vec3 => scale(a, 1 / len(a));
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** A frame whose local y runs along `dir` — for masses that follow a limb. */
function alignY(dir: Vec3): Mat3 {
  const Y = norm(dir);
  let X = cross(Y, [0, 0, 1]);
  if (len(X) < 1e-6) X = cross(Y, [1, 0, 0]);
  X = norm(X);
  const Z = cross(X, Y);
  return [...X, ...Y, ...Z];
}
function rotZ(a: number): Mat3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, s, 0, -s, c, 0, 0, 0, 1];
}
function rotY(a: number): Mat3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, 0, -s, 0, 1, 0, s, 0, c];
}

/* ---------------- blending ---------------- */

function smin(a: number, b: number, k: number): number {
  // a skipped group is Infinity, and Infinity - Infinity would poison everything with NaN
  if (k <= 0 || a === Infinity || b === Infinity) return a < b ? a : b;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
const smax = (a: number, b: number, k: number) => -smin(-a, -b, k);

/* ---------------- primitives ---------------- */

/** A capsule that tapers from r1 at `a` to r2 at `b` (Inigo Quilez's round cone). */
function roundCone(a: Vec3, b: Vec3, r1: number, r2: number, k: number, carve = false): Prim {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  const l2 = bx * bx + by * by + bz * bz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const srr = Math.sign(rr);
  const r = Math.max(r1, r2);
  return {
    k,
    sub: carve,
    box: [
      Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.min(a[2], b[2]) - r,
      Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r, Math.max(a[2], b[2]) + r,
    ],
    d(x, y, z) {
      const px = x - a[0], py = y - a[1], pz = z - a[2];
      const yy = px * bx + py * by + pz * bz;
      const zz = yy - l2;
      const qx = px * l2 - bx * yy, qy = py * l2 - by * yy, qz = pz * l2 - bz * yy;
      const x2 = qx * qx + qy * qy + qz * qz;
      const y2 = yy * yy * l2;
      const z2 = zz * zz * l2;
      const kk = srr * rr * rr * x2;
      if (Math.sign(zz) * a2 * z2 > kk) return Math.sqrt(x2 + z2) * il2 - r2;
      if (Math.sign(yy) * a2 * y2 < kk) return Math.sqrt(x2 + y2) * il2 - r1;
      return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
    },
  };
}

function ellipsoid(c: Vec3, r: Vec3, m: Mat3 | null, k: number): Prim {
  const [rx, ry, rz] = r;
  const big = Math.max(rx, ry, rz);
  const small = Math.min(rx, ry, rz);
  return {
    k,
    sub: false,
    box: [c[0] - big, c[1] - big, c[2] - big, c[0] + big, c[1] + big, c[2] + big],
    d(x, y, z) {
      let qx = x - c[0], qy = y - c[1], qz = z - c[2];
      if (m) {
        const tx = qx, ty = qy;
        qx = m[0] * tx + m[1] * ty + m[2] * qz;
        qy = m[3] * tx + m[4] * ty + m[5] * qz;
        qz = m[6] * tx + m[7] * ty + m[8] * qz;
      }
      const ax = qx / rx, ay = qy / ry, az = qz / rz;
      const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
      const bx = ax / rx, by = ay / ry, bz = az / rz;
      const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
      return k1 < 1e-9 ? -small : (k0 * (k0 - 1)) / k1;
    },
  };
}

function roundBox(c: Vec3, half: Vec3, round: number, m: Mat3 | null, k: number): Prim {
  const big = len(half);
  const hx = half[0] - round, hy = half[1] - round, hz = half[2] - round;
  return {
    k,
    sub: false,
    box: [c[0] - big, c[1] - big, c[2] - big, c[0] + big, c[1] + big, c[2] + big],
    d(x, y, z) {
      let qx = x - c[0], qy = y - c[1], qz = z - c[2];
      if (m) {
        const tx = qx, ty = qy;
        qx = m[0] * tx + m[1] * ty + m[2] * qz;
        qy = m[3] * tx + m[4] * ty + m[5] * qz;
        qz = m[6] * tx + m[7] * ty + m[8] * qz;
      }
      const ox = Math.abs(qx) - hx, oy = Math.abs(qy) - hy, oz = Math.abs(qz) - hz;
      const mx = Math.max(ox, 0), my = Math.max(oy, 0), mz = Math.max(oz, 0);
      return Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(ox, oy, oz), 0) - round;
    },
  };
}

/** A flat band round the waist: an elliptic cylinder with softened edges. */
function band(c: Vec3, rx: number, rz: number, halfH: number, round: number, k: number): Prim {
  const ex = rx - round, ez = rz - round;
  return {
    k,
    sub: false,
    box: [c[0] - rx, c[1] - halfH, c[2] - rz, c[0] + rx, c[1] + halfH, c[2] + rz],
    d(x, y, z) {
      const qx = x - c[0], qz = z - c[2];
      const ax = qx / ex, az = qz / ez;
      const k0 = Math.sqrt(ax * ax + az * az);
      const k1 = Math.sqrt((ax / ex) ** 2 + (az / ez) ** 2);
      const d2 = k1 < 1e-9 ? -Math.min(ex, ez) : (k0 * (k0 - 1)) / k1;
      const wx = d2, wy = Math.abs(y - c[1]) - (halfH - round);
      return Math.min(Math.max(wx, wy), 0) + Math.hypot(Math.max(wx, 0), Math.max(wy, 0)) - round;
    },
  };
}

interface Section {
  y: number;
  /** Half-width, side to side. */
  a: number;
  /** How far the front and the back sit from the centre line (back is negative). */
  zf: number;
  zb: number;
}

/**
 * A body section lofted through elliptical cross-sections — the way a torso
 * is actually shaped, hips to ribcage to shoulders — instead of a stack of
 * blobs. Between sections the width and depths follow a smooth cubic, so the
 * silhouette has no kinks. `sample(y)` gives the cross-section at any height,
 * so muscles can be laid onto the surface rather than guessed at.
 */
function loft(secs: Section[]) {
  const n = secs.length;
  const ys = secs.map((s) => s.y);
  const ch = [secs.map((s) => s.a), secs.map((s) => s.zf), secs.map((s) => s.zb)];
  const tg = ch.map((v) =>
    v.map((_, i) => {
      const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
      return (v[i1] - v[i0]) / (ys[i1] - ys[i0]);
    }),
  );
  const out = [0, 0, 0];
  const sample = (y: number) => {
    const yc = y < ys[0] ? ys[0] : y > ys[n - 1] ? ys[n - 1] : y;
    let i = 0;
    while (i < n - 2 && yc > ys[i + 1]) i++;
    const h = ys[i + 1] - ys[i];
    const t = (yc - ys[i]) / h, t2 = t * t, t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
    for (let c = 0; c < 3; c++) {
      out[c] = h00 * ch[c][i] + h10 * h * tg[c][i] + h01 * ch[c][i + 1] + h11 * h * tg[c][i + 1];
    }
    return out;
  };
  // distance to the cross-section at this height, in the horizontal plane
  const slice = (x: number, y: number, z: number) => {
    const s = sample(y);
    const a = s[0], cz = (s[1] + s[2]) / 2, b = (s[1] - s[2]) / 2;
    const px = x / a, pz = (z - cz) / b;
    const k0 = Math.sqrt(px * px + pz * pz);
    const k1 = Math.sqrt((px / a) ** 2 + (pz / b) ** 2);
    return k1 < 1e-9 ? -Math.min(a, b) : (k0 * (k0 - 1)) / k1;
  };
  const y0 = ys[0], y1 = ys[n - 1];
  const pad = 0.02;
  const prim: Prim = {
    k: 0,
    sub: false,
    box: [-Math.max(...ch[0]) - pad, y0 - pad, Math.min(...ch[2]) - pad, Math.max(...ch[0]) + pad, y1 + pad, Math.max(...ch[1]) + pad],
    d(x, y, z) {
      const d0 = slice(x, y, z);
      // where the body flares or narrows with height, the nearest skin isn't
      // level with the point; scale by the slope so the distance isn't overstated
      const e = 0.002;
      const s = (slice(x, y + e, z) - d0) / e;
      const d = d0 / Math.sqrt(1 + s * s);
      const dy = y < y0 ? y0 - y : y > y1 ? y - y1 : 0;
      return dy > 0 ? (d > 0 ? Math.hypot(d, dy) : dy) : d;
    },
  };
  /** Width and front/back depth of the section at height y. */
  const at = (y: number): Vec3 => {
    const s = sample(y);
    return [s[0], s[1], s[2]];
  };
  /** The point on the front (side = 1) or back (side = -1) of the section at (x, y). */
  const surface = (x: number, y: number, side: 1 | -1): Vec3 => {
    const [a, zf, zb] = at(y);
    const cz = (zf + zb) / 2, b = (zf - zb) / 2;
    return [x, y, cz + side * b * Math.sqrt(Math.max(0, 1 - (x / a) ** 2))];
  };
  /** Outward surface normal at that point (horizontal part only, which is what matters for placing muscles). */
  const normal = (x: number, y: number, side: 1 | -1): Vec3 => {
    const [a, zf, zb] = at(y);
    const cz = (zf + zb) / 2, b = (zf - zb) / 2;
    const p = surface(x, y, side);
    return norm([x / (a * a), 0, (p[2] - cz) / (b * b)]);
  };
  return { prim, at, surface, normal };
}

/** A flat cut: unit outward normal, and where it sits along it. Inside is n·p ≤ offset. */
type Plane = [Vec3, number];
const plane = (n: Vec3, through: Vec3): Plane => {
  const u = norm(n);
  return [u, u[0] * through[0] + u[1] * through[1] + u[2] * through[2]];
};

/**
 * A block bounded by flat planes, for hard armoured forms like the cowl's jaw,
 * where a blend of round shapes reads as puffy cheeks. The planes meet in
 * edges softened by `bevel`; `box` must contain the block.
 */
function slab(planes: Plane[], box: number[], bevel: number, k: number): Prim {
  return {
    k,
    sub: false,
    box,
    d(x, y, z) {
      let d = -Infinity;
      for (const [n, o] of planes) {
        const v = n[0] * x + n[1] * y + n[2] * z - o;
        d = d === -Infinity ? v : smax(d, v, bevel);
      }
      return d;
    },
  };
}

function group(prims: Prim[]): Group {
  const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  let pad = 0;
  for (const p of prims) {
    if (p.sub) continue;
    for (let i = 0; i < 3; i++) {
      box[i] = Math.min(box[i], p.box[i]);
      box[i + 3] = Math.max(box[i + 3], p.box[i + 3]);
    }
    pad = Math.max(pad, p.k);
  }
  for (let i = 0; i < 3; i++) {
    box[i] -= pad;
    box[i + 3] += pad;
  }
  return { prims, box };
}

/* ---------------- the skeleton ---------------- */

export interface ArmJoints {
  side: 1 | -1;
  /** Shoulder, elbow, wrist, middle of the hand. */
  S: Vec3;
  E: Vec3;
  W: Vec3;
  F: Vec3;
  /** Forearm radius at the elbow and at the wrist. */
  rE: number;
  rW: number;
}

function armJoints(side: 1 | -1): ArmJoints {
  // The arms hang almost straight down, clear of the wide chest, the elbow a
  // touch out and the forearm angling back in toward the thigh.
  const S: Vec3 = [0.285 * side, 1.5, -0.012];
  const E: Vec3 = [0.325 * side, 1.2, -0.03];
  const W: Vec3 = [0.305 * side, 0.94, 0];
  const F = add(W, scale(norm(sub(W, E)), 0.06)); // middle of the fist
  return { side, S, E, W, F, rE: 0.06, rW: 0.045 };
}

export const ARMS = { L: armJoints(1), R: armJoints(-1) };

/** Where each cowl ear starts and the line it rises along; batFigure finishes the tip. */
export const EARS = ([1, -1] as const).map((s) => ({
  base: [0.054 * s, 1.835, -0.018] as Vec3,
  /** Where the sculpted part ends and the sharp tip takes over. */
  mid: [0.058 * s, 1.905, -0.02] as Vec3,
  tip: [0.063 * s, 1.975, -0.022] as Vec3,
  /** Ear thickness front-to-back, as a fraction of its width. */
  depth: 0.62,
  midR: 0.0135,
}));

/** Squash a shape front-to-back around z = `cz` (ears are flatter than they are wide). */
function squashZ(p: Prim, cz: number, f: number): Prim {
  return { ...p, d: (x, y, z) => p.d(x, y, cz + (z - cz) / f) * f };
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** The part of `v` square to `axis`, normalised. */
const across = (v: Vec3, axis: Vec3) => norm(sub(v, scale(axis, dot(v, axis))));

/* ---------------- the body ----------------
   Proportions measured off the animated series model sheet, scaled to a
   1.87 crown: a small head (chin 1.668), shoulders squared off at 1.6 and
   reaching 0.37 out, the chest at its widest and deepest at 1.48, a waist
   barely wider than the belt (1.12–1.22), trunks down to the crotch at 0.97,
   knee 0.585, ankle 0.1. */

/** The torso, crotch to the base of the neck, as real cross-sections. */
const TORSO = loft([
  { y: 0.955, a: 0.05, zf: 0.02, zb: -0.035 }, // rounded off between the legs
  { y: 0.975, a: 0.115, zf: 0.05, zb: -0.075 },
  { y: 1.02, a: 0.168, zf: 0.082, zb: -0.105 },
  { y: 1.08, a: 0.176, zf: 0.092, zb: -0.1 }, // hips, under the belt
  { y: 1.17, a: 0.172, zf: 0.1, zb: -0.088 }, // belt
  { y: 1.26, a: 0.182, zf: 0.114, zb: -0.094 }, // waist
  { y: 1.34, a: 0.21, zf: 0.134, zb: -0.115 },
  { y: 1.42, a: 0.245, zf: 0.152, zb: -0.138 },
  { y: 1.48, a: 0.258, zf: 0.16, zb: -0.15 }, // the barrel chest
  { y: 1.535, a: 0.252, zf: 0.15, zb: -0.155 },
  { y: 1.575, a: 0.225, zf: 0.118, zb: -0.142 }, // the flat top of the shoulders
  { y: 1.605, a: 0.145, zf: 0.078, zb: -0.112 },
  { y: 1.625, a: 0.082, zf: 0.05, zb: -0.075 }, // base of the neck
]);

function torso(): Group {
  const T = TORSO;
  const p: Prim[] = [T.prim];
  const onBack = (x: number, y: number, inset: number): Vec3 =>
    sub(T.surface(x, y, -1), scale(T.normal(x, y, -1), inset));

  for (const s of [1, -1] as const) {
    p.push(roundCone([0.035 * s, 1.645, -0.035], [0.27 * s, 1.575, -0.02], 0.05, 0.034, 0.04)); // traps, running out into the shoulder cap
    p.push(ellipsoid(onBack(0.11 * s, 1.49, 0.024), [0.075, 0.095, 0.03], null, 0.035)); // shoulder blades, a shallow valley between them
    p.push(ellipsoid([0.082 * s, 1.03, -0.066], [0.082, 0.075, 0.04], null, 0.045)); // glutes
  }
  p.push(ellipsoid([0, 1.62, -0.07], [0.08, 0.045, 0.035], null, 0.04)); // the back of the neck
  // chest: one broad, rounded plate across both pecs, its lower edge a soft shelf
  p.push(ellipsoid(sub(T.surface(0, 1.468, 1), [0, 0, 0.035]), [0.215, 0.085, 0.05], null, 0.05));

  // belt: a tall band with a square buckle; the suit shader draws the pouches on it
  const [ba, bzf, bzb] = T.at(1.17);
  const bcz = (bzf + bzb) / 2, brx = ba + 0.008, brz = (bzf - bzb) / 2 + 0.008;
  p.push(band([0, 1.17, bcz], brx, brz, 0.05, 0.008, 0.006));
  p.push(roundBox([0, 1.17, bcz + brz + 0.004], [0.044, 0.04, 0.01], 0.006, null, 0.003));
  return group(p);
}

/**
 * The cowl over a small round cranium, covering the whole face: below the eyes
 * a real jaw, not a block. The front narrows from the cheekbones to the mouth,
 * the jaw turns a clear angle under each ear and runs down to a squared chin
 * that juts forward, and the cowl's nose stands out with a ridge and a tip.
 */
function head(): Group {
  const jaw = slab(
    [
      plane([0, 0.12, 1], [0, 1.71, 0.088]), // the front, over the mouth, leaning so the chin juts
      plane([0.55, 0, 0.835], [0.042, 0, 0.088]), // cheeks, angled back to the jaw
      plane([-0.55, 0, 0.835], [-0.042, 0, 0.088]),
      plane([0.96, 0.28, 0], [0.067, 1.7, 0]), // sides, leaning in to meet the cranium
      plane([-0.96, 0.28, 0], [-0.067, 1.7, 0]),
      plane([0.72, -0.694, 0], [0.067, 1.697, 0]), // the jawline, from under the ear down to the chin
      plane([-0.72, -0.694, 0], [-0.067, 1.697, 0]),
      plane([0, -1, 0], [0, 1.668, 0]), // flat under the chin
      plane([0, -0.55, -0.835], [0, 1.668, 0.03]), // under the jaw, rising back to the neck
      plane([0, 0, -1], [0, 0, -0.02]),
      plane([0, 1, 0], [0, 1.775, 0]),
    ],
    [-0.075, 1.66, -0.03, 0.075, 1.78, 0.1],
    0.005,
    0.014,
  );
  const p: Prim[] = [
    roundCone([0, 1.585, -0.022], [0, 1.72, -0.02], 0.07, 0.062, 0), // a thick neck
    ellipsoid([0, 1.618, -0.022], [0.125, 0.032, 0.105], null, 0.04), // the cowl spreading onto the shoulders
    ellipsoid([0, 1.785, -0.012], [0.08, 0.092, 0.094], null, 0.035), // cranium
    jaw,
    ellipsoid([0, 1.677, 0.086], [0.026, 0.013, 0.01], null, 0.008), // the point of the chin
    // the nose: a wedge running down from the brow, standing out at the tip
    ellipsoid([0, 1.784, 0.09], [0.012, 0.032, 0.014], alignY([0, -0.94, 0.33]), 0.014),
  ];
  for (const e of EARS) {
    // ear: wide at the cowl, tapering up; flatter front-to-back than side-to-side
    p.push(squashZ(roundCone(e.base, e.mid, 0.028, e.midR, 0.03), e.base[2], e.depth));
  }
  for (const s of [1, -1] as const) {
    // shallow eye sockets, for the slits to sit in
    p.push({ ...ellipsoid([0.032 * s, 1.803, 0.092], [0.02, 0.009, 0.014], rotZ(0.35 * s), 0.006), sub: true });
  }
  return group(p);
}

/** A big gloved fist, knuckles forward, thumb wrapped over the front. */
function fist(j: ArmJoints): Prim[] {
  const a = norm(sub(j.W, j.E)); // down the hand
  const n = across([-j.side, 0, 0], a); // out of the palm, in toward the thigh
  const w = cross(a, n); // across the knuckles
  const front = w[2] > 0 ? 1 : -1;
  const fr: Mat3 = [...w, ...a, ...n];
  const at = (u: number, v: number, t: number): Vec3 => add(j.W, add(scale(w, u), add(scale(a, v), scale(n, t))));
  return [
    roundBox(at(0, 0.052, 0), [0.05, 0.056, 0.036], 0.026, fr, 0.014), // palm and curled fingers in one block
    roundCone(at(0.044 * front, 0.028, 0.018), at(0.036 * front, 0.07, 0.03), 0.017, 0.015, 0.008), // thumb
  ];
}

function arm(j: ArmJoints): { upper: Group; fore: Group } {
  const { side: s, S, E, W } = j;
  const u1 = sub(E, S);
  const u2 = sub(W, E);
  const a1 = norm(u1);
  const a2 = norm(u2);
  const up = across([s, 1, 0], a1); // off the top-outside of the upper arm
  const fwd1 = across([0, 0, 1], a1); // the front of the upper arm
  const out1 = across([s, 0, 0], a1); // its outside
  const fwd2 = across([0, 0, 1], a2);
  const out2 = across([s, 0, 0], a2);
  /** A point `t` of the way down the bone, `f` forward and `o` outward of it. */
  const on1 = (t: number, f: number, o: number): Vec3 => add(lerp(S, E, t), add(scale(fwd1, f), scale(out1, o)));
  const on2 = (t: number, f: number, o: number): Vec3 => add(lerp(E, W, t), add(scale(fwd2, f), scale(out2, o)));
  const upper = group([
    roundCone(S, E, 0.056, 0.044, 0),
    // the shoulder cap in three heads, front, side and rear, ending in a V down the outside of the arm
    ellipsoid(add(on1(0.04, 0, 0.012), scale(up, 0.01)), [0.074, 0.115, 0.076], alignY(u1), 0.03),
    ellipsoid(on1(0.2, 0.036, 0.004), [0.04, 0.09, 0.036], alignY(u1), 0.02),
    ellipsoid(on1(0.2, -0.038, 0.004), [0.042, 0.09, 0.036], alignY(u1), 0.02),
    ellipsoid(on1(0.58, 0.03, 0), [0.046, 0.088, 0.044], alignY(u1), 0.012), // bicep, peaked
    ellipsoid(on1(0.42, -0.03, 0.006), [0.05, 0.11, 0.044], alignY(u1), 0.014), // tricep
    ellipsoid(on1(0.7, 0.004, 0.03), [0.03, 0.065, 0.028], alignY(u1), 0.014), // between the two, outside, above the elbow
  ]);
  const fore = group([
    roundCone(E, W, 0.046, 0.036, 0),
    ellipsoid(on2(0.04, -0.03, 0), [0.03, 0.03, 0.028], null, 0.014), // the point of the elbow
    ellipsoid(on2(0.26, 0.016, 0.02), [0.05, 0.12, 0.044], alignY(u2), 0.018), // the big muscle along the top, thick below the elbow
    ellipsoid(on2(0.3, -0.008, -0.022), [0.046, 0.12, 0.044], alignY(u2), 0.018), // underneath
    roundCone(lerp(E, W, 0.1), lerp(E, W, 0.16), 0.064, 0.062, 0.008), // the glove's cuff
    ...fist(j),
  ]);
  return { upper, fore };
}

function leg(s: 1 | -1): Group {
  // feet planted apart, the legs running a little outward from the hip
  const H: Vec3 = [0.095 * s, 0.99, 0];
  const K: Vec3 = [0.115 * s, 0.585, -0.004];
  const A: Vec3 = [0.135 * s, 0.1, -0.025];
  const up = alignY(sub(K, H));
  const low = alignY(sub(A, K));
  const axis = norm(sub(K, H));
  const fr = across([0, 0, 1], axis); // the front of the thigh
  const ou = across([s, 0, 0], axis); // its outside
  /** A point `t` of the way down the thigh, `f` forward and `o` outward of the bone. */
  const at = (t: number, f: number, o: number): Vec3 => add(lerp(H, K, t), add(scale(fr, f), scale(ou, o)));

  return group([
    // the thigh as one round, full mass, swelling below the hip and tapering into
    // the knee; the muscles on it are broad and soft so it shades as one form
    roundCone(H, lerp(H, K, 0.35), 0.086, 0.092, 0),
    roundCone(lerp(H, K, 0.35), K, 0.092, 0.048, 0.04),
    ellipsoid(at(0.42, 0.024, 0.014), [0.075, 0.22, 0.07], up, 0.05), // quads, rounding out the front and outside
    ellipsoid(at(0.4, -0.03, 0), [0.07, 0.2, 0.06], up, 0.05), // hamstrings
    ellipsoid(at(0.78, 0.022, -0.026), [0.042, 0.09, 0.04], up, 0.04), // the teardrop above the knee
    roundCone(K, A, 0.05, 0.036, 0.02), // shin
    ellipsoid(add(lerp(K, A, 0.26), [0.016 * s, 0, -0.038]), [0.048, 0.12, 0.05], low, 0.045), // calf, outer head
    ellipsoid(add(lerp(K, A, 0.24), [-0.016 * s, 0, -0.04]), [0.052, 0.125, 0.054], low, 0.045), // calf, inner head
    // the boot's foot, flat on the ground: round at the heel, a rounded toe, a flat sole
    roundCone([A[0], 0.05, -0.055], [A[0] + 0.014 * s, 0.032, 0.14], 0.05, 0.032, 0.02),
    roundBox([A[0] + 0.007 * s, 0.012, 0.042], [0.05, 0.012, 0.118], 0.008, rotY(-0.06 * s), 0.024),
  ]);
}

const T = torso();
const HD = head();
const AL = arm(ARMS.L);
const AR = arm(ARMS.R);
const LL = leg(1);
const LR = leg(-1);

/** Group order, matching the part ids below. */
const GROUPS = [T, HD, LL, LR, AL.upper, AL.fore, AR.upper, AR.fore];

/** A body part, by id — what each vertex belongs to, for picking. */
export const PART_NAMES = ["torso", "head", "legs", "armL-upper", "armL-fore", "armR-upper", "armR-fore"] as const;
export type MeshPart = (typeof PART_NAMES)[number];
const GROUP_PART = [0, 1, 2, 2, 3, 4, 5, 6];

/** Beyond this distance a group is skipped and its bounding box stands in for it. */
const CULL = 0.09;

function evalGroup(g: Group, x: number, y: number, z: number): number {
  const b = g.box;
  const dx = Math.max(b[0] - x, 0, x - b[3]);
  const dy = Math.max(b[1] - y, 0, y - b[4]);
  const dz = Math.max(b[2] - z, 0, z - b[5]);
  const far = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (far > CULL) return far;
  let d = Infinity;
  for (const p of g.prims) {
    if (d !== Infinity) {
      // A shape can only change the result if it reaches within its blend
      // radius of the surface so far; its box distance is a lower bound.
      const pb = p.box;
      const ex = Math.max(pb[0] - x, 0, x - pb[3]);
      const ey = Math.max(pb[1] - y, 0, y - pb[4]);
      const ez = Math.max(pb[2] - z, 0, z - pb[5]);
      const bd = Math.sqrt(ex * ex + ey * ey + ez * ez);
      if (p.sub ? bd >= p.k - d : bd >= d + p.k) continue;
    }
    d = apply(d, p, x, y, z);
  }
  return d;
}

/** How the groups join, at height y: torso, head, legs L/R, left arm upper/fore, right arm upper/fore. */
function combine(y: number, t: number, h: number, ll: number, lr: number, alu: number, alf: number, aru: number, arf: number) {
  let d = smin(t, h, 0.04);
  // Over the top of the shoulder the arm melts into the torso in one line;
  // from the armpit down it stays clear of the chest instead of webbing to it.
  const sh = Math.min(1, Math.max(0, (y - 1.46) / 0.08));
  const ka = 0.022 + 0.026 * sh * sh * (3 - 2 * sh);
  d = smin(d, smin(alu, alf, 0.012), ka);
  d = smin(d, smin(aru, arf, 0.012), ka);
  // The legs meet each other with a hard crease, never a web — a soft blend
  // there melted the thighs into one lump. They join the hips more firmly too.
  return smin(d, Math.min(ll, lr), 0.022);
}
/** The widest blend between groups — anything further than this can't touch the join. */
const JOIN_K = 0.048;

/** Distance to the whole figure. Fills `gd` with each group's own distance when given. */
export function sdf(x: number, y: number, z: number, gd?: Float64Array): number {
  const t = evalGroup(T, x, y, z);
  const h = evalGroup(HD, x, y, z);
  const ll = evalGroup(LL, x, y, z);
  const lr = evalGroup(LR, x, y, z);
  const alu = evalGroup(AL.upper, x, y, z);
  const alf = evalGroup(AL.fore, x, y, z);
  const aru = evalGroup(AR.upper, x, y, z);
  const arf = evalGroup(AR.fore, x, y, z);
  if (gd) {
    gd[0] = t; gd[1] = h; gd[2] = ll; gd[3] = lr; gd[4] = alu; gd[5] = alf; gd[6] = aru; gd[7] = arf;
  }
  return combine(y, t, h, ll, lr, alu, alf, aru, arf);
}

const boxGap = (a: number[], b: number[]) =>
  Math.hypot(
    Math.max(a[0] - b[3], b[0] - a[3], 0),
    Math.max(a[1] - b[4], b[1] - a[4], 0),
    Math.max(a[2] - b[5], b[2] - a[5], 0),
  );

/**
 * The same field, specialised to one box of space: every shape that can't
 * reach within its blend radius of the box is dropped up front. A dropped
 * shape only ever measured further away than what it would have blended with,
 * so the surface inside the box comes out exactly the same.
 */
function localField(cell: number[]) {
  const lists = GROUPS.map((g) => {
    if (boxGap(cell, g.box) > JOIN_K + 0.012) return [];
    return g.prims.filter((p) => boxGap(cell, p.box) < Math.max(p.k, JOIN_K) + 0.012);
  });
  const run = (list: Prim[], x: number, y: number, z: number) => {
    let d = Infinity;
    for (const p of list) d = apply(d, p, x, y, z);
    return d;
  };
  return (x: number, y: number, z: number) =>
    combine(
      y,
      run(lists[0], x, y, z), run(lists[1], x, y, z), run(lists[2], x, y, z), run(lists[3], x, y, z),
      run(lists[4], x, y, z), run(lists[5], x, y, z), run(lists[6], x, y, z), run(lists[7], x, y, z),
    );
}

/** Surface normal (the distance field's gradient), by central differences. */
export function normalAt(x: number, y: number, z: number, e = 0.0015): Vec3 {
  return norm([
    sdf(x + e, y, z) - sdf(x - e, y, z),
    sdf(x, y + e, z) - sdf(x, y - e, z),
    sdf(x, y, z + e) - sdf(x, y, z - e),
  ]);
}

/** Walk from `o` along `dir` until the skin is hit. */
export function traceSurface(o: Vec3, dir: Vec3, maxT = 1.5): Vec3 | null {
  const d = norm(dir);
  let t = 0;
  for (let i = 0; i < 200 && t < maxT; i++) {
    const p = add(o, scale(d, t));
    const dist = sdf(p[0], p[1], p[2]);
    if (dist < 1e-5) return p;
    t += dist;
  }
  return null;
}

/* ---------------- the cape ---------------- */

export interface CapeMesh {
  positions: Float32Array;
  indices: Uint32Array;
  /**
   * Where each point sits on the cloth, two per point: across it (0 at one
   * edge, 1 at the other) and down it (0 where it's pinned at the top, 1 at the
   * hem). The cape's motion grows with the second.
   */
  drape: Float32Array;
}

/** Columns across the cape (six scallops of eight) and rows down it. */
const CAPE_U = 48;
const CAPE_V = 64;
/** How far the cloth keeps off the body. */
const CAPE_CLEAR = 0.012;
/**
 * How the rows bunch toward the top: dense where the cloth wraps the
 * shoulders, so it can't dip into them between rows, sparse down the hang.
 */
const CAPE_BUNCH = 2;

/** A smooth curve through (y, value) keys, y ascending — the same cubic the torso loft uses. */
function keyed(ys: number[], vs: number[]) {
  const n = ys.length;
  const tg = vs.map((_, i) => {
    const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
    return (vs[i1] - vs[i0]) / (ys[i1] - ys[i0]);
  });
  return (y: number) => {
    const yc = Math.min(ys[n - 1], Math.max(ys[0], y));
    let i = 0;
    while (i < n - 2 && yc > ys[i + 1]) i++;
    const h = ys[i + 1] - ys[i];
    const t = (yc - ys[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * vs[i] + (t3 - 2 * t2 + t) * h * tg[i] + (-2 * t3 + 3 * t2) * vs[i + 1] + (t3 - t2) * h * tg[i + 1];
  };
}

// The cape's cross-section at each height, seen from above: an arc round him
// from one front edge, behind him, to the other. At angle φ along it (0 behind
// him, ±φm at the front edges) a point sits at x = SX·sin φ, z = ZC − RZ·cos φ.
// From the top: a collar round the base of the neck, then a mantle over both
// shoulder caps opening at the front, then round the outside of the arms to
// hang behind them — wide enough to frame them from the front, far enough back
// to clear the forearm fins — flaring out toward the hem.
const CAPE_Y = [0.27, 0.6, 0.9, 1.2, 1.38, 1.5, 1.6, 1.635];
const CAPE_SX = keyed(CAPE_Y, [0.488, 0.457, 0.437, 0.426, 0.426, 0.4, 0.27, 0.1]);
const CAPE_ZC = keyed(CAPE_Y, [-0.07, -0.144, -0.182, -0.184, -0.132, -0.02, -0.02, -0.02]);
const CAPE_RZ = keyed(CAPE_Y, [0.17, 0.091, 0.048, 0.036, 0.068, 0.15, 0.13, 0.1]);
const CAPE_PHI = keyed(CAPE_Y, [80, 80, 80, 80, 100, 125, 135, 140].map((d) => (d * Math.PI) / 180));
/** Where the cape is fastened round the neck, under the cowl's collar. */
const CAPE_TOP = 1.635;

/** Nudge a point out of the body until it's `CAPE_CLEAR` off the skin. */
function clearOfBody(p: Vec3): Vec3 {
  for (let i = 0; i < 4; i++) {
    const d = sdf(p[0], p[1], p[2]);
    if (d >= CAPE_CLEAR) break;
    p = add(p, scale(normalAt(p[0], p[1], p[2]), CAPE_CLEAR - d));
  }
  return p;
}

/**
 * The cape as a sheet of cloth, fastened round the neck under the cowl: a
 * mantle over both shoulders that opens at the front, wrapping round the
 * outside of the arms and hanging behind them to a hem cut into six points.
 * Wherever that shape would pass through the body the cloth is pushed back
 * out, then smoothed, so it drapes over the shoulders instead of cutting in.
 */
export function drapeCape(): CapeMesh {
  const cols = CAPE_U + 1;
  const pts: Vec3[] = [];
  for (let j = 0; j <= CAPE_V; j++) {
    const v = j / CAPE_V;
    for (let i = 0; i <= CAPE_U; i++) {
      const u = (i / CAPE_U) * 2 - 1;
      // hem: six points, each scallop rising to a notch between them
      const s = (3 * (u + 1)) % 1;
      const yh = 0.27 + 0.07 * (1 - Math.abs(2 * s - 1));
      const y = CAPE_TOP + (yh - CAPE_TOP) * Math.pow(v, CAPE_BUNCH);
      // this column's place on the cross-section at this height; wherever that
      // lands inside him (over the shoulders, round the arms) it's pushed out
      const ph = u * CAPE_PHI(y);
      pts.push(clearOfBody([CAPE_SX(y) * Math.sin(ph), y, CAPE_ZC(y) - CAPE_RZ(y) * Math.cos(ph)]));
    }
  }

  // smooth the cloth, keeping the hem's points, then push it clear of the body again
  for (let pass = 0; pass < 3; pass++) {
    const prev = pts.map((p): Vec3 => [p[0], p[1], p[2]]);
    for (let j = 1; j < CAPE_V; j++) {
      for (let i = 0; i <= CAPE_U; i++) {
        const k = j * cols + i;
        const nb = [prev[k - cols], prev[k + cols]];
        if (i > 0) nb.push(prev[k - 1]);
        if (i < CAPE_U) nb.push(prev[k + 1]);
        const avg = scale(nb.reduce((a, q) => add(a, q), [0, 0, 0] as Vec3), 1 / nb.length);
        pts[k] = clearOfBody(lerp(prev[k], avg, 0.5));
      }
    }
  }

  const positions = new Float32Array(pts.length * 3);
  pts.forEach((p, k) => positions.set(p, k * 3));
  const drape = new Float32Array(pts.length * 2);
  for (let j = 0; j <= CAPE_V; j++) {
    for (let i = 0; i <= CAPE_U; i++) drape.set([i / CAPE_U, Math.pow(j / CAPE_V, CAPE_BUNCH)], (j * cols + i) * 2);
  }
  // winding gives each face a normal pointing away from the body
  const indices = new Uint32Array(CAPE_U * CAPE_V * 6);
  let n = 0;
  for (let j = 0; j < CAPE_V; j++) {
    for (let i = 0; i < CAPE_U; i++) {
      const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
      indices.set([a, b, c, b, d, c], n);
      n += 6;
    }
  }
  return { positions, indices, drape };
}

/* ---------------- meshing ---------------- */

export interface SuitMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  /** Part id per vertex (index into PART_NAMES). */
  parts: Uint8Array;
  /** Ambient occlusion per vertex, 0 (fully shut in) to 1 (open). */
  ao: Float32Array;
  cape: CapeMesh;
  /** How long meshing took, in ms. */
  ms: number;
}

const BOUNDS = { x0: -0.74, x1: 0.74, y0: -0.035, y1: 1.94, z0: -0.21, z1: 0.23 };

/** Occlusion probe: steps out along the normal, and how hard a shortfall darkens. */
const AO_STEP = 0.007;
const AO_GAIN = 13;
const AO_FLOOR = 0.6;

/**
 * Sample the field on a grid and stitch a surface with naive surface nets:
 * one vertex per cell the skin passes through, one quad per grid edge it
 * crosses. Only cells near the skin are sampled finely — a coarse pass finds
 * the shell first — which is what keeps this well under a second. Each vertex
 * also gets an ambient-occlusion value, read off the same grid.
 */
export function meshSuit(h = 0.0065): SuitMesh {
  const start = typeof performance !== "undefined" ? performance.now() : Date.now();
  const { x0, y0, z0 } = BOUNDS;
  const nx = Math.ceil((BOUNDS.x1 - x0) / h) + 1;
  const ny = Math.ceil((BOUNDS.y1 - y0) / h) + 1;
  const nz = Math.ceil((BOUNDS.z1 - z0) / h) + 1;
  const sxy = nx * ny;
  const values = new Float32Array(nx * ny * nz);
  const done = new Uint8Array(nx * ny * nz);

  // coarse pass
  const C = 4;
  const cnx = Math.ceil((nx - 1) / C) + 1, cny = Math.ceil((ny - 1) / C) + 1, cnz = Math.ceil((nz - 1) / C) + 1;
  const coarse = new Float32Array(cnx * cny * cnz);
  for (let k = 0; k < cnz; k++) {
    for (let j = 0; j < cny; j++) {
      for (let i = 0; i < cnx; i++) {
        coarse[i + cnx * (j + cny * k)] = sdf(x0 + i * C * h, y0 + j * C * h, z0 + k * C * h);
      }
    }
  }
  // A coarse cell can only hold skin if a corner is within its diagonal of it.
  const bandW = C * h * Math.sqrt(3) * 1.15;
  const cval = (i: number, j: number, k: number) =>
    coarse[Math.min(i, cnx - 1) + cnx * (Math.min(j, cny - 1) + cny * Math.min(k, cnz - 1))];

  for (let ck = 0; ck < cnz - 1; ck++) {
    for (let cj = 0; cj < cny - 1; cj++) {
      for (let ci = 0; ci < cnx - 1; ci++) {
        let near = false;
        for (let c = 0; c < 8 && !near; c++) {
          if (Math.abs(cval(ci + (c & 1), cj + ((c >> 1) & 1), ck + ((c >> 2) & 1))) < bandW) near = true;
        }
        if (!near) continue;
        const iEnd = Math.min((ci + 1) * C, nx - 1), jEnd = Math.min((cj + 1) * C, ny - 1), kEnd = Math.min((ck + 1) * C, nz - 1);
        const field = localField([
          x0 + ci * C * h, y0 + cj * C * h, z0 + ck * C * h, x0 + iEnd * h, y0 + jEnd * h, z0 + kEnd * h,
        ]);
        for (let k = ck * C; k <= kEnd; k++) {
          for (let j = cj * C; j <= jEnd; j++) {
            for (let i = ci * C; i <= iEnd; i++) {
              const idx = i + nx * j + sxy * k;
              if (done[idx]) continue;
              values[idx] = field(x0 + i * h, y0 + j * h, z0 + k * h);
              done[idx] = 1;
            }
          }
        }
      }
    }
  }
  // Points far from the skin only need the right sign; take the nearest coarse sample's.
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const idx = i + nx * j + sxy * k;
        if (!done[idx]) values[idx] = cval(Math.round(i / C), Math.round(j / C), Math.round(k / C));
      }
    }
  }

  // one vertex per cell the surface passes through, with a normal from the
  // grid's own gradient, blended across the cell
  const cellVert = new Int32Array(nx * ny * nz).fill(-1);
  const pos: number[] = [];
  const nrm: number[] = [];
  const grad = (p: number, w: number, acc: number[]) => {
    acc[0] += (values[p + 1] - values[p - 1]) * w;
    acc[1] += (values[p + nx] - values[p - nx]) * w;
    acc[2] += (values[p + sxy] - values[p - sxy]) * w;
  };
  const g = [0, 0, 0];
  const offs = [0, 1, nx, nx + 1, sxy, sxy + 1, sxy + nx, sxy + nx + 1];
  const EDGES = [
    [0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const v = new Float64Array(8);
  for (let k = 1; k < nz - 2; k++) {
    for (let j = 1; j < ny - 2; j++) {
      for (let i = 1; i < nx - 2; i++) {
        const base = i + nx * j + sxy * k;
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          v[c] = values[base + offs[c]];
          if (v[c] < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (const [a, b] of EDGES) {
          if ((v[a] < 0) === (v[b] < 0)) continue;
          const t = v[a] / (v[a] - v[b]);
          sx += (a & 1) + ((b & 1) - (a & 1)) * t;
          sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
          sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
          n++;
        }
        const fx = sx / n, fy = sy / n, fz = sz / n;
        cellVert[base] = pos.length / 3;
        pos.push(x0 + (i + fx) * h, y0 + (j + fy) * h, z0 + (k + fz) * h);
        g[0] = g[1] = g[2] = 0;
        for (let c = 0; c < 8; c++) {
          const w = ((c & 1) ? fx : 1 - fx) * (((c >> 1) & 1) ? fy : 1 - fy) * (((c >> 2) & 1) ? fz : 1 - fz);
          grad(base + offs[c], w, g);
        }
        const gl = Math.hypot(g[0], g[1], g[2]) || 1;
        nrm.push(g[0] / gl, g[1] / gl, g[2] / gl);
      }
    }
  }

  // one quad per grid edge the surface crosses, joining the four cells round it
  const idx: number[] = [];
  const axisOff = [1, nx, sxy];
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const base = i + nx * j + sxy * k;
        const inside = values[base] < 0;
        for (let a = 0; a < 3; a++) {
          if (inside === values[base + axisOff[a]] < 0) continue;
          const du = axisOff[(a + 1) % 3], dv = axisOff[(a + 2) % 3];
          const c0 = cellVert[base], c1 = cellVert[base - du], c2 = cellVert[base - du - dv], c3 = cellVert[base - dv];
          if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) continue;
          if (inside) idx.push(c0, c1, c2, c0, c2, c3);
          else idx.push(c0, c3, c2, c0, c2, c1);
        }
      }
    }
  }

  // the field anywhere in the grid, blended from the eight samples round it
  const grid = (x: number, y: number, z: number) => {
    const gx = Math.min(nx - 1.001, Math.max(0, (x - x0) / h));
    const gy = Math.min(ny - 1.001, Math.max(0, (y - y0) / h));
    const gz = Math.min(nz - 1.001, Math.max(0, (z - z0) / h));
    const i = Math.floor(gx), j = Math.floor(gy), k = Math.floor(gz);
    const tx = gx - i, ty = gy - j, tz = gz - k;
    const b = i + nx * j + sxy * k;
    const c00 = values[b] + (values[b + 1] - values[b]) * tx;
    const c10 = values[b + nx] + (values[b + nx + 1] - values[b + nx]) * tx;
    const c01 = values[b + sxy] + (values[b + sxy + 1] - values[b + sxy]) * tx;
    const c11 = values[b + sxy + nx] + (values[b + sxy + nx + 1] - values[b + sxy + nx]) * tx;
    const c0 = c00 + (c10 - c00) * ty;
    return c0 + (c01 + (c11 - c01) * ty - c0) * tz;
  };

  // tag each vertex with its body part (the nearest group) and how shut in it is
  const count = pos.length / 3;
  const positions = Float32Array.from(pos);
  const normals = Float32Array.from(nrm);
  const parts = new Uint8Array(count);
  const ao = new Float32Array(count);
  const gd = new Float64Array(8);
  for (let vi = 0; vi < count; vi++) {
    const x = pos[vi * 3], y = pos[vi * 3 + 1], z = pos[vi * 3 + 2];
    sdf(x, y, z, gd);
    let best = 0;
    for (let g = 1; g < 8; g++) if (gd[g] < gd[best]) best = g;
    // the head ends at the jawline; the neck and cowl skirt below it read as body
    if (best === 1 && y < 1.615) best = 0;
    parts[vi] = GROUP_PART[best];

    // Step out along the normal: on open ground the skin is exactly that far
    // away, in a crease it's nearer. The shortfall darkens the vertex, which is
    // what lets each muscle read against its neighbours on a dark suit. Four
    // steps stay inside the finely sampled band round the skin.
    const ux = nrm[vi * 3], uy = nrm[vi * 3 + 1], uz = nrm[vi * 3 + 2];
    let occ = 0, w = 1;
    for (let st = 1; st <= 4; st++) {
      const dd = AO_STEP * st;
      occ += w * Math.max(0, dd - grid(x + ux * dd, y + uy * dd, z + uz * dd));
      w *= 0.75;
    }
    ao[vi] = Math.max(AO_FLOOR, 1 - AO_GAIN * occ);
  }

  const cape = drapeCape();
  const end = typeof performance !== "undefined" ? performance.now() : Date.now();
  return { positions, normals, indices: Uint32Array.from(idx), parts, ao, cape, ms: end - start };
}
