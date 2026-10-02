import * as THREE from "three";

/**
 * A Batman figure built in code from smooth shapes, proportioned from front,
 * side and back reference shots. Two-tone like the suit in the references:
 * grey body; black cowl, gauntlets, trunks and boots. Limbs are single
 * tapered profiles (thigh into knee into calf, deltoid into bicep into elbow)
 * so there are no ball joints, with muscle masses laid over the top — pecs,
 * abs, lats, traps, quads. Cowl ears, white eye slits, chest emblem, belt
 * with pouches, flared gauntlets with three fins, cuffed boots.
 *
 * About 1.9 units tall, feet at y = 0, facing +z. Every mesh is tagged with
 * the body part it belongs to (userData.part) so a click maps to a pillar.
 */

export type Part = "head" | "torso" | "legs" | "armL-upper" | "armL-fore" | "armR-upper" | "armR-fore" | "finsR" | "finsL";

const GREY = new THREE.MeshStandardMaterial({ color: 0x6b6f79, roughness: 0.66, metalness: 0.08 });
const BLACK = new THREE.MeshStandardMaterial({ color: 0x0f1013, roughness: 0.42, metalness: 0.38 });
const BELT = new THREE.MeshStandardMaterial({ color: 0x55585f, roughness: 0.38, metalness: 0.62 });
const JAW = new THREE.MeshStandardMaterial({ color: 0x9a9da5, roughness: 0.8, metalness: 0 });
// The eyes are unlit white, so they glow and never take the hover tint.
const EYES = new THREE.MeshBasicMaterial({ color: 0xffffff });

function mesh(geo: THREE.BufferGeometry, part: Part, mat: THREE.Material) {
  const m = new THREE.Mesh(geo, mat.clone());
  m.userData.part = part;
  return m;
}

/** A sphere squashed to an ellipsoid — the base of every muscle mass. */
function blob(rx: number, ry: number, rz: number, part: Part, mat: THREE.Material) {
  const m = mesh(new THREE.SphereGeometry(1, 40, 28), part, mat);
  m.scale.set(rx, ry, rz);
  return m;
}

/**
 * A limb or body section from a side profile: [radius, y] pairs from bottom
 * to top, spun round the y axis, then flattened front-to-back by `depth`.
 * One continuous surface, so knees and elbows taper instead of being joints.
 */
function lathe(points: Array<[number, number]>, part: Part, mat: THREE.Material, depth = 0.9) {
  const m = mesh(new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), 48), part, mat);
  m.scale.z = depth;
  return m;
}

/**
 * One fin: a flat blade with its base along the arm and its tip swept up
 * toward the elbow. Built pointing +x; the caller mirrors and angles it back.
 */
function fin(part: Part) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(0.085, 0.05);
  s.lineTo(0.02, 0.06);
  s.lineTo(0, 0.055);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.01, bevelEnabled: false });
  geo.translate(0, -0.03, -0.005);
  return mesh(geo, part, BLACK);
}

/** The chest emblem: a bat with spread, scalloped wings, as a thin raised plate. */
function emblem() {
  const s = new THREE.Shape();
  s.moveTo(0, 0.02);
  s.lineTo(0.012, 0.035); // ears
  s.lineTo(0.018, 0.022);
  s.quadraticCurveTo(0.07, 0.04, 0.13, 0.03); // top of the wing
  s.quadraticCurveTo(0.1, 0.0, 0.11, -0.025); // wing tip down
  s.quadraticCurveTo(0.085, -0.01, 0.07, -0.03); // scallops
  s.quadraticCurveTo(0.05, -0.012, 0.035, -0.035);
  s.quadraticCurveTo(0.018, -0.02, 0, -0.06); // to the tail
  s.quadraticCurveTo(-0.018, -0.02, -0.035, -0.035);
  s.quadraticCurveTo(-0.05, -0.012, -0.07, -0.03);
  s.quadraticCurveTo(-0.085, -0.01, -0.11, -0.025);
  s.quadraticCurveTo(-0.1, 0.0, -0.13, 0.03);
  s.quadraticCurveTo(-0.07, 0.04, -0.018, 0.022);
  s.lineTo(-0.012, 0.035);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.002, bevelSegments: 2 });
  return mesh(geo, "torso", BLACK);
}

/**
 * One arm, hanging from the shoulder. `side` is +1 for the figure's left
 * (screen right), -1 for its right.
 */
