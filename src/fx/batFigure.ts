import * as THREE from "three";
import { TessellateModifier } from "three/examples/jsm/modifiers/TessellateModifier.js";

import { ARMS, EARS, PART_NAMES, normalAt, traceSurface, type ArmJoints, type SuitMesh, type Vec3 } from "./suitSdf";

/**
 * The Batsuit scene object: the sculpted body from suitSdf, cut into one mesh
 * per body part so a click knows what it hit, plus the pieces a distance
 * field can't keep sharp — cowl ears, eye slits, chest emblem, forearm fins —
 * and the cape. Every mesh carries userData.part so a click can be turned
 * into a pillar by `pillarFor`.
 */

export type Part = (typeof PART_NAMES)[number] | "finsR" | "finsL" | "cape";

/**
 * Cel shading: each light either lights a surface or it doesn't, with a hard
 * edge between — one flat shadow shape per light, like a painted animation cel.
 * The edge sits where the light meets the surface at about 75°.
 */
const TONES = new THREE.DataTexture(
  new Uint8Array([0, 0, 0, 0, 0, 255, 255, 255].flatMap((v) => [v, v, v, 255])),
  8,
  1,
);
TONES.minFilter = TONES.magFilter = THREE.NearestFilter;
TONES.needsUpdate = true;

/**
 * The one black every black part shares: cowl, gloves, boots, trunks, ears,
 * fins, emblem and cape. It's painted flat, without the cel light, so no black
 * part ever reads lighter or darker than another; its edges get a thin grey
 * line and the red rim (see INK_FINISH).
 */
const SUIT_BLACK = new THREE.Color(0x15171c).multiplyScalar(0.7);
/** The thin highlight line drawn round the edges of black parts. */
const BLACK_LINE = new THREE.Color(0x5a5e6b);
const RIM = new THREE.Color(0xff2537);

/**
 * How a surface is finished after lighting. Black parts: flat suit black, a
 * thin grey line just inside the edge where they turn away from the eye — the
 * highlight a cartoon draws on black, so a jaw, a nose or a glove against the
 * cape still reads — and the red rim down the side away from the key light.
 * Everything gets the same rim; `inkBlack` is the black parts' finished colour.
 */
const INK_FINISH = `
float inkFacing = dot(normal, normalize(vViewPosition));
float inkLine = smoothstep(0.06, 0.1, inkFacing) * (1.0 - smoothstep(0.22, 0.3, inkFacing));
float inkRim = 0.8 * (1.0 - smoothstep(0.21, 0.25, inkFacing)) * smoothstep(0.45, 0.7, normal.x);
vec3 inkBlack = mix(mix(uSuitBlack, uBlackLine, inkLine), uRim, inkRim);`;

/** Suit black for the ears and fins, finished like the body's black parts. */
const BLACK = new THREE.MeshToonMaterial({ color: 0x000000, gradientMap: TONES });
BLACK.onBeforeCompile = (shader) => {
  Object.assign(shader.uniforms, { uSuitBlack: { value: SUIT_BLACK }, uBlackLine: { value: BLACK_LINE }, uRim: { value: RIM } });
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", "#include <common>\nuniform vec3 uSuitBlack, uBlackLine, uRim;")
    .replace("#include <opaque_fragment>", `${INK_FINISH}\noutgoingLight = inkBlack;\n#include <opaque_fragment>`);
};

/** Plain flat black for the chest emblem: it sits on grey, so it needs no lines. */
const EMBLEM = new THREE.MeshToonMaterial({ color: 0x000000, gradientMap: TONES });
EMBLEM.onBeforeCompile = (shader) => {
  shader.uniforms.uSuitBlack = { value: SUIT_BLACK };
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", "#include <common>\nuniform vec3 uSuitBlack;")
    .replace("#include <opaque_fragment>", "outgoingLight = uSuitBlack;\n#include <opaque_fragment>");
};

/** What moves the cape: a clock for its ripple, and how far it twists (x, radians at the hem) and billows out (y). */
type CapeMotion = { uCapeTime: { value: number }; uCapeSwing: { value: THREE.Vector2 } };

/**
 * The cape: flat suit black seen from both sides, inked where it turns away
 * from the eye. (No red rim: seen edge-on, a flat sheet is all rim.) It moves in
 * the vertex shader, pinned at the top and swinging more the further down it
 * hangs: a twist round him, and a billow out from his body with a slow ripple
 * running through it. Only ever outward, so it can't swing into him.
 */
