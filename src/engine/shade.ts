/**
 * Level-up colour escalates with the level reached: deep crimson low down,
 * hot red high up, so no two nearby level-ups flash the same flat colour.
 * Ported from legacy/index.html levelShade().
 */
export function levelShade(level: number): string {
  const t = Math.min(1, Math.max(0, (level - 1) / 16));
  const hue = (352 + t * 10) % 360;
  const sat = 70 + t * 25;
  const light = 38 + t * 30;
  return `hsl(${hue.toFixed(0)} ${sat.toFixed(0)}% ${light.toFixed(0)}%)`;
}

/** The same ramp as hue/sat/light numbers, so tests can assert on it directly. */
export function levelShadeHsl(level: number): { hue: number; sat: number; light: number } {
  const t = Math.min(1, Math.max(0, (level - 1) / 16));
  return {
    hue: Number(((352 + t * 10) % 360).toFixed(0)),
    sat: Number((70 + t * 25).toFixed(0)),
    light: Number((38 + t * 30).toFixed(0)),
  };
}
