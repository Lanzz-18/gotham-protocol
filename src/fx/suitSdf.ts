/**
 * Batman's body as a signed distance field — one function that says how far
 * any point is from the skin — then meshed with surface nets. Masses are
 * blended with smooth-min, so muscles melt into each other the way a sculpt
 * does instead of reading as separate balls and tubes.
 *
 * Proportioned as an athletic 1.88 m man — the torso lofted through real
 * cross-sections, limbs at real lengths — wearing the Arkham suit: cowl,
 * gauntlets, belt, knee pads, shin guards, boots. ~1.9 units tall, feet at
 * y = 0, facing +z, the figure's left at +x.
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
  /**
   * A dent instead of a shape: how far to press the surface in at this point
   * (0 outside `box`). Used for the gentle grooves between muscles, where a
   * carved shape — however softly blended — digs far deeper than intended.
   */
  dent?: (x: number, y: number, z: number) => number;
}

/** Fold one shape into the running distance `d`. */
function apply(d: number, p: Prim, x: number, y: number, z: number): number {
  if (p.dent) return d === Infinity ? d : d + p.dent(x, y, z);
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

/** A frame whose local z points along `zAxis` and whose local y leans toward `up`. */
function frame(zAxis: Vec3, up: Vec3): Mat3 {
  const Z = norm(zAxis);
  const X = norm(cross(up, Z));
  const Y = cross(Z, X);
  return [...X, ...Y, ...Z];
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
    if (p.sub || p.dent) continue;
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
  const S: Vec3 = [0.198 * side, 1.49, -0.015];
  const u1 = norm([Math.sin(0.6) * side, -Math.cos(0.6), -0.03]); // upper arm ~34° out: the reference's A-pose
  const E = add(S, scale(u1, 0.32));
  const u2 = norm([Math.sin(0.5) * side, -Math.cos(0.5), 0.15]); // forearm a touch lower and forward
  const W = add(E, scale(u2, 0.27));
  const F = add(W, scale(u2, 0.08)); // middle of the hand
  return { side, S, E, W, F, rE: 0.068, rW: 0.048 };
}

export const ARMS = { L: armJoints(1), R: armJoints(-1) };

/** Where each cowl ear starts and the line it rises along; batFigure finishes the tip. */
export const EARS = ([1, -1] as const).map((s) => ({
  base: [0.05 * s, 1.79, -0.016] as Vec3,
  /** Where the sculpted part ends and the sharp tip takes over. */
  mid: [0.057 * s, 1.9, -0.022] as Vec3,
  tip: [0.063 * s, 1.99, -0.027] as Vec3,
  /** Ear thickness front-to-back, as a fraction of its width. */
  depth: 0.62,
  midR: 0.0155,
}));

/** Squash a shape front-to-back around z = `cz` (ears are flatter than they are wide). */
function squashZ(p: Prim, cz: number, f: number): Prim {
  return { ...p, d: (x, y, z) => p.d(x, y, cz + (z - cz) / f) * f };
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** The part of `v` square to `axis`, normalised. */
const across = (v: Vec3, axis: Vec3) => norm(sub(v, scale(axis, dot(v, axis))));

type Field = (x: number, y: number, z: number) => number;

/** A list of shapes combined the way a group combines them — for measuring a body part while it's built. */
function unionOf(prims: Prim[]): Field {
  return (x, y, z) => {
    let d = Infinity;
    for (const q of prims) d = apply(d, q, x, y, z);
    return d;
  };
}

/** How far forward (side = 1) or back (side = -1) the skin sits at (x, y). */
function skinZ(f: Field, x: number, y: number, side: 1 | -1): number {
  let z = 0.4 * side;
  for (let i = 0; i < 300; i++) {
    const d = f(x, y, z);
    if (d < 1e-5) break;
    z -= d * side;
  }
  return z;
}

/**
 * A soft valley pressed along a line on the skin: exactly `amp` deep on the
 * line, easing out to nothing `w` either side, with no hard edge anywhere.
 */
function dentAlong(pts: Vec3[], w: number, amp: number): Prim {
  const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const q of pts) {
    for (let i = 0; i < 3; i++) {
      box[i] = Math.min(box[i], q[i] - w);
      box[i + 3] = Math.max(box[i + 3], q[i] + w);
    }
  }
  const segs = pts.slice(1).map((b, i) => {
    const a = pts[i], ab = sub(b, a);
    return { a, ab, l2: dot(ab, ab) || 1e-12 };
  });
  return {
    k: 0,
    sub: false,
    box,
    d: () => Infinity,
    dent(x, y, z) {
      let best = Infinity;
      for (const { a, ab, l2 } of segs) {
        const px = x - a[0], py = y - a[1], pz = z - a[2];
        const t = Math.min(1, Math.max(0, (px * ab[0] + py * ab[1] + pz * ab[2]) / l2));
        const qx = px - ab[0] * t, qy = py - ab[1] * t, qz = pz - ab[2] * t;
        best = Math.min(best, qx * qx + qy * qy + qz * qz);
      }
      const s = Math.sqrt(best) / w;
      return s >= 1 ? 0 : amp * (1 - s * s * (3 - 2 * s));
    },
  };
}

/**
 * The line where one muscle meets the next, drawn on the front (side = 1) or
 * back (side = -1) of the body. Points are (x, y); the line follows the skin.
 */
function groove(f: Field, pts: Array<[number, number]>, side: 1 | -1, w: number, amp: number): Prim {
  return dentAlong(pts.map(([x, y]): Vec3 => [x, y, skinZ(f, x, y, side)]), w, amp);
}

/** Where a ray from `from` along `dir` first meets the skin of `f`. */
function skinHit(f: Field, from: Vec3, dir: Vec3): Vec3 {
  const u = norm(dir);
  let t = 0;
  for (let i = 0; i < 300; i++) {
    const p = add(from, scale(u, t));
    const d = f(p[0], p[1], p[2]);
    if (d < 1e-5) return p;
    t += d;
  }
  return add(from, scale(u, t));
}

/** The same on a rounded limb: each point is a spot outside the skin and the direction in toward the bone. */
function grooveOn(f: Field, pts: Array<[Vec3, Vec3]>, w: number, amp: number): Prim {
  return dentAlong(pts.map(([from, inward]) => skinHit(f, from, inward)), w, amp);
}

/* ---------------- the body ----------------
   Built to a heavily trained 1.88 m man — broad chest and lats over a
   narrower waist, full shoulders, thick arms and legs — with the Arkham
   suit's knee pads, shin guards, gauntlets and belt over the top.
   Landmarks (y): crown 1.87, chin 1.615, collarbone 1.55, shoulder joint
   1.49, lower pec line 1.352, navel 1.13, belt 1.07, hip joint 0.94,
   crotch 0.87, knee 0.5, ankle 0.09. */

/** The torso, hips to the base of the neck, as real cross-sections. */
const TORSO = loft([
  { y: 0.84, a: 0.055, zf: 0.018, zb: -0.035 }, // rounded off between the legs
  { y: 0.86, a: 0.1, zf: 0.035, zb: -0.06 },
  { y: 0.91, a: 0.16, zf: 0.076, zb: -0.112 },
  { y: 0.965, a: 0.178, zf: 0.092, zb: -0.134 }, // hips, widest at the hip bones
  { y: 1.025, a: 0.174, zf: 0.101, zb: -0.124 },
  { y: 1.075, a: 0.166, zf: 0.107, zb: -0.108 }, // belt
  { y: 1.135, a: 0.157, zf: 0.11, zb: -0.1 }, // waist
  { y: 1.205, a: 0.165, zf: 0.115, zb: -0.105 },
  { y: 1.275, a: 0.184, zf: 0.123, zb: -0.115 }, // lower ribs
  { y: 1.345, a: 0.202, zf: 0.133, zb: -0.124 },
  { y: 1.415, a: 0.208, zf: 0.139, zb: -0.13 }, // chest
  { y: 1.475, a: 0.198, zf: 0.131, zb: -0.127 }, // armpits
  { y: 1.525, a: 0.168, zf: 0.101, zb: -0.11 },
  { y: 1.56, a: 0.1, zf: 0.068, zb: -0.088 }, // base of the neck
  { y: 1.585, a: 0.07, zf: 0.052, zb: -0.072 },
]);

function torso(): Group {
  const T = TORSO;
  const p: Prim[] = [T.prim];
  const onFront = (x: number, y: number, inset: number): Vec3 =>
    sub(T.surface(x, y, 1), scale(T.normal(x, y, 1), inset));
  const onBack = (x: number, y: number, inset: number): Vec3 =>
    sub(T.surface(x, y, -1), scale(T.normal(x, y, -1), inset));

  for (const s of [1, -1] as const) {
    // pecs: big plates hung from the collarbone. The top leans back into the
    // chest and blends away; the lower edge overhangs, drawing the line under it.
    const pn = norm(add(T.normal(0.092 * s, 1.432, 1), [0, 0.28, 0]));
    p.push(ellipsoid(sub(T.surface(0.092 * s, 1.432, 1), scale(pn, 0.02)), [0.1, 0.08, 0.044], frame(pn, [-0.22 * s, 1, 0]), 0.02));
    p.push(roundCone(onFront(0.155 * s, 1.448, 0.014), [0.2 * s, 1.478, 0.04], 0.03, 0.025, 0.03)); // where the pec folds into the shoulder
    p.push(roundCone([0.042 * s, 1.6, -0.045], [0.192 * s, 1.548, -0.04], 0.058, 0.036, 0.05)); // traps, a slope of muscle from the neck to the shoulder
    p.push(roundCone(onFront(0.024 * s, 1.548, 0.004), [0.172 * s, 1.56, -0.004], 0.012, 0.016, 0.04)); // collarbone

    // the stomach muscle, one column a side from under the chest to the belt;
    // the shallow grooves cut below just hint at the pack
    p.push(ellipsoid(onFront(0.042 * s, 1.222, 0.015), [0.046, 0.135, 0.021], null, 0.04));
    p.push(ellipsoid([0.142 * s, 1.16, 0.032], [0.034, 0.085, 0.058], rotZ(0.12 * s), 0.035)); // obliques, the flank above the hip

    // back: the lats that make the V, thick shoulder blades with the muscle
    // that wraps the back of the armpit, the trap's lower run, the columns
    // either side of the spine
    p.push(roundCone([0.172 * s, 1.425, -0.06], [0.07 * s, 1.1, -0.088], 0.054, 0.026, 0.06));
    p.push(ellipsoid(onBack(0.095 * s, 1.43, 0.016), [0.066, 0.082, 0.034], null, 0.045));
    p.push(ellipsoid([0.158 * s, 1.41, -0.09], [0.036, 0.034, 0.038], rotZ(-0.6 * s), 0.03));
    p.push(roundCone(onBack(0.07 * s, 1.545, 0.014), onBack(0.014 * s, 1.31, 0.012), 0.03, 0.013, 0.045));
    p.push(ellipsoid(onBack(0.035 * s, 1.18, 0.012), [0.027, 0.13, 0.022], null, 0.04));

    // glutes, and the side of the hip above them
    p.push(ellipsoid([0.08 * s, 0.94, -0.076], [0.086, 0.088, 0.045], null, 0.055));
    p.push(ellipsoid([0.142 * s, 0.995, -0.045], [0.046, 0.06, 0.058], null, 0.035));
  }
  p.push(ellipsoid([0, 1.6, -0.064], [0.075, 0.052, 0.034], null, 0.04)); // the back of the neck, thick with trap

  // The separations, cut into the surface the masses above now make. Shallow
  // and wide: the abs should only just show through the suit.
  const f = unionOf([...p]);
  p.push(groove(f, [[0, 1.1], [0, 1.2], [0, 1.3], [0, 1.37]], 1, 0.014, 0.0015)); // down the stomach
  p.push(groove(f, [[0, 1.1], [0, 1.22], [0, 1.34], [0, 1.53]], -1, 0.016, 0.003)); // the spine
  for (const s of [1, -1] as const) {
    // the outer edge of the stomach muscle
    p.push(groove(f, [[0.088 * s, 1.36], [0.09 * s, 1.27], [0.084 * s, 1.18], [0.072 * s, 1.105]], 1, 0.016, 0.0015));
    // the three bands across it, making four rows, the top pair tucked under the chest
    for (const y of [1.312, 1.255, 1.195]) {
      p.push(groove(f, [[0.004 * s, y], [0.045 * s, y + 0.003], [0.086 * s, y + 0.009]], 1, 0.013, 0.0012));
    }
  }

  // belt: wide, with a buckle and pouches round the front and sides
  const [ba, bzf, bzb] = T.at(1.07);
  const bcz = (bzf + bzb) / 2, brx = ba + 0.008, brz = (bzf - bzb) / 2 + 0.008;
  p.push(band([0, 1.07, bcz], brx, brz, 0.028, 0.007, 0.006));
  p.push(roundBox([0, 1.07, bcz + brz + 0.004], [0.032, 0.024, 0.01], 0.005, null, 0.003));
  for (const ang0 of [0.55, 0.95, 1.35, 1.85]) {
    for (const s of [1, -1] as const) {
      const ang = ang0 * s;
      p.push(roundBox([Math.sin(ang) * (brx + 0.006), 1.067, bcz + Math.cos(ang) * (brz + 0.006)], [0.024, 0.03, 0.014], 0.005, rotY(ang), 0.003));
    }
  }
  return group(p);
}

/**
 * The cowl: one helmet over the whole head. Below the eyes it's armour, not
 * flesh — flat planes over the mouth and cheeks, a square jaw narrowing to the
 * chin — so there are no round cheeks to read as puffy.
 */
function head(): Group {
  const mask = slab(
    [
      plane([0, 0, 1], [0, 0, 0.088]), // the front, over the mouth
      plane([0.6, 0, 0.8], [0.03, 0, 0.088]), // cheek planes, angled back from the front
      plane([-0.6, 0, 0.8], [-0.03, 0, 0.088]),
      plane([1, 0, 0], [0.062, 0, 0]), // sides of the face
      plane([-1, 0, 0], [-0.062, 0, 0]),
      plane([0.823, -0.568, 0], [0.024, 1.618, 0]), // the jawline, narrowing down to the chin
      plane([-0.823, -0.568, 0], [-0.024, 1.618, 0]),
      plane([0, -0.885, -0.469], [0, 1.615, 0.075]), // under the jaw, rising back to the neck
      plane([0, -0.6, 0.8], [0, 1.625, 0.088]), // the chin's lower edge
      plane([0, 0, -1], [0, 0, -0.03]), // back, inside the head
      plane([0, 1, 0], [0, 1.738, 0]), // top, under the eyes
    ],
    [-0.066, 1.598, -0.034, 0.066, 1.742, 0.092],
    0.006,
    0.02,
  );
  const p: Prim[] = [
    roundCone([0, 1.525, -0.02], [0, 1.69, -0.01], 0.072, 0.06, 0), // a thick neck
    ellipsoid([0, 1.575, -0.02], [0.105, 0.032, 0.088], null, 0.03), // where the cowl meets the suit
    ellipsoid([0, 1.765, -0.012], [0.083, 0.102, 0.1], null, 0.035), // cranium
    mask,
    roundCone([0, 1.764, 0.09], [0, 1.7, 0.094], 0.013, 0.012, 0.03), // nose ridge, running down into the mask
  ];
  for (const s of [1, -1] as const) {
    p.push(
      roundCone([0.048 * s, 1.69, -0.032], [0.02 * s, 1.555, 0.05], 0.016, 0.014, 0.02), // neck muscle, ear to breastbone
      ellipsoid([0.03 * s, 1.763, 0.074], [0.032, 0.011, 0.022], rotZ(0.3 * s), 0.028), // brow, angled down to the nose
    );
  }
  for (const e of EARS) {
    // ear: wide at the cowl, tapering up; flatter front-to-back than side-to-side
    p.push(squashZ(roundCone(e.base, e.mid, 0.032, e.midR, 0.03), e.base[2], e.depth));
  }
  for (const s of [1, -1] as const) {
    // shallow eye sockets under the brow, for the slits to sit in
    p.push({ ...ellipsoid([0.032 * s, 1.745, 0.097], [0.02, 0.01, 0.016], rotZ(0.3 * s), 0.008), sub: true });
  }
  return group(p);
}

/** An open gloved hand, fingers loosely curled toward the palm, palm toward the thigh. */
function hand(j: ArmJoints): Prim[] {
  const a = norm(sub(j.W, j.E)); // along the hand
  const n = across([-j.side, 0, -0.35], a); // out of the palm: in toward the body, a little back
  const w = cross(a, n); // across the knuckles
  const front = w[2] > 0 ? 1 : -1; // which way along w is the front of the hand (the thumb side)
  const fr: Mat3 = [...w, ...a, ...n];
  const at = (u: number, v: number, t: number): Vec3 => add(j.W, add(scale(w, u), add(scale(a, v), scale(n, t))));

  const p: Prim[] = [roundBox(at(0, 0.05, 0), [0.045, 0.052, 0.023], 0.017, fr, 0.014)]; // palm
  const spread = [-0.031, -0.0105, 0.0105, 0.03];
  const lengths = [0.056, 0.07, 0.074, 0.066];
  for (let i = 0; i < 4; i++) {
    const u = spread[i] * front; // little finger at the back, index at the front
    const base = at(u, 0.097, -0.002);
    const mid = add(base, add(scale(a, lengths[i] * 0.55), scale(n, 0.012)));
    const tip = add(mid, add(scale(a, lengths[i] * 0.42), scale(n, 0.024)));
    p.push(roundCone(base, mid, 0.013, 0.012, 0.004), roundCone(mid, tip, 0.012, 0.0102, 0.004));
  }
  const tb = at(0.039 * front, 0.026, 0.013);
  const tt = add(tb, add(scale(a, 0.045), add(scale(n, 0.024), scale(w, 0.012 * front))));
  p.push(roundCone(tb, tt, 0.0155, 0.0122, 0.01)); // thumb
  return p;
}

function arm(j: ArmJoints): { upper: Group; fore: Group } {
  const { side: s, S, E, W } = j;
  const u1 = sub(E, S);
  const u2 = sub(W, E);
  const a1 = norm(u1);
  const a2 = norm(u2);
  const up = across([s, 1, 0], a1); // off the top-outside of the upper arm
  const fwd1 = across([0, 0, 1], a1); // the front of the upper arm
  const top2 = across([s, 0.4, 0], a2); // the top of the forearm, thumb side
  const outer = across([s, 0, -0.7], a2); // the outer back edge of the forearm, where the fins are
  const upper = group([
    roundCone(S, E, 0.064, 0.048, 0),
    // deltoid: a broad cap over the shoulder, its front and rear heads wrapping round
    ellipsoid(add(add(S, scale(a1, 0.035)), scale(up, 0.02)), [0.074, 0.105, 0.078], alignY(u1), 0.03),
    ellipsoid(add(add(S, scale(a1, 0.065)), scale(fwd1, 0.042)), [0.04, 0.085, 0.032], alignY(u1), 0.022),
    ellipsoid(add(add(S, scale(a1, 0.065)), scale(fwd1, -0.046)), [0.046, 0.09, 0.038], alignY(u1), 0.022), // rear delt, fuller from behind
    ellipsoid(add(lerp(S, E, 0.57), scale(fwd1, 0.026)), [0.05, 0.095, 0.044], alignY(u1), 0.014), // bicep
    ellipsoid(add(lerp(S, E, 0.42), scale(fwd1, -0.028)), [0.054, 0.115, 0.044], alignY(u1), 0.016), // tricep
  ]);
  const fore = group([
    roundCone(E, W, 0.052, 0.037, 0),
    // forearm muscle, thick below the elbow and tapering to the wrist
    ellipsoid(add(lerp(E, W, 0.27), scale(top2, 0.02)), [0.056, 0.11, 0.05], alignY(u2), 0.024), // along the top
    ellipsoid(add(lerp(E, W, 0.3), scale(top2, -0.018)), [0.05, 0.11, 0.046], alignY(u2), 0.024), // underneath
    roundCone(lerp(E, W, 0.08), lerp(E, W, 0.135), 0.072, 0.07, 0.006), // gauntlet lip at the elbow
    roundCone(lerp(E, W, 0.87), lerp(E, W, 0.96), 0.05, 0.048, 0.006), // wrist cuff
    ellipsoid(add(lerp(E, W, 0.47), scale(outer, 0.05)), [0.032, 0.12, 0.02], alignY(u2), 0.02), // armour ridge where the fins sit
    ...hand(j),
  ]);
  return { upper, fore };
}

function leg(s: 1 | -1): Group {
  const H: Vec3 = [0.104 * s, 0.94, 0.004];
  const K: Vec3 = [0.114 * s, 0.5, 0.012];
  const A: Vec3 = [0.124 * s, 0.088, -0.012];
  const up = alignY(sub(K, H));
  const low = alignY(sub(A, K));
  const axis = norm(sub(K, H));
  const fr = across([0, 0, 1], axis); // the front of the thigh
  const ou = across([s, 0, 0], axis); // its outside
  /** A point `t` of the way down the thigh, `f` forward and `o` outward of the bone. */
  const at = (t: number, f: number, o: number): Vec3 => add(lerp(H, K, t), add(scale(fr, f), scale(ou, o)));

  const p: Prim[] = [
    roundCone(H, K, 0.084, 0.05, 0), // thigh
    ellipsoid(at(0.4, 0.008, 0.058), [0.062, 0.21, 0.064], up, 0.03), // the outer sweep of the quad
    ellipsoid(at(0.38, 0.056, 0.006), [0.052, 0.22, 0.046], up, 0.028), // down the front
    ellipsoid(at(0.78, 0.032, -0.038), [0.046, 0.1, 0.044], up, 0.034), // the teardrop above the knee
    ellipsoid(at(0.42, -0.05, 0), [0.066, 0.21, 0.06], up, 0.03), // hamstrings
    ellipsoid(at(0.26, 0, -0.036), [0.05, 0.14, 0.058], up, 0.032), // inner thigh, clear of the other leg
    roundBox(add(K, [0, 0.014, 0.06]), [0.05, 0.06, 0.026], 0.024, low, 0.014), // knee pad
    roundCone(K, A, 0.06, 0.045, 0.02), // shin
    ellipsoid(add(lerp(K, A, 0.26), [0.02 * s, 0, -0.042]), [0.046, 0.125, 0.056], low, 0.03), // calf, outer head
    ellipsoid(add(lerp(K, A, 0.24), [-0.018 * s, 0, -0.044]), [0.05, 0.13, 0.058], low, 0.03), // calf, inner head
    roundBox(add(lerp(K, A, 0.42), [0, 0, 0.048]), [0.048, 0.18, 0.023], 0.02, low, 0.014), // shin guard
    roundCone(lerp(K, A, 0.32), add(A, [0, -0.02, 0]), 0.068, 0.058, 0.012), // boot shaft
    roundBox([0.124 * s, 0.05, 0.056], [0.053, 0.048, 0.132], 0.032, rotY(-0.08 * s), 0.016), // boot
    roundBox([0.124 * s, 0.015, 0.053], [0.057, 0.015, 0.14], 0.009, rotY(-0.08 * s), 0.005), // sole
    ellipsoid([0.124 * s, 0.066, -0.033], [0.047, 0.055, 0.049], null, 0.016), // heel
  ];

  // Soft separations between the quad's heads, traced onto the thigh. Each
  // point is how far down the thigh, and the angle round from the front
  // toward the outside.
  const f = unionOf([...p]);
  const line = (pts: Array<[number, number]>) =>
    pts.map(([t, ang]): [Vec3, Vec3] => {
      const dir = add(scale(fr, Math.cos(ang)), scale(ou, Math.sin(ang)));
      return [add(lerp(H, K, t), scale(dir, 0.2)), scale(dir, -1)];
    });
  p.push(grooveOn(f, line([[0.18, 0.62], [0.45, 0.7], [0.72, 0.62]]), 0.024, 0.0016)); // outer sweep | front
  p.push(grooveOn(f, line([[0.12, -0.15], [0.45, -0.45], [0.78, -0.85]]), 0.024, 0.0016)); // front | inner, spiralling to the knee
  return group(p);
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
      // A dent does nothing outside its box at all.
      const pb = p.box;
      const ex = Math.max(pb[0] - x, 0, x - pb[3]);
      const ey = Math.max(pb[1] - y, 0, y - pb[4]);
      const ez = Math.max(pb[2] - z, 0, z - pb[5]);
      const bd = Math.sqrt(ex * ex + ey * ey + ez * ez);
      if (p.dent ? bd > 0 : p.sub ? bd >= p.k - d : bd >= d + p.k) continue;
    }
    d = apply(d, p, x, y, z);
  }
  return d;
}

