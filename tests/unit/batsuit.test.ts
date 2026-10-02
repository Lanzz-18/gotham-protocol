import { describe, expect, it } from "vitest";

import { MARKERS, PILLAR_PARTS, VIEWS, pillarFor } from "../../src/fx/batFigure";
import { DEFAULT_CONFIG } from "../../src/engine/config";

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
