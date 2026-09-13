import { FIELD_W, OCTOPI, SHOT, fireIntervalFor, piercingFor } from '../config';
import { clamp, idiv, isqrt } from '../fixed';
import { icos, isin } from '../trig';
import type { Bullet, GameState, Input } from '../types';
import { isActive } from './boosts';

const HALF = idiv(OCTOPI.size, 2);
/** RAPID_FIRE's fire interval, replacing OCTOPI.fireInterval while active (spec §5.2). */
const RAPID_FIRE_INTERVAL = 4;
/** Half-angle in degrees between MULTI_SHOT's outer shots and its straight aim. */
const MULTI_SHOT_SPREAD = 15;
/** AUTO_TARGET's legacy velocity blend (spec C3): 30 % of `SHOT.speed` toward the target, 70 % up, so it follows `TUNING.octopiShotPct`. */
const AUTO_TARGET_TOWARD = idiv(SHOT.speed * 3, 10);
const AUTO_TARGET_UP = idiv(SHOT.speed * 7, 10);

function distSq(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/**
 * AUTO_TARGET's aim point for one shot (spec C3, legacy `boost-effects.js:493-546`): the nearest of
 * every crab and the boss (if present) by squared distance from the shot's current position, ties
 * broken towards a crab over the boss and towards the lower crab index; `null` with neither.
 */
function autoTargetPoint(s: GameState, b: Bullet): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestDist = Infinity;
  for (const c of s.crabs) {
    const d = distSq(b, c);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  if (s.boss) {
    const d = distSq(b, s.boss);
    if (d < bestDist) { bestDist = d; best = s.boss; }
  }
  return best;
}

/** Moves Octopi toward the target, at most OCTOPI.maxStep per axis per tick, inside its allowed area. */
export function moveOctopi(s: GameState, input: Input): void {
  const tx = clamp(input.x | 0, HALF, FIELD_W - HALF);
  const ty = clamp(input.y | 0, OCTOPI.minY, OCTOPI.maxY);
  s.octopi.x += clamp(tx - s.octopi.x, -OCTOPI.maxStep, OCTOPI.maxStep);
  s.octopi.y += clamp(ty - s.octopi.y, -OCTOPI.maxStep, OCTOPI.maxStep);
}

/**
 * Moves player shots along both `vx` and `vy` (controller ruling, Phase 3A.1 lane C fix round 1:
 * every player shot moves on both axes now, not `vy` only — this makes MULTI_SHOT's ±15° shots and
 * AUTO_TARGET's steering actually change a shot's path for the first time), drops those that left
 * the field — off the top exactly as before, or now off either side (`x` outside `[0, FIELD_W]`) —
 * steers survivors while AUTO_TARGET is active, then fires when the cooldown runs out. RAPID_FIRE
 * shortens the cooldown; MULTI_SHOT fires three shots (-15/0/+15 degrees) instead of one;
 * PIERCING_BULLETS tags every new shot's `data` with bit 1 so `hitCrabs` lets it keep flying, and
 * the trident variant (spec §4) tags it unconditionally, boost or not
 * (RICOCHET was removed from the game entirely — owner decision, Phase 3A.1 lane C — so bit 2 and
 * the old field-edge wall-bounce it drove are gone too; only bit 1 remains meaningful). AUTO_TARGET
 * fully recomputes every surviving shot's `vx`/`vy` every tick (spec C3: the legacy's fixed
 * 30%-toward/70%-up blend, not an incremental turn) towards the nearest crab or the boss; a shot
 * fired this same tick is not yet steered (it starts steering from the following tick), and a shot
 * with no target keeps its current velocity.
 * While Void Sovereign's temporal freeze is active (`s.boss.kind === 5 && effectTicks > 0`, spec
 * §4.2 row 5), shots already in flight skip this motion AND AUTO_TARGET's steering entirely —
 * `vx`/`vy` stay untouched, so they resume exactly where they left off once `effectTicks` reaches
 * 0 — but new shots still fire.
 */
export function updateShots(s: GameState): void {
  const kept: Bullet[] = [];
  const frozen = s.boss?.kind === 5 && s.boss.effectTicks > 0;
  for (const b of s.shots) {
    if (!frozen) {
      b.x += b.vx;
      b.y += b.vy;
    }
    if (b.x < 0 || b.x > FIELD_W) continue; // left the field horizontally
    if (b.y + idiv(SHOT.h, 2) > 0) kept.push(b);
  }
  s.shots = kept;
  if (isActive(s, 'AUTO_TARGET') && !frozen) {
    for (const b of s.shots) {
      const target = autoTargetPoint(s, b);
      if (!target) continue;
      const dx = target.x - b.x;
      const dy = target.y - b.y;
      const len = isqrt(dx * dx + dy * dy);
      if (len === 0) continue;
      b.vx = idiv(dx * AUTO_TARGET_TOWARD, len);
      b.vy = idiv(dy * AUTO_TARGET_TOWARD, len) - AUTO_TARGET_UP;
    }
  }
  s.octopi.cooldown -= 1;
  if (s.octopi.cooldown <= 0) {
    const x = s.octopi.x;
    const y = s.octopi.y - HALF;
    const data = (isActive(s, 'PIERCING_BULLETS') || piercingFor(s.run.octopi)) ? 1 : 0;
    if (isActive(s, 'MULTI_SHOT')) {
      for (const a of [-MULTI_SHOT_SPREAD, 0, MULTI_SHOT_SPREAD]) {
        const vx = idiv(SHOT.speed * isin(a), 1000);
        const vy = -idiv(SHOT.speed * icos(a), 1000);
        s.shots.push({ x, y, vx, vy, kind: 'straight', data });
      }
    } else {
      s.shots.push({ x, y, vx: 0, vy: -SHOT.speed, kind: 'straight', data });
    }
    s.octopi.cooldown = isActive(s, 'RAPID_FIRE') ? RAPID_FIRE_INTERVAL : fireIntervalFor(s.run.octopi);
  }
}