/** How the groups join: torso, head, legs L/R, left arm upper/fore, right arm upper/fore. */
function combine(t: number, h: number, ll: number, lr: number, alu: number, alf: number, aru: number, arf: number) {
  let d = smin(t, h, 0.04);
  d = smin(d, smin(alu, alf, 0.012), 0.022);
  d = smin(d, smin(aru, arf, 0.012), 0.022);
  // The legs meet each other with a hard crease, never a web — a soft blend
  // there melted the thighs into one lump. They join the hips more firmly too.
  return smin(d, Math.min(ll, lr), 0.022);
}
/** The widest blend between groups — anything further than this can't touch the join. */
const JOIN_K = 0.045;

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
  return combine(t, h, ll, lr, alu, alf, aru, arf);
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

/* ---------------- meshing ---------------- */

export interface SuitMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  /** Part id per vertex (index into PART_NAMES). */
  parts: Uint8Array;
  /** Ambient occlusion per vertex, 0 (fully shut in) to 1 (open). */
  ao: Float32Array;
  /**
   * How much each vertex belongs to each part that can light up, five per
   * vertex in GLOW_PARTS order. Soft across the joints, so a lit part fades out
   * instead of ending on a jagged line of triangles.
   */
  glow: Float32Array;
  /** How long meshing took, in ms. */
  ms: number;
}

