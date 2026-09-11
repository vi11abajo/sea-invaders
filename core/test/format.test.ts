import { describe, expect, it } from 'vitest';
import { formatCountdown, formatInt, shortAddress } from '../src/view/format';

describe('formatInt', () => {
  it('groups thousands with commas', () => {
    expect(formatInt(18920)).toBe('18,920');
    expect(formatInt(1234567)).toBe('1,234,567');
  });

  it('leaves numbers below 1000 alone', () => {
    expect(formatInt(0)).toBe('0');
    expect(formatInt(999)).toBe('999');
  });

  it('keeps the sign and drops the fraction', () => {
    expect(formatInt(-2140)).toBe('-2,140');
    expect(formatInt(41300.7)).toBe('41,300');
  });
});

describe('formatCountdown', () => {
  it('shows hours, minutes and seconds with two digits each', () => {
    expect(formatCountdown(5 * 3600 + 12 * 60 + 44)).toBe('05:12:44');
  });

  it('shows negative time as zero', () => {
    expect(formatCountdown(-5)).toBe('00:00:00');
  });

  it('rounds partial seconds down', () => {
    expect(formatCountdown(59.9)).toBe('00:00:59');
  });

  it('keeps counting hours past 99', () => {
    expect(formatCountdown(100 * 3600)).toBe('100:00:00');
  });
});

describe('shortAddress', () => {
  it('keeps the first 4 and the last 3 characters', () => {
    expect(shortAddress('7xKpQm9vLrT2hW8sNc4yBd6fGj1eZa5uXo3fQ')).toBe('7xKp…3fQ');
  });

  it('returns strings of 8 characters or fewer unchanged', () => {
    expect(shortAddress('7xKp3fQ')).toBe('7xKp3fQ');
  });
});
