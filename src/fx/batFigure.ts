import * as THREE from "three";
import { TessellateModifier } from "three/examples/jsm/modifiers/TessellateModifier.js";

import { ARMS, EARS, GLOW_PARTS, PART_NAMES, normalAt, traceSurface, type ArmJoints, type SuitMesh, type Vec3 } from "./suitSdf";

/**
 * The Batsuit scene object: the sculpted body from suitSdf, cut into one mesh
 * per body part so a click knows what it hit, plus the pieces a distance
 * field can't keep sharp — cowl ears, eye slits, chest emblem, forearm fins.
 * Every mesh carries userData.part so a click can be turned into a pillar by
 * `pillarFor`.
 */

export type Part = (typeof PART_NAMES)[number] | "finsR" | "finsL";

const BLACK = new THREE.MeshStandardMaterial({ color: 0x0d0e11, roughness: 0.42, metalness: 0.42 });
const EMBLEM = new THREE.MeshStandardMaterial({ color: 0x08090b, roughness: 0.65, metalness: 0.2 });
// unlit, so the eyes glow and never take the hover tint
const EYES = new THREE.MeshBasicMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

function tagged(geo: THREE.BufferGeometry, mat: THREE.Material, part: Part) {
  const m = new THREE.Mesh(geo, mat.clone());
  m.userData.part = part;
  return m;
}

const v3 = (p: Vec3) => new THREE.Vector3(p[0], p[1], p[2]);

/** Which colour rule a body part follows in the suit shader. */
const RULE: Record<(typeof PART_NAMES)[number], number> = {
  torso: 0, // grey, the cowl's black over the neck, the belt
  head: 1, // the cowl, down to the same neck ring as the torso
  legs: 2, // grey trousers, black from the knee pads down
  "armL-upper": 3, // grey
  "armR-upper": 3,
  "armL-fore": 4, // black gauntlet and glove from just below the elbow
  "armR-fore": 4,
};

/**
 * The suit material for one body part. The colours are worked out per pixel
 * from where the point sits on the body, so the line where black meets grey
 * is clean at any zoom — per vertex it stair-stepped along the mesh. The
 * vertex colour carries the ambient occlusion baked from the field, and the
 * black armour is glossier than the grey suit, as in the reference.
 */
/** Shared by every body material, so one write lights the whole figure. */
type Glow = { uLitA: { value: THREE.Vector4 }; uLitB: { value: number }; uGlowColor: { value: THREE.Color } };

function suitMaterial(part: (typeof PART_NAMES)[number], glow: Glow): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.15 });
  const arm = part === "armL-fore" ? ARMS.L : ARMS.R;
  const uniforms = {
    ...glow,
    uRule: { value: RULE[part] },
    uElbow: { value: v3(arm.E) },
    uWrist: { value: v3(arm.W) },
    uSuit: { value: new THREE.Color(0x363940) },
    uBlack: { value: new THREE.Color(0x121317) },
    uBelt: { value: new THREE.Color(0x4a4d54) },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vSuitPos;\nattribute vec4 glowA;\nattribute float glowB;\nvarying vec4 vGlowA;\nvarying float vGlowB;",
      )
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSuitPos = position;\nvGlowA = glowA;\nvGlowB = glowB;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vSuitPos;
varying vec4 vGlowA;
varying float vGlowB;
uniform float uRule;
uniform vec3 uElbow, uWrist, uSuit, uBlack, uBelt, uGlowColor;
uniform vec4 uLitA;
uniform float uLitB;
// 0 → 1 across a line, exactly one pixel soft at any distance
float suitEdge(float v) { float w = max(fwidth(v), 1e-5); return smoothstep(-w, w, v); }`,
      )
      .replace(
        "#include <color_fragment>",
        `float suitBlack = 0.0, suitBelt = 0.0;
