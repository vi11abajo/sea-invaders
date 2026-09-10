import { describe, expect, it } from 'vitest';
import { cyrb128, Rng } from '../src';

describe('cyrb128', () => {
  it('is stable for equal input and differs for different input', () => {
    expect(cyrb128('abc')).toEqual(cyrb128('abc'));
    expect(cyrb128('abc')).not.toEqual(cyrb128('abd'));
    for (const word of cyrb128('seed')) {
      expect(Number.isInteger(word) && word >= 0 && word <= 0xffffffff).toBe(true);
    }
  });
});

describe('Rng', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = new Rng('day-1/waves');
    const b = new Rng('day-1/waves');
    for (let i = 0; i < 1000; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it('gives independent sequences per stream name', () => {
    const a = new Rng('day-1/waves');
    const b = new Rng('day-1/fire');
    const sa = Array.from({ length: 8 }, () => a.nextU32());
    const sb = Array.from({ length: 8 }, () => b.nextU32());
    expect(sa).not.toEqual(sb);
  });

  it('returns unsigned 32-bit integers', () => {
    const r = new Rng('range');
    for (let i = 0; i < 1000; i++) {
      const v = r.nextU32();
      expect(Number.isInteger(v) && v >= 0 && v <= 0xffffffff).toBe(true);
    }
  });

  it('keeps nextInt inside the bound and reaches every value', () => {
    const r = new Rng('bounds');
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const v = r.nextInt(7);
      expect(Number.isInteger(v) && v >= 0 && v < 7).toBe(true);
      seen.add(v);
    }
    expect(seen.size).toBe(7);
  });

  it('rejects bad bounds', () => {
    const r = new Rng('x');
    expect(() => r.nextInt(0)).toThrow(RangeError);
    expect(() => r.nextInt(1.5)).toThrow(RangeError);
    expect(() => r.nextInt(2 ** 32 + 1)).toThrow(RangeError);
  });
});
