import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { contrastRatio, extractHexColors, hexToHsl, isRedFamily } from "../../src/engine/color";
import { levelShadeHsl } from "../../src/engine/shade";
import { APPROVED_PALETTE, DEFAULT_CONFIG, SURFACES } from "../../src/engine/config";

/**
 * Design guards. The design system is data, so it can be asserted like any other
 * data — no browser, no screenshots, no Playwright. These run in milliseconds
 * and fail the build the moment someone drops an off-brand colour in.
 *
 * WCAG floors used:
 *   4.5:1  small text (under 18px, or under 14px bold)
 *   3.0:1  large text (18px+ / 14px+ bold) and non-text UI components
 */
const AA_SMALL = 4.5;
const AA_LARGE = 3.0;

const tokensCss = readFileSync(resolve(__dirname, "../../src/styles/tokens.css"), "utf8");
const approved = new Set<string>(APPROVED_PALETTE.map((c) => c.toLowerCase()));

describe("Palette discipline", () => {
  it("every colour in tokens.css is on the approved red/black/grey/white list", () => {
    const offenders = extractHexColors(tokensCss).filter((c) => !approved.has(c));
    expect(offenders, `off-brand colours in tokens.css: ${offenders.join(", ")}`).toEqual([]);
  });

  it("no colour in the palette is a green, blue or yellow", () => {
    for (const hex of APPROVED_PALETTE) {
      const [hue, sat] = hexToHsl(hex);
      const isNeutral = sat < 0.18;
      expect(
        isNeutral || isRedFamily(hue),
        `${hex} has hue ${hue.toFixed(0)} at ${(sat * 100).toFixed(0)}% saturation — not red, not neutral`,
      ).toBe(true);
    }
  });

  it("every pillar accent is on the approved list", () => {
    for (const p of DEFAULT_CONFIG.pillars) {
      expect(approved.has(p.accent.toLowerCase()), `${p.name} uses ${p.accent}`).toBe(true);
    }
  });
});

describe("Rank aura legibility", () => {
  // The aura paints the 30px rank title and the progress bar fill, so the
  // large-text / UI-component floor of 3:1 is the bar it has to clear.
  it.each(DEFAULT_CONFIG.ranks.map((r) => [r.title, r.aura] as const))(
    "tier aura %s (%s) clears 3:1 against the panel",
    (_title, aura) => {
      expect(contrastRatio(aura, SURFACES.panel)).toBeGreaterThanOrEqual(AA_LARGE);
    },
  );

  it("also clears 3:1 against the page background", () => {
    for (const r of DEFAULT_CONFIG.ranks) {
      expect(contrastRatio(r.aura, SURFACES.bg), `${r.title} ${r.aura}`).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it("gets strictly brighter every tier, so rank always reads as progress", () => {
    const ramp = DEFAULT_CONFIG.ranks.map((r) => contrastRatio(r.aura, SURFACES.panel));
    for (let i = 1; i < ramp.length; i++) {
      expect(
        ramp[i],
        `tier ${i} (${DEFAULT_CONFIG.ranks[i].title}) is dimmer than tier ${i - 1}`,
      ).toBeGreaterThan(ramp[i - 1]);
    }
  });

  it("the top rank is the brightest thing in the app", () => {
    const top = DEFAULT_CONFIG.ranks[DEFAULT_CONFIG.ranks.length - 1];
    expect(contrastRatio(top.aura, SURFACES.panel)).toBeGreaterThan(15);
  });
});

describe("Text legibility", () => {
  const textTokens: Array<[string, string, number]> = [
    ["--text", "#edeef2", AA_SMALL],
    ["--muted", "#8a8e99", AA_SMALL],
    ["--muted-2", "#787c8a", AA_SMALL],
    ["--accent", "#ff2537", AA_SMALL],
    ["--danger", "#ff5563", AA_SMALL],
    ["--steel", "#c7ccd6", AA_SMALL],
  ];

  it.each(textTokens)("%s (%s) is readable on the panel", (_name, hex, floor) => {
    expect(contrastRatio(hex, SURFACES.panel)).toBeGreaterThanOrEqual(floor);
  });
});

describe("Level-up shade ramp", () => {
  it("never leaves the red family across 40 levels", () => {
    for (let lv = 1; lv <= 40; lv++) {
      const { hue } = levelShadeHsl(lv);
      expect(isRedFamily(hue), `level ${lv} produced hue ${hue}`).toBe(true);
    }
  });

  it("gets brighter as you climb, then plateaus instead of blowing out to white", () => {
    const lights = Array.from({ length: 40 }, (_, i) => levelShadeHsl(i + 1).light);
    for (let i = 1; i < lights.length; i++) {
      expect(lights[i]).toBeGreaterThanOrEqual(lights[i - 1]);
    }
    expect(Math.max(...lights)).toBeLessThanOrEqual(70);
  });

  it("stays saturated enough to read as red, never washes to grey", () => {
    for (let lv = 1; lv <= 40; lv++) {
      expect(levelShadeHsl(lv).sat).toBeGreaterThanOrEqual(65);
    }
  });
});
