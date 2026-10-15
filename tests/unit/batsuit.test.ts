import { describe, expect, it } from "vitest";

import { MARKERS, PILLAR_PARTS, VIEWS, pillarFor } from "../../src/fx/batFigure";
import { DEFAULT_CONFIG } from "../../src/engine/config";
import { ARMS, GLOW_PARTS, PART_NAMES, meshSuit } from "../../src/fx/suitSdf";

describe("Batsuit body parts → pillars", () => {
  it("front of the head is THE ARCHIVE, back of the head is THE MIRROR", () => {
    expect(pillarFor("head", 0.05)).toBe("archive");
    expect(pillarFor("head", -0.05)).toBe("mirror");
  });

  it("arm is THE CRAFT, bicep THE FORGE, back of the arm DISCIPLINE", () => {
    expect(pillarFor("armL-fore", 0)).toBe("craft");
    expect(pillarFor("armL-upper", 0)).toBe("craft");
    expect(pillarFor("armR-upper", 0)).toBe("forge");
    expect(pillarFor("armR-fore", 0)).toBe("discipline");
    expect(pillarFor("finsR", 0)).toBe("discipline");
  });

  it("the body itself isn't a pillar", () => {
    expect(pillarFor("torso", 0)).toBeNull();
    expect(pillarFor("legs", 0)).toBeNull();
    expect(pillarFor(undefined, 0)).toBeNull();
  });

  it("every default pillar has a camera view, a marker and parts to light", () => {
    for (const p of DEFAULT_CONFIG.pillars) {
      const k = p.id as keyof typeof VIEWS;
      expect(VIEWS[k], p.id).toBeTruthy();
      expect(MARKERS[k], p.id).toBeTruthy();
      expect(PILLAR_PARTS[k].length, p.id).toBeGreaterThan(0);
    }
  });

  it("the back views really are behind him", () => {
    expect(Math.abs(VIEWS.mirror.theta)).toBeGreaterThan(Math.PI / 2);
    expect(Math.abs(VIEWS.discipline.theta)).toBeGreaterThan(Math.PI / 2);
    expect(Math.abs(VIEWS.archive.theta)).toBeLessThan(Math.PI / 2);
  });
});

describe("The sculpted Batsuit mesh", () => {
  // a coarse grid keeps this quick; the app meshes at 6.5mm
  const m = meshSuit(0.014);
  const count = m.positions.length / 3;

  it("is a closed, outward-facing skin about 1.9 tall", () => {
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < count; i++) {
      minY = Math.min(minY, m.positions[i * 3 + 1]);
      maxY = Math.max(maxY, m.positions[i * 3 + 1]);
    }
    expect(minY).toBeGreaterThan(-0.01);
    expect(maxY).toBeGreaterThan(1.85);
    expect(maxY).toBeLessThan(1.95);

    // every triangle's winding agrees with the field's outward normal
    let outward = 0;
    const P = m.positions, N = m.normals, I = m.indices;
    for (let t = 0; t < I.length; t += 3) {
      const [a, b, c] = [I[t] * 3, I[t + 1] * 3, I[t + 2] * 3];
      const u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]];
      const v = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      if (n[0] * N[a] + n[1] * N[a + 1] + n[2] * N[a + 2] > 0) outward++;
    }
    expect(outward / (I.length / 3)).toBeGreaterThan(0.99);
  });

  it("tags every body part, so each pillar has something to click", () => {
    const seen = new Set(m.parts);
    for (let p = 0; p < PART_NAMES.length; p++) expect(seen.has(p), PART_NAMES[p]).toBe(true);
    expect(m.ao.length).toBe(count);
    expect(Math.min(...m.ao)).toBeGreaterThan(0); // creases darken, nothing goes fully black
    expect(Math.max(...m.ao)).toBeLessThanOrEqual(1);
  });

  it("lights the head from the jaw up, softly, and never the chest", () => {
    const n = GLOW_PARTS.length;
    let crown = Infinity, chest = 0;
    for (let i = 0; i < count; i++) {
      const y = m.positions[i * 3 + 1], x = m.positions[i * 3], z = m.positions[i * 3 + 2];
      const head = m.glow[i * n];
      if (y > 1.8 && Math.abs(x) < 0.06) crown = Math.min(crown, head);
      if (y < 1.45 && Math.abs(x) < 0.06 && z > 0) chest = Math.max(chest, head);
    }
    expect(crown).toBeGreaterThan(0.9);
    expect(chest).toBeLessThan(0.01);
  });

  it("the arms and head are where the camera views expect them", () => {
    expect(ARMS.L.S[0]).toBeGreaterThan(0);
    expect(ARMS.R.S[0]).toBeLessThan(0);
    expect(MARKERS.archive[2]).toBeGreaterThan(0.05); // on the face, in front
    expect(MARKERS.mirror[2]).toBeLessThan(-0.05); // on the back of the cowl
  });
});