if (uRule < 1.5) {
  // the cowl ends in a ring round the base of the neck, on the head and torso alike
  float rn = length(vec2(vSuitPos.x, (vSuitPos.z + 0.015) * 1.1));
  suitBlack = suitEdge(vSuitPos.y - (1.552 + 1.6 * max(0.0, rn - 0.072)));
  if (uRule < 0.5) suitBelt = suitEdge(min(vSuitPos.y - 1.04, 1.1 - vSuitPos.y));
} else if (uRule < 2.5) {
  suitBlack = suitEdge(0.575 - vSuitPos.y);
} else if (uRule > 3.5) {
  vec3 ew = uWrist - uElbow;
  float l = length(ew);
  suitBlack = suitEdge(dot(vSuitPos - uElbow, ew / l) - 0.075 * l);
}
diffuseColor.rgb = mix(mix(uSuit, uBlack, suitBlack), uBelt, suitBelt) * vColor.rgb;`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.5, suitBlack);",
      )
      .replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\ntotalEmissiveRadiance += uGlowColor * clamp(dot(vGlowA, uLitA) + vGlowB * uLitB, 0.0, 1.0);",
      );
  };
  return mat;
}

/** The sculpted body: one mesh per body part, all sharing one set of vertices so the seams never show. */
function body(m: SuitMesh, glow: Glow): THREE.Mesh[] {
  const position = new THREE.BufferAttribute(m.positions, 3);
  const normal = new THREE.BufferAttribute(m.normals, 3);
  const grey = new Float32Array(m.ao.length * 3);
  for (let i = 0; i < m.ao.length; i++) grey[i * 3] = grey[i * 3 + 1] = grey[i * 3 + 2] = m.ao[i];
  const color = new THREE.BufferAttribute(grey, 3);
  // head, left arm upper and fore, right upper in one attribute; right forearm in another
  const n = GLOW_PARTS.length;
  const a4 = new Float32Array(m.ao.length * 4);
  const b1 = new Float32Array(m.ao.length);
  for (let i = 0; i < m.ao.length; i++) {
    for (let c = 0; c < 4; c++) a4[i * 4 + c] = m.glow[i * n + c];
    b1[i] = m.glow[i * n + 4];
  }
  const glowA = new THREE.BufferAttribute(a4, 4);
  const glowB = new THREE.BufferAttribute(b1, 1);

  // a triangle belongs to the part most of its corners belong to
  const byPart: number[][] = PART_NAMES.map(() => []);
  const I = m.indices;
  for (let t = 0; t < I.length; t += 3) {
    const a = m.parts[I[t]], b = m.parts[I[t + 1]], cc = m.parts[I[t + 2]];
    const p = b === cc ? b : a;
    byPart[p].push(I[t], I[t + 1], I[t + 2]);
  }

  return byPart.map((idx, p) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", position);
    g.setAttribute("normal", normal);
    g.setAttribute("color", color);
    g.setAttribute("glowA", glowA);
    g.setAttribute("glowB", glowB);
    g.setIndex(idx);
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, suitMaterial(PART_NAMES[p], glow));
    mesh.userData.part = PART_NAMES[p];
    mesh.userData.body = true;
    return mesh;
  });
}

/** Tall pointed cowl ears, rooted in the stubs the body already has. */
function ears(): THREE.Mesh[] {
  // The sculpted body grows each ear out of the cowl; a field mesh can't hold a
  // sharp point, so this cone carries on from where it stops, same width and squash.
  return EARS.map((e) => {
    const base = v3(e.mid);
    const dir = v3(e.tip).sub(base);
    const overlap = 0.012;
    const geo = new THREE.ConeGeometry(e.midR * 1.03, dir.length() + overlap, 28, 1);
    geo.translate(0, (dir.length() + overlap) / 2 - overlap, 0);
    geo.scale(1, 1, e.depth);
    const mesh = tagged(geo, BLACK, "head");
    mesh.position.copy(base);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return mesh;
  });
}

/** White eye slits, slanting down toward the nose, sat on the cowl under the brow. */
function eyes(): THREE.Mesh[] {
  return ([1, -1] as const).map((s) => {
    const flat = new THREE.CircleGeometry(1, 40);
    flat.scale(0.021, 0.0062, 1);
    flat.rotateZ(0.3 * s);
    flat.translate(0.033 * s, 1.745, 0);
    // Cut into small pieces and lay each one on the cowl. A flat slit has the
    // curved socket poking through its middle, which reads as a dark pupil.
    const geo = new TessellateModifier(0.002, 8).modify(flat);
    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const hit = traceSurface([pos.getX(i), pos.getY(i), 0.4], [0, 0, -1]);
      if (!hit) continue;
      const n = normalAt(...hit);
      pos.setXYZ(i, hit[0] + n[0] * 0.0012, hit[1] + n[1] * 0.0012, hit[2] + n[2] * 0.0012);
    }
    return tagged(geo, EYES, "head");
  });
}

/** The bat on the chest: a thin plate bent to follow the pecs. */
function emblem(): THREE.Mesh {
  const s = new THREE.Shape();
  s.moveTo(0, 0.022);
  s.lineTo(0.011, 0.038); // ears
  s.lineTo(0.019, 0.024);
  s.quadraticCurveTo(0.075, 0.046, 0.142, 0.032); // top of the wing
  s.quadraticCurveTo(0.11, 0.0, 0.122, -0.028); // tip, swept down
  s.quadraticCurveTo(0.094, -0.012, 0.077, -0.033); // scallops
  s.quadraticCurveTo(0.056, -0.014, 0.038, -0.038);
  s.quadraticCurveTo(0.02, -0.022, 0, -0.066); // tail
  s.quadraticCurveTo(-0.02, -0.022, -0.038, -0.038);
  s.quadraticCurveTo(-0.056, -0.014, -0.077, -0.033);
  s.quadraticCurveTo(-0.094, -0.012, -0.122, -0.028);
  s.quadraticCurveTo(-0.11, 0.0, -0.142, 0.032);
  s.quadraticCurveTo(-0.075, 0.046, -0.019, 0.024);
  s.lineTo(-0.011, 0.038);
  s.closePath();
  // Cut into small triangles first, or the plate folds along long edges when it bends and catches a glare streak.
  const geo = new TessellateModifier(0.006, 8).modify(
    new THREE.ExtrudeGeometry(s, { depth: 0.0035, bevelEnabled: false, curveSegments: 10 }),
  );

  // lay every point on the chest, keeping its own thickness; it rests on the
  // highest skin nearby, so it bridges the dip between the pecs like a plate
  const cy = 1.445;
  const chest = (x: number, y: number) => traceSurface([x, y, 0.4], [0, 0, -1])?.[2] ?? 0.12;
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i) + cy;
    const z = Math.max(chest(x, y), chest(x - 0.014, y), chest(x + 0.014, y));
    pos.setXYZ(i, x, y, z + pos.getZ(i) + 0.0008);
  }
  geo.computeVertexNormals();
  return tagged(geo, EMBLEM, "torso");
}

/** Three blades down the outer back of each forearm, angled toward the elbow. */
function fins(j: ArmJoints): THREE.Mesh[] {
  const part: Part = j.side === 1 ? "finsL" : "finsR";
  const E = v3(j.E), W = v3(j.W);
  const up = E.clone().sub(W).normalize(); // along the forearm, toward the elbow
  const out = new THREE.Vector3(0.25 * j.side, 0.15, -0.95);
  out.addScaledVector(up, -out.dot(up)).normalize(); // outward and back, square to the arm
  const side = new THREE.Vector3().crossVectors(out, up);
  const basis = new THREE.Matrix4().makeBasis(out, up, side);

  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0.088, 0.09);
  shape.lineTo(0.014, 0.06);
  shape.lineTo(0, 0.06);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: false });
  geo.translate(0, 0, -0.003);

  return [0.3, 0.5, 0.7].map((t) => {
    // root each blade just under the gauntlet's skin, wherever that is along the arm
    const p = E.clone().lerp(W, t);
    const hit = traceSurface([p.x + out.x * 0.3, p.y, p.z + out.z * 0.3], [-out.x, -out.y, -out.z], 0.4);
    const m = tagged(geo, BLACK, part);
    m.quaternion.setFromRotationMatrix(basis);
    m.position.copy(hit ? v3(hit) : p.addScaledVector(out, j.rE)).addScaledVector(out, -0.008);
    return m;
  });
}

const LIT = new THREE.Color(0x2e070b);
const UNLIT = new THREE.Color(0x000000);

export function buildBatFigure(m: SuitMesh): THREE.Group {
  const root = new THREE.Group();
  const glow: Glow = { uLitA: { value: new THREE.Vector4() }, uLitB: { value: 0 }, uGlowColor: { value: LIT.clone() } };
  root.userData.glow = glow;
  for (const mesh of [...body(m, glow), ...ears(), ...eyes(), emblem(), ...fins(ARMS.L), ...fins(ARMS.R)]) {
    root.add(mesh);
  }
  return root;
}

/**
 * Light up the given parts in deep red. The body glows through its shader,
 * fading softly across the joints; the separate pieces — ears, fins, emblem —
 * glow whole.
 */
export function setGlow(fig: THREE.Group, lit: ReadonlySet<Part>): void {
  const glow = fig.userData.glow as Glow;
  const on = (p: (typeof GLOW_PARTS)[number]) => (lit.has(p) ? 1 : 0);
  glow.uLitA.value.set(on("head"), on("armL-upper"), on("armL-fore"), on("armR-upper"));
  glow.uLitB.value = on("armR-fore");
  fig.traverse((o) => {
    // the eyes are unlit and keep their own white; the body is handled above
    if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial && !o.userData.body) {
      o.material.emissive.copy(lit.has(o.userData.part) ? LIT : UNLIT);
    }
  });
}

export type PillarKey = "archive" | "craft" | "mirror" | "forge" | "discipline";

/**
 * Which pillar a click on a body part belongs to. The head is split by which
 * way the hit surface faces: front is THE ARCHIVE, back is THE MIRROR.
 */
export function pillarFor(part: Part | undefined, normalZ: number): PillarKey | null {
  switch (part) {
    case "head":
      return normalZ < 0 ? "mirror" : "archive";
    case "armL-upper":
    case "armL-fore":
      return "craft";
    case "armR-upper":
      return "forge";
    case "armR-fore":
    case "finsR":
    case "finsL":
      return "discipline";
    default:
      return null;
  }
}

/** Every part that lights up when a pillar is hovered or in focus. */
export const PILLAR_PARTS: Record<PillarKey, Part[]> = {
  archive: ["head"],
  mirror: ["head"],
  craft: ["armL-upper", "armL-fore"],
  forge: ["armR-upper"],
  discipline: ["armR-fore", "finsR"],
};

/**
 * Where the camera goes for each pillar, as an orbit around the figure's
 * vertical axis: angle (0 = straight in front, positive = round to the
 * figure's left), distance from the axis, camera height, and the point it
 * looks at. Moving between views lerps the angle, so the camera swings round
 * the figure instead of passing through it.
 */
export interface View {
  theta: number;
  r: number;
  y: number;
  target: [number, number, number];
}

export const OVERVIEW: View = { theta: 0, r: 3.6, y: 1.15, target: [0, 1.0, 0] };

const mid = (a: Vec3, b: Vec3, t: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t,
];

export const VIEWS: Record<PillarKey, View> = {
  archive: { theta: 0.15, r: 1.1, y: 1.78, target: [0, 1.73, 0.02] },
  craft: { theta: 0.75, r: 1.45, y: 1.3, target: mid(ARMS.L.E, ARMS.L.W, 0.3) },
  mirror: { theta: 2.7, r: 1.15, y: 1.86, target: [0, 1.75, -0.02] },
  forge: { theta: -1.0, r: 1.4, y: 1.42, target: mid(ARMS.R.S, ARMS.R.E, 0.5) },
  // from his right, a little behind: the back of the forearm, fins side-on
  discipline: { theta: -1.85, r: 2.0, y: 1.3, target: mid(ARMS.R.E, ARMS.R.W, 0.45) },
};

/** A point on the skin, found by walking a ray in from outside; `fallback` if it misses. */
function onSkin(from: Vec3, dir: Vec3, fallback: Vec3): [number, number, number] {
  const hit = traceSurface(from, dir);
  const p = hit ?? fallback;
  return [p[0], p[1], p[2]];
}

/** Glowing markers on each pillar's spot, for the overview. */
export const MARKERS: Record<PillarKey, [number, number, number]> = {
  archive: onSkin([0, 1.795, 0.5], [0, 0, -1], [0, 1.795, 0.1]),
  craft: onSkin([...mid(ARMS.L.E, ARMS.L.W, 0.35)].map((v, i) => (i === 2 ? 0.5 : v)) as Vec3, [0, 0, -1], [0.45, 1.1, 0.05]),
  mirror: onSkin([0, 1.78, -0.5], [0, 0, 1], [0, 1.78, -0.1]),
  forge: onSkin([...mid(ARMS.R.S, ARMS.R.E, 0.55)].map((v, i) => (i === 2 ? 0.5 : v)) as Vec3, [0, 0, -1], [-0.27, 1.33, 0.05]),
  discipline: onSkin([...mid(ARMS.R.E, ARMS.R.W, 0.25)].map((v, i) => (i === 2 ? -0.5 : v)) as Vec3, [0, 0, 1], [-0.45, 1.12, -0.05]),
};