function capeMaterial(motion: CapeMotion): THREE.MeshToonMaterial {
  const mat = new THREE.MeshToonMaterial({ color: 0x000000, gradientMap: TONES, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, motion, { uSuitBlack: { value: SUIT_BLACK } });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 drape;\nuniform float uCapeTime;\nuniform vec2 uCapeSwing;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
float capeW = drape.y * drape.y;
float capeA = uCapeSwing.x * capeW, cA = cos(capeA), sA = sin(capeA);
transformed.xz = vec2(cA * transformed.x + sA * transformed.z, cA * transformed.z - sA * transformed.x);
float capeRipple = 0.5 + 0.5 * sin(uCapeTime * 1.6 - drape.x * 7.0 + drape.y * 2.5);
transformed.xz += normalize(vec2(transformed.x * 0.6, transformed.z + 0.02)) * capeW * (uCapeSwing.y + 0.012 * capeRipple);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uSuitBlack;")
      .replace(
        "#include <opaque_fragment>",
        "outgoingLight = uSuitBlack * smoothstep(0.1, 0.18, dot(normal, normalize(vViewPosition)));\n#include <opaque_fragment>",
      );
  };
  return mat;
}

/**
 * The ink line: a copy of a mesh pushed out along its normals, drawn back
 * faces only in black, so it shows as an outline round every silhouette. The
 * push grows with distance, so the line stays the same width on screen.
 */
const INK = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide });
INK.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader.replace(
    "#include <project_vertex>",
    `#include <project_vertex>
mvPosition.xyz += normalize(normalMatrix * normal) * 0.0024 * -mvPosition.z;
gl_Position = projectionMatrix * mvPosition;`,
  );
};

/** The outline for a mesh; it never takes a click. */
function inked(mesh: THREE.Mesh): THREE.Mesh {
  const ink = new THREE.Mesh(mesh.geometry, INK);
  ink.position.copy(mesh.position);
  ink.quaternion.copy(mesh.quaternion);
  ink.raycast = () => {};
  return ink;
}
// unlit, so the eyes stay pure white
const EYES = new THREE.MeshBasicMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

/** A mesh that knows which body part it is, so a click on it can find its pillar. */
function tagged(geo: THREE.BufferGeometry, mat: THREE.Material, part: Part) {
  const m = new THREE.Mesh(geo, mat);
  m.userData.part = part;
  return m;
}

const v3 = (p: Vec3) => new THREE.Vector3(p[0], p[1], p[2]);

/** Which colour rule a body part follows in the suit shader. */
const RULE: Record<(typeof PART_NAMES)[number], number> = {
  torso: 0, // grey, black under the cowl and the cape, the belt, black trunks below it
  head: 1, // the cowl over the whole head, mouth and all, down to the same neck ring as the torso
  legs: 2, // grey, the trunks over the top, black boots up to the knee
  "armL-upper": 3, // grey, black on top of the shoulder cap under the cape
  "armR-upper": 3,
  "armL-fore": 4, // black glove from just below the elbow
  "armR-fore": 4,
};

/**
 * The suit material for one body part. The colours are worked out per pixel
 * from where the point sits on the body, so the line where black meets grey
 * is clean at any zoom — per vertex it stair-stepped along the mesh.
 */
