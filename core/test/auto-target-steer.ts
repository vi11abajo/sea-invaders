import { SHOT, idiv, isqrt } from '../src';

/**
 * The velocity AUTO_TARGET gives a player shot whose target sits `(dx, dy)` away: the legacy blend
 * (spec C3) of 30 % of `SHOT.speed` toward the target plus 70 % straight up, so the expectations
 * follow `TUNING.octopiShotPct`.
 */
export function autoTargetSteer(dx: number, dy: number): { vx: number; vy: number } {
  const toward = idiv(SHOT.speed * 3, 10);
  const up = idiv(SHOT.speed * 7, 10);
  const len = isqrt(dx * dx + dy * dy);
  return { vx: idiv(dx * toward, len), vy: idiv(dy * toward, len) - up };
}

/** A shot's velocity, for comparing against `autoTargetSteer`. */
export function velocity(b: { vx: number; vy: number }): { vx: number; vy: number } {
  return { vx: b.vx, vy: b.vy };
}