function arm(side: 1 | -1) {
  const upperPart: Part = side === 1 ? "armL-upper" : "armR-upper";
  const forePart: Part = side === 1 ? "armL-fore" : "armR-fore";
  const finPart: Part = side === 1 ? "finsL" : "finsR";

  const shoulder = new THREE.Group();
  shoulder.position.set(0.29 * side, 1.47, -0.01);
  shoulder.rotation.z = 0.2 * side; // held slightly out from the body

  // upper arm: deltoid cap, thick through the bicep, narrowing to the elbow
  shoulder.add(lathe([[0, -0.345], [0.055, -0.335], [0.06, -0.29], [0.067, -0.21], [0.071, -0.13], [0.078, -0.06], [0.08, -0.02], [0.06, 0.03], [0, 0.05]], upperPart, GREY, 0.95));
  const bicep = blob(0.054, 0.085, 0.05, upperPart, GREY);
  bicep.position.set(0, -0.17, 0.034);
  shoulder.add(bicep);
  const tricep = blob(0.05, 0.08, 0.044, upperPart, GREY);
  tricep.position.set(0, -0.15, -0.03);
  shoulder.add(tricep);

  const elbow = new THREE.Group();
  elbow.position.y = -0.33;
  elbow.rotation.x = 0.12; // forearm a touch forward
  elbow.rotation.z = -0.06 * side;
  shoulder.add(elbow);

  // gauntlet: black, flaring out from the wrist toward a cuff below the elbow
  elbow.add(lathe([[0, -0.3], [0.044, -0.29], [0.049, -0.26], [0.058, -0.18], [0.066, -0.1], [0.071, -0.05], [0.067, -0.02], [0.058, 0.0], [0, 0.02]], forePart, BLACK, 0.92));

  // fist: knuckles forward of a squared-off hand
  const fist = blob(0.048, 0.062, 0.055, forePart, BLACK);
  fist.position.set(0, -0.315, 0.008);
  elbow.add(fist);
  const knuckles = blob(0.042, 0.022, 0.03, forePart, BLACK);
  knuckles.position.set(0, -0.345, 0.035);
  elbow.add(knuckles);

  // three fins down the outer forearm, angled out and back
  for (let i = 0; i < 3; i++) {
    const f = fin(finPart);
    f.position.set(0.05 * side, -0.08 - i * 0.065, -0.012);
    f.scale.x = side;
    f.rotation.y = 0.45 * side;
    elbow.add(f);
  }
  return shoulder;
}

function leg(side: 1 | -1) {
  const g = new THREE.Group();
  g.position.x = 0.112 * side;
  g.rotation.z = -0.025 * side; // a slight A-stance

  // one profile from the boot top up to the hip: calf, knee, thigh
  g.add(lathe([[0, 0.3], [0.066, 0.32], [0.074, 0.38], [0.071, 0.45], [0.064, 0.52], [0.072, 0.58], [0.09, 0.68], [0.1, 0.8], [0.106, 0.9], [0.098, 0.97], [0, 1.0]], "legs", GREY, 0.92));
  const quad = blob(0.07, 0.13, 0.05, "legs", GREY);
  quad.position.set(0.004 * side, 0.76, 0.048);
  g.add(quad);
  const calf = blob(0.055, 0.085, 0.048, "legs", GREY);
  calf.position.set(0, 0.42, -0.028);
  g.add(calf);

  // boot: black, up to mid-shin, flaring to a cuff
  g.add(lathe([[0, 0.015], [0.068, 0.025], [0.071, 0.12], [0.069, 0.22], [0.076, 0.31], [0.086, 0.365], [0.081, 0.385], [0, 0.39]], "legs", BLACK, 0.95));
  const foot = blob(0.054, 0.042, 0.115, "legs", BLACK);
  foot.position.set(0, 0.04, 0.05);
  g.add(foot);
  return g;
}