function suitMaterial(part: (typeof PART_NAMES)[number]): THREE.MeshToonMaterial {
  const mat = new THREE.MeshToonMaterial({ gradientMap: TONES });
  const arm = part === "armL-fore" ? ARMS.L : ARMS.R;
  const uniforms = {
    uRule: { value: RULE[part] },
    uElbow: { value: v3(arm.E) },
    uWrist: { value: v3(arm.W) },
    uSuit: { value: new THREE.Color(0x8a8e99) },
    uBlack: { value: new THREE.Color(0x1b1d23) },
    uBelt: { value: new THREE.Color(0xc7ccd6) },
    uRim: { value: RIM },
    uSuitBlack: { value: SUIT_BLACK },
    uBlackLine: { value: BLACK_LINE },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vSuitPos;",
      )
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSuitPos = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vSuitPos;
uniform float uRule;
uniform vec3 uElbow, uWrist, uSuit, uBlack, uBelt, uRim, uSuitBlack, uBlackLine;
// 0 → 1 across a line, exactly one pixel soft at any distance
float suitEdge(float v) { float w = max(fwidth(v), 1e-5); return smoothstep(-w, w, v); }`,
      )
      .replace(
        "#include <color_fragment>",
        `float suitBlack = 0.0, suitBelt = 0.0, suitSeam = 0.0;
// under the cape the suit is black too, above a line that follows the draped
// cape's front edge over each shoulder, so cowl and cape read as one piece;
// past the shoulder cap the edge wraps back round the arm, so the line stops
float ax = abs(vSuitPos.x);
float capeEdge = ax < 0.193 ? 1.645 - 0.333 * max(0.0, ax - 0.064)
  : ax < 0.305 ? 1.602 - 0.67 * (ax - 0.193)
  : 1.527 - 0.72 * (min(ax, 0.38) - 0.305);
float underCape = suitEdge(vSuitPos.y - capeEdge - 0.006);
if (uRule < 1.5) {
  // the cowl covers the whole head and ends in a ring round the base of the neck
  float rn = length(vec2(vSuitPos.x, vSuitPos.z + 0.02));
  suitBlack = max(suitEdge(vSuitPos.y - (1.6 + 0.6 * max(0.0, rn - 0.08))), underCape);
  if (uRule < 0.5) {
    suitBelt = suitEdge(min(vSuitPos.y - 1.12, 1.22 - vSuitPos.y));
    // trunks, cut at the same leg holes as on the legs so the edge doesn't care which mesh it's on
    suitBlack = max(suitBlack, min(suitEdge(1.12 - vSuitPos.y), suitEdge(vSuitPos.y - (0.955 + 0.62 * abs(vSuitPos.x)))));
    // the belt's pouches, drawn as ink seams round it either side of the buckle, and its edges
    float ang = abs(atan(vSuitPos.x, vSuitPos.z - 0.006));
    float seam = min(min(abs(ang - 0.3), abs(ang - 0.68)), min(abs(ang - 1.06), abs(ang - 1.44)));
    float fa = fwidth(ang), fy = fwidth(vSuitPos.y);
    suitSeam = max(1.0 - smoothstep(fa, 2.0 * fa, seam), 1.0 - smoothstep(fy, 2.0 * fy, min(abs(vSuitPos.y - 1.12), abs(vSuitPos.y - 1.22))));
    suitSeam *= suitEdge(min(vSuitPos.y - 1.115, 1.225 - vSuitPos.y));
  }
} else if (uRule < 2.5) {
  // the trunks' leg holes, high on the hip; boots up to the knee, peaked at the front
  float ang = atan(vSuitPos.x - sign(vSuitPos.x) * 0.116, vSuitPos.z + 0.01);
  float boot = 0.565 + 0.07 * max(0.0, 1.0 - abs(ang) / 0.9);
  suitBlack = max(suitEdge(boot - vSuitPos.y), suitEdge(vSuitPos.y - (0.955 + 0.62 * abs(vSuitPos.x))));
} else if (uRule < 3.5) {
  suitBlack = underCape; // the top of the shoulder cap, under the cape
} else {
  vec3 ew = uWrist - uElbow;
  float l = length(ew);
  suitBlack = suitEdge(dot(vSuitPos - uElbow, ew / l) - 0.12 * l);
}
diffuseColor.rgb = mix(mix(mix(uSuit, uBlack, suitBlack), uBelt, suitBelt), uBlack, suitSeam);`,
      )
      .replace(
        "#include <opaque_fragment>",
        // grey parts take the red rim, then ink where they turn away from the eye:
        // the inner contours a cel artist draws; black parts get the black finish
        `${INK_FINISH}
vec3 inkGrey = mix(outgoingLight, uRim, inkRim) * smoothstep(0.1, 0.18, inkFacing);
outgoingLight = mix(inkGrey, inkBlack, suitBlack * (1.0 - suitBelt));
#include <opaque_fragment>`,
      );
  };
  return mat;
}

/** The sculpted body: one mesh per body part, all sharing one set of vertices so the seams never show. */
function body(m: SuitMesh): THREE.Mesh[] {
  const position = new THREE.BufferAttribute(m.positions, 3);
  const normal = new THREE.BufferAttribute(m.normals, 3);

  // a triangle belongs to the part most of its corners belong to
  const byPart: number[][] = PART_NAMES.map(() => []);
  const I = m.indices;
  for (let t = 0; t < I.length; t += 3) {
    const a = m.parts[I[t]], b = m.parts[I[t + 1]], cc = m.parts[I[t + 2]];
    const p = b === cc ? b : a;
    byPart[p].push(I[t], I[t + 1], I[t + 2]);
  }

  const parts = byPart.map((idx, p) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", position);
    g.setAttribute("normal", normal);
    g.setIndex(idx);
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, suitMaterial(PART_NAMES[p]));
    mesh.userData.part = PART_NAMES[p];
    mesh.userData.body = true;
    return mesh;
  });

  // one outline round the whole body, so it never breaks where the parts meet
  const whole = new THREE.BufferGeometry();
  whole.setAttribute("position", position);
  whole.setAttribute("normal", normal);
  whole.setIndex(new THREE.BufferAttribute(m.indices, 1));
  whole.computeBoundingSphere();
  return [...parts, inked(new THREE.Mesh(whole))];
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
    flat.rotateZ(0.35 * s);
    flat.translate(0.033 * s, 1.803, 0);
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
  const cy = 1.5;
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

