/**
 * Colour maths for the design guards. Pure functions over hex strings, so the
 * design system can be asserted in unit tests with no browser and no screenshots.
 */

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const h = hex.trim().replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`hexToRgb: not a hex colour "${hex}"`);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb;
}

export function rgbToHex([r, g, b]: Rgb): string {
  return "#" + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");
}

/** WCAG 2.1 relative luminance. */
export function relativeLuminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio, 1:1 to 21:1. Order of arguments does not matter. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(hexToRgb(a));
  const lb = relativeLuminance(hexToRgb(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Hue in degrees, saturation and lightness as 0-1. */
export function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255) as Rgb;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d !== 0) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (mx + mn) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return [h, s, l];
}

/** True when a hue sits in the red family the brand allows (352deg through 10deg). */
export function isRedFamily(hue: number): boolean {
  const h = ((hue % 360) + 360) % 360;
  return h >= 345 || h <= 12;
}

/**
 * Pull every #rrggbb / #rgb literal a stylesheet actually paints with, lowercased
 * and expanded. Comments are stripped first — a hex quoted in a note about why a
 * colour changed is documentation, not a colour in use.
 */
export function extractHexColors(css: string): string[] {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out = new Set<string>();
  for (const m of code.matchAll(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g)) {
    out.add(rgbToHex(hexToRgb(m[0])).toLowerCase());
  }
  return [...out];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
