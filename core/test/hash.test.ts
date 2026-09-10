import { describe, expect, it } from 'vitest';
import { Hasher } from '../src';

const h = (...values: number[]) => values.reduce((acc, v) => acc.int(v), new Hasher()).digest();

describe('Hasher', () => {
  it('is deterministic, order-sensitive and 16 hex chars', () => {
    expect(h(1, 2)).toBe(h(1, 2));
    expect(h(1, 2)).not.toBe(h(2, 1));
    expect(h(1, 2)).toMatch(/^[0-9a-f]{16}$/);
  });

  it('distinguishes values beyond 32 bits and negative values', () => {
    expect(h(1)).not.toBe(h(1 + 2 ** 32));
    expect(h(-1)).not.toBe(h(0xffffffff));
  });

  it('treats -0 and 0 the same', () => {
    expect(h(-0)).toBe(h(0));
  });

  it('distinguishes an empty hash from a zero', () => {
    expect(new Hasher().digest()).not.toBe(h(0));
  });
});
