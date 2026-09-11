import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  DAY_SECONDS, GRACE_SECONDS, dailySeed, dayOf, dayStart, isDayOpen, isSeedPublic, secondsToNextDay, weekOf, weekdayOf,
} from '../src/services/dailySeed.js';

const SECRET = 'x'.repeat(48);
const utc = (y, m, d, h = 0) => Date.UTC(y, m - 1, d, h) / 1000;

describe('day arithmetic', () => {
  it('maps a timestamp to its UTC day and back', () => {
    const t = utc(2026, 9, 11, 12);
    expect(dayOf(t)).toBe(Math.floor(t / DAY_SECONDS));
    expect(dayStart(dayOf(t))).toBe(utc(2026, 9, 11));
  });

  it('weekday is Monday-based and weeks change on Monday', () => {
    for (const [y, m, d] of [[2026, 9, 7], [2026, 9, 11], [2026, 9, 13], [2026, 9, 14]]) {
      const day = dayOf(utc(y, m, d));
      const jsDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // Sunday = 0
      expect(weekdayOf(day)).toBe((jsDay + 6) % 7);
    }
    expect(weekOf(dayOf(utc(2026, 9, 13)))).toBe(weekOf(dayOf(utc(2026, 9, 7))));
    expect(weekOf(dayOf(utc(2026, 9, 14)))).toBe(weekOf(dayOf(utc(2026, 9, 7))) + 1);
  });

  it('keeps a day open for 15 minutes after midnight', () => {
    const day = dayOf(utc(2026, 9, 11));
    expect(isDayOpen(day, utc(2026, 9, 11, 23))).toBe(true);
    expect(isDayOpen(day, dayStart(day + 1) + GRACE_SECONDS - 1)).toBe(true);
    expect(isDayOpen(day, dayStart(day + 1) + GRACE_SECONDS)).toBe(false);
    expect(isDayOpen(day, dayStart(day) - 1)).toBe(false);
  });

  it('publishes the seed only after the window closes', () => {
    const day = dayOf(utc(2026, 9, 11));
    expect(isSeedPublic(day, dayStart(day + 1) + GRACE_SECONDS - 1)).toBe(false);
    expect(isSeedPublic(day, dayStart(day + 1) + GRACE_SECONDS)).toBe(true);
  });

  it('counts the seconds to the next UTC midnight', () => {
    expect(secondsToNextDay(utc(2026, 9, 11, 23))).toBe(3600);
    expect(secondsToNextDay(utc(2026, 9, 11))).toBe(DAY_SECONDS);
  });
});

describe('dailySeed', () => {
  it('is a deterministic 64-char hex HMAC over "daily:<day>"', () => {
    const seed = dailySeed(SECRET, 20707);
    expect(seed).toMatch(/^[0-9a-f]{64}$/);
    expect(seed).toBe(dailySeed(SECRET, 20707));
    expect(seed).toBe(createHmac('sha256', SECRET).update('daily:20707').digest('hex'));
    expect(dailySeed(SECRET, 20708)).not.toBe(seed);
    expect(dailySeed(`${SECRET}y`, 20707)).not.toBe(seed);
  });

  it('rejects a short secret', () => {
    expect(() => dailySeed('short', 1)).toThrow(/32/);
  });
});
