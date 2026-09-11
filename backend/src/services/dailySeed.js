import { createHmac } from 'node:crypto';

// Day and week arithmetic shared with the on-chain program (spec §5.1). All times are Unix seconds.
export const DAY_SECONDS = 86400;
export const GRACE_SECONDS = 900;

export function dayOf(unixSeconds) {
  return Math.floor(unixSeconds / DAY_SECONDS);
}

export function dayStart(day) {
  return day * DAY_SECONDS;
}

/** 1970-01-01 was a Thursday, so shifting by 3 days makes weeks start on Monday. */
export function weekOf(day) {
  return Math.floor((day + 3) / 7);
}

/** Monday = 0 ... Sunday = 6. */
export function weekdayOf(day) {
  return (day + 3) % 7;
}

/** A run for `day` is accepted during the day and for GRACE_SECONDS after it. */
export function isDayOpen(day, unixSeconds) {
  return unixSeconds >= dayStart(day) && unixSeconds < dayStart(day + 1) + GRACE_SECONDS;
}

/** The seed becomes public once nobody can submit a run for that day any more. */
export function isSeedPublic(day, unixSeconds) {
  return unixSeconds >= dayStart(day + 1) + GRACE_SECONDS;
}

export function secondsToNextDay(unixSeconds) {
  return dayStart(dayOf(unixSeconds) + 1) - unixSeconds;
}

/** HMAC-SHA256(secret, "daily:<day>") as 64 hex chars — unpredictable until published. */
export function dailySeed(secret, day) {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error('DAILY_SEED_SECRET must be at least 32 characters');
  }
  return createHmac('sha256', secret).update(`daily:${day}`).digest('hex');
}
