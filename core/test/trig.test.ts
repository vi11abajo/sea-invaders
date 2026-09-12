import { describe, expect, it } from 'vitest';
import { icos, isin } from '../src/trig';

describe('integer trig', () => {
  it('isin(0) is 0', () => {
    expect(isin(0)).toBe(0);
  });
  it('isin(90) is 1000', () => {
    expect(isin(90)).toBe(1000);
  });
  it('icos(180) is -1000', () => {
    expect(icos(180)).toBe(-1000);
  });
  it('isin(30) is 500', () => {
    expect(isin(30)).toBe(500);
  });
  it('isin(-90) is -1000', () => {
    expect(isin(-90)).toBe(-1000);
  });
});
