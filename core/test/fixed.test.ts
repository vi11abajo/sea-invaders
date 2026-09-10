import { describe, expect, it } from 'vitest';
import { clamp, idiv, isqrt } from '../src';

describe('isqrt', () => {
  it('returns the floor of the square root', () => {
    const cases: Array<[number, number]> = [
      [0, 0], [1, 1], [2, 1], [3, 1], [4, 2], [15, 3], [16, 4], [17, 4], [99, 9], [100, 10],
      [1_000_000_000_000, 1_000_000],
    ];
    for (const [n, root] of cases) expect(isqrt(n)).toBe(root);
  });

  it('matches the definition across a range', () => {
    for (let n = 0; n < 20_000; n += 7) {
      const r = isqrt(n);
      expect(r * r <= n && (r + 1) * (r + 1) > n).toBe(true);
    }
  });

  it('rejects negative and fractional input', () => {
    expect(() => isqrt(-1)).toThrow(RangeError);
    expect(() => isqrt(2.5)).toThrow(RangeError);
  });
});

describe('idiv', () => {
  it('truncates toward zero', () => {
    expect(idiv(7, 2)).toBe(3);
    expect(idiv(-7, 2)).toBe(-3);
    expect(idiv(6, 3)).toBe(2);
  });

  it('never returns negative zero', () => {
    expect(Object.is(idiv(-1, 2), 0)).toBe(true);
  });
});

describe('clamp', () => {
  it('limits a value to the range', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});