const BOUNDS = { x0: -0.74, x1: 0.74, y0: -0.035, y1: 1.94, z0: -0.21, z1: 0.23 };

/** The parts that light up when picked, by group index (head, left arm upper/fore, right arm upper/fore). */
export const GLOW_PARTS = ["head", "armL-upper", "armL-fore", "armR-upper", "armR-fore"] as const;
const GLOW_GROUPS = [1, 4, 5, 6, 7];
/** How quickly membership falls away from a part's own surface, in metres. */
const GLOW_TAU = 0.004;

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
  const glow = new Float32Array(count * GLOW_PARTS.length);
  const gd = new Float64Array(8);
  const wt = new Float64Array(8);
  for (let vi = 0; vi < count; vi++) {
    const x = pos[vi * 3], y = pos[vi * 3 + 1], z = pos[vi * 3 + 2];
    sdf(x, y, z, gd);
    let best = 0;
    for (let g = 1; g < 8; g++) if (gd[g] < gd[best]) best = g;
    // the head ends at the jawline; the neck and cowl skirt below it read as body
    if (best === 1 && y < 1.585) best = 0;
    parts[vi] = GROUP_PART[best];

    // soft membership: each group weighs less the further its own surface is
    // from here than the nearest group's
    let near = gd[0], sum = 0;
    for (let g = 1; g < 8; g++) near = Math.min(near, gd[g]);
    for (let g = 0; g < 8; g++) sum += wt[g] = Math.exp(-(gd[g] - near) / GLOW_TAU);
    const neck = Math.min(1, Math.max(0, (y - 1.572) / 0.026)); // the head glows from the jaw up
    for (let gi = 0; gi < GLOW_GROUPS.length; gi++) {
      const w = wt[GLOW_GROUPS[gi]] / sum;
      glow[vi * GLOW_PARTS.length + gi] = gi === 0 ? w * neck * neck * (3 - 2 * neck) : w;
    }

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

  const end = typeof performance !== "undefined" ? performance.now() : Date.now();
  return { positions, normals, indices: Uint32Array.from(idx), parts, ao, glow, ms: end - start };
}
