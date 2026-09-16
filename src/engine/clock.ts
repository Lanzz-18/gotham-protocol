/**
 * Every time-dependent engine function takes a Clock instead of calling Date.now().
 * That is what makes the streak and decay logic testable at any date without
 * mocking globals.
 */
export interface Clock {
  now(): number;
}

export const systemClock: Clock = {
  now: () => Date.now(),
};

/** A clock frozen at one instant. Accepts an ISO string, Date, or epoch ms. */
export function fixedClock(at: string | Date | number): Clock {
  const t = at instanceof Date ? at.getTime() : typeof at === "number" ? at : new Date(at).getTime();
  if (!Number.isFinite(t)) throw new Error(`fixedClock: unparseable time "${String(at)}"`);
  return { now: () => t };
}

/** A clock you can wind forward, for simulating a run of days. */
export function mutableClock(start: string | Date | number) {
  let t = fixedClock(start).now();
  return {
    now: () => t,
    advanceDays(n: number) {
      const d = new Date(t);
      d.setDate(d.getDate() + n);
      t = d.getTime();
      return this;
    },
    advanceHours(n: number) {
      t += n * 3_600_000;
      return this;
    },
  };
}