/** The cape, draped in the mesh worker. */
function cape(m: SuitMesh, motion: CapeMotion): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(m.cape.positions, 3));
  geo.setAttribute("drape", new THREE.BufferAttribute(m.cape.drape, 2));
  geo.setIndex(new THREE.BufferAttribute(m.cape.indices, 1));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, capeMaterial(motion));
  mesh.userData.part = "cape";
  return mesh;
}

/** The cape's springs, carried from frame to frame. */
type CapeState = { theta: number | null; time: number; twist: number; twistV: number; billow: number; billowV: number };

/**
 * Moves the cape one frame on. The camera swinging round reads as him turning,
 * so the cape answers the way cloth would: it twists against the turn, flares
 * out the faster it goes, and sways to rest once the camera stops. Two springs
 * keep it smooth, and a slow idle sway keeps it from ever hanging dead. With
 * reduced motion it hangs still.
 */
export function stepCape(fig: THREE.Group, dt: number, cameraTheta: number, motion: boolean): void {
  const { motion: u, state: s } = fig.userData.cape as { motion: CapeMotion; state: CapeState };
  const step = Math.min(dt, 0.05);
  if (!motion || step <= 0) {
    s.theta = cameraTheta;
    u.uCapeSwing.value.set(0, 0);
    return;
  }
  let spin = 0; // how fast the camera is going round, radians a second
  if (s.theta !== null) {
    const d = cameraTheta - s.theta;
    spin = (((((d + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI) / step;
  }
  s.theta = cameraTheta;
  s.time += step;
  const twistTo = Math.max(-0.1, Math.min(0.1, -spin * 0.035)) + 0.01 * Math.sin(s.time * 0.7);
  const billowTo = 0.008 + Math.min(0.035, Math.abs(spin) * 0.01);
  // a little under-damped, so it overshoots once and settles
  s.twistV += (40 * (twistTo - s.twist) - 6 * s.twistV) * step;
  s.twist += s.twistV * step;
  s.billowV += (40 * (billowTo - s.billow) - 6 * s.billowV) * step;
  s.billow += s.billowV * step;
  u.uCapeTime.value = s.time;
  u.uCapeSwing.value.set(s.twist, Math.max(0, s.billow));
}

export function buildBatFigure(m: SuitMesh): THREE.Group {
  const root = new THREE.Group();
  const capeMotion: CapeMotion = { uCapeTime: { value: 0 }, uCapeSwing: { value: new THREE.Vector2() } };
  const capeState: CapeState = { theta: null, time: 0, twist: 0, twistV: 0, billow: 0, billowV: 0 };
  root.userData.cape = { motion: capeMotion, state: capeState };
  const pieces = [...ears(), ...fins(ARMS.L), ...fins(ARMS.R)];
  for (const mesh of [...body(m), ...pieces, ...pieces.map(inked), ...eyes(), emblem(), cape(m, capeMotion)]) {
    root.add(mesh);
  }
  return root;
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
  archive: { theta: 0.15, r: 1.1, y: 1.84, target: [0, 1.78, 0.02] },
  craft: { theta: 0.75, r: 1.45, y: 1.3, target: mid(ARMS.L.E, ARMS.L.W, 0.3) },
  mirror: { theta: 2.7, r: 1.15, y: 1.92, target: [0, 1.79, -0.02] },
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

/** Each pillar's spot on the skin, where its callout ring locks on. */
export const MARKERS: Record<PillarKey, [number, number, number]> = {
  archive: onSkin([0, 1.84, 0.5], [0, 0, -1], [0, 1.84, 0.09]),
  craft: onSkin([...mid(ARMS.L.E, ARMS.L.W, 0.35)].map((v, i) => (i === 2 ? 0.5 : v)) as Vec3, [0, 0, -1], [0.45, 1.1, 0.05]),
  mirror: onSkin([0, 1.8, -0.5], [0, 0, 1], [0, 1.8, -0.1]),
  forge: onSkin([...mid(ARMS.R.S, ARMS.R.E, 0.55)].map((v, i) => (i === 2 ? 0.5 : v)) as Vec3, [0, 0, -1], [-0.27, 1.33, 0.05]),
  discipline: onSkin([...mid(ARMS.R.E, ARMS.R.W, 0.25)].map((v, i) => (i === 2 ? -0.5 : v)) as Vec3, [0, 0, 1], [-0.45, 1.12, -0.05]),
};