export function buildBatFigure(): THREE.Group {
  const root = new THREE.Group();

  root.add(leg(1), leg(-1));

  // black trunks over the hips, under the belt
  const trunks = blob(0.178, 0.115, 0.125, "torso", BLACK);
  trunks.position.y = 0.95;
  root.add(trunks);

  // belt and its pouches, wrapped round the front and sides
  const belt = mesh(new THREE.CylinderGeometry(0.186, 0.181, 0.062, 48), "torso", BELT);
  belt.scale.z = 0.72;
  belt.position.y = 1.005;
  root.add(belt);
  for (const a of [-1.0, -0.55, 0.55, 1.0]) {
    const pouch = mesh(new THREE.BoxGeometry(0.05, 0.05, 0.026), "torso", BELT);
    pouch.position.set(Math.sin(a) * 0.186, 1.0, Math.cos(a) * 0.186 * 0.72 + 0.008);
    pouch.rotation.y = a;
    root.add(pouch);
  }

  /* Torso as one shape — the V from the waist out under the arms and back in
     over the shoulders — then the muscle laid over it. */
  root.add(lathe([[0, 0.97], [0.158, 0.97], [0.162, 1.04], [0.168, 1.12], [0.19, 1.2], [0.226, 1.29], [0.25, 1.38], [0.252, 1.44], [0.226, 1.5], [0.16, 1.55], [0.09, 1.58], [0, 1.59]], "torso", GREY, 0.6));
  for (const side of [1, -1]) {
    const pec = blob(0.106, 0.075, 0.06, "torso", GREY);
    pec.position.set(0.085 * side, 1.385, 0.084);
    pec.rotation.z = 0.12 * side;
    root.add(pec);
    const lat = blob(0.075, 0.14, 0.06, "torso", GREY);
    lat.position.set(0.17 * side, 1.29, -0.02);
    lat.rotation.z = -0.25 * side;
    root.add(lat);
    // traps: the slope from the neck out to the shoulder
    const trap = blob(0.1, 0.05, 0.07, "torso", GREY);
    trap.position.set(0.085 * side, 1.548, -0.02);
    trap.rotation.z = -0.38 * side;
    root.add(trap);
  }
  root.add(arm(1), arm(-1));

  // abs: one soft mass down the front, so the stomach reads without six bubbles
  const abs = blob(0.1, 0.13, 0.05, "torso", GREY);
  abs.position.set(0, 1.18, 0.08);
  root.add(abs);

  const bat = emblem();
  bat.position.set(0, 1.405, 0.138);
  bat.rotation.x = -0.08;
  root.add(bat);

  /* Head: the cowl flares down over the neck onto the traps, the lower face
     is exposed (a pale jaw — kept to the palette's greys), white eye slits,
     tall pointed ears. */
  root.add(lathe([[0, 1.53], [0.125, 1.535], [0.104, 1.575], [0.08, 1.62], [0.084, 1.68], [0, 1.71]], "head", BLACK, 0.86));
  const cowl = blob(0.092, 0.118, 0.102, "head", BLACK);
  cowl.position.set(0, 1.735, 0);
  root.add(cowl);
  const jaw = blob(0.056, 0.04, 0.05, "head", JAW);
  jaw.position.set(0, 1.672, 0.03);
  root.add(jaw);
  for (const side of [1, -1]) {
    const eye = blob(0.022, 0.0075, 0.01, "head", EYES);
    eye.position.set(0.033 * side, 1.75, 0.094);
    eye.rotation.z = -0.28 * side;
    root.add(eye);
    const ear = mesh(new THREE.ConeGeometry(0.024, 0.1, 20), "head", BLACK);
    ear.position.set(0.054 * side, 1.86, -0.012);
    ear.rotation.set(-0.08, 0, -0.12 * side);
    root.add(ear);
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

export const OVERVIEW: View = { theta: 0, r: 3.4, y: 1.15, target: [0, 1.0, 0] };

export const VIEWS: Record<PillarKey, View> = {
  archive: { theta: 0.15, r: 1.2, y: 1.8, target: [0, 1.7, 0.02] },
  craft: { theta: 0.9, r: 1.6, y: 1.25, target: [0.38, 1.05, 0.02] },
  mirror: { theta: 2.7, r: 1.25, y: 1.9, target: [0, 1.7, -0.02] },
  forge: { theta: -0.8, r: 1.45, y: 1.42, target: [-0.33, 1.28, 0.02] },
  discipline: { theta: -2.8, r: 1.7, y: 1.2, target: [-0.4, 1.02, -0.05] },
};

/** Glowing markers on each pillar's spot, for the overview. */
export const MARKERS: Record<PillarKey, [number, number, number]> = {
  archive: [0, 1.79, 0.1],
  craft: [0.42, 1.08, 0.072],
  mirror: [0, 1.77, -0.104],
  forge: [-0.33, 1.29, 0.09],
  discipline: [-0.46, 1.04, -0.06],
};
