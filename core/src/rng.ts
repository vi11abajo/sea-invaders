/**
 * Seeded PRNG built only from 32-bit integer operations, so it gives identical
 * sequences on every JavaScript engine. cyrb128 turns a seed string into
 * 128 bits of state; sfc32 generates the sequence.
 */
export function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

const TWO_32 = 0x100000000;

/** sfc32 generator with public state so the game state hash can include it. */
export class Rng {
  a: number;
  b: number;
  c: number;
  d: number;

  constructor(seed: string) {
    const [a, b, c, d] = cyrb128(seed);
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    // Discard early outputs so that similar seeds diverge.
    for (let i = 0; i < 15; i++) this.nextU32();
  }

  /** Next value in [0, 2^32). */
  nextU32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Uniform integer in [0, n). Rejection sampling keeps it unbiased. */
  nextInt(n: number): number {
    if (!Number.isInteger(n) || n < 1 || n > TWO_32) {
      throw new RangeError(`nextInt needs an integer bound in [1, 2^32], got ${n}`);
    }
    const limit = TWO_32 - (TWO_32 % n);
    let x = this.nextU32();
    while (x >= limit) x = this.nextU32();
    return x % n;
  }
}
