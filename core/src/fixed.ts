/** Milli-units per world unit. Every position, size and speed in the simulation is an integer in milli-units. */
export const UNIT = 1000;

/** Simulation ticks per second. The simulation only ever advances in whole ticks. */
export const TICKS_PER_SECOND = 60;

/** Integer division truncating toward zero. Exact for |a|, |b| below 2^31; never returns -0. */
export function idiv(a: number, b: number): number {
  return Math.trunc(a / b) + 0;
}

/** Floor of the square root of a non-negative safe integer, using integer Newton steps only. */
export function isqrt(n: number): number {
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new RangeError(`isqrt needs a non-negative safe integer, got ${n}`);
  }
  if (n < 2) return n;
  let x = n;
  let y = Math.floor((x + 1) / 2);
  while (y < x) {
    x = y;
    y = Math.floor((x + Math.floor(n / x)) / 2);
  }
  return x;
}

/** Clamps a value into [lo, hi]. */
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
