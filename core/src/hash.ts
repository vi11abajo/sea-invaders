const TWO_32 = 4294967296;

/**
 * 64-bit non-cryptographic hash over a sequence of integers, built from two
 * 32-bit lanes with cyrb53-style mixing. Integer-only, so every engine agrees.
 */
export class Hasher {
  private h1 = 0xdeadbeef | 0;
  private h2 = 0x41c6ce57 | 0;

  /** Mixes one safe integer: its low 32 bits, then the bits above them. */
  int(v: number): this {
    this.mix(v | 0);
    this.mix(Math.floor(v / TWO_32) | 0);
    return this;
  }

  digest(): string {
    let h1 = this.h1;
    let h2 = this.h2;
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
  }

  private mix(x: number): void {
    this.h1 = Math.imul(this.h1 ^ x, 2654435761);
    this.h2 = Math.imul(this.h2 ^ x, 1597334677);
  }
}
