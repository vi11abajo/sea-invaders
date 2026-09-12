import { FIELD_W, SHIP, SHOT } from '../config';
import { clamp, idiv } from '../fixed';
import { icos, isin } from '../trig';
import type { Bullet, GameState, Input } from '../types';
import { isActive } from './boosts';

const HALF = idiv(SHIP.size, 2);
/** RAPID_FIRE's fire interval, replacing SHIP.fireInterval while active (spec §5.2). */
const RAPID_FIRE_INTERVAL = 4;
/** Half-angle in degrees between MULTI_SHOT's outer shots and its straight aim. */
const MULTI_SHOT_SPREAD = 15;
/** AUTO_TARGET's per-tick steering: max `vx` swing towards the target, and the `vx` ceiling itself. */
const AUTO_TARGET_TURN = 60;
const AUTO_TARGET_MAX_VX = 120;

/**
 * AUTO_TARGET's aim point for one shot: the nearest crab by squared distance (ties broken by the
 * lower index), or the boss when there are no crabs; `null` with neither (spec §5.2).
 */
function autoTargetX(s: GameState, b: Bullet): number | null {
  if (s.crabs.length > 0) {
    let bestIdx = 0;
    let bestDist = distSq(b, s.crabs[0]!);
    for (let i = 1; i < s.crabs.length; i++) {
      const d = distSq(b, s.crabs[i]!);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    return s.crabs[bestIdx]!.x;
  }
  return s.boss ? s.boss.x : null;
}

function distSq(b: Bullet, p: { x: number; y: number }): number {
  const dx = p.x - b.x;
  const dy = p.y - b.y;
  return dx * dx + dy * dy;
}

/** Moves the ship toward the target, at most SHIP.maxStep per axis per tick, inside its allowed area. */
export function moveShip(s: GameState, input: Input): void {
  const tx = clamp(input.x | 0, HALF, FIELD_W - HALF);
  const ty = clamp(input.y | 0, SHIP.minY, SHIP.maxY);
  s.ship.x += clamp(tx - s.ship.x, -SHIP.maxStep, SHIP.maxStep);
  s.ship.y += clamp(ty - s.ship.y, -SHIP.maxStep, SHIP.maxStep);
}

/**
 * Moves player shots, drops those that left the field, steers survivors while AUTO_TARGET is
 * active, then fires when the cooldown runs out. RAPID_FIRE shortens the cooldown; MULTI_SHOT
 * fires three shots (-15/0/+15 degrees) instead of one; PIERCING_BULLETS tags every new shot's
 * `data` with bit 0 so `hitCrabs` lets it keep flying. AUTO_TARGET steers every existing shot's
 * `vx` towards the nearest crab (or the boss with none) by up to `AUTO_TARGET_TURN` per tick,
 * capped at `AUTO_TARGET_MAX_VX`; `vy` is untouched, and a shot fired this same tick is not yet
 * steered (it starts steering from the following tick).
 */
export function updateShots(s: GameState): void {
  const kept: Bullet[] = [];
  for (const b of s.shots) {
    b.y += b.vy;
    if (b.y + idiv(SHOT.h, 2) > 0) kept.push(b);
  }
  s.shots = kept;
  if (isActive(s, 'AUTO_TARGET')) {
    for (const b of s.shots) {
      const targetX = autoTargetX(s, b);
      if (targetX === null) continue;
      b.vx = clamp(b.vx + clamp(targetX - b.x, -AUTO_TARGET_TURN, AUTO_TARGET_TURN), -AUTO_TARGET_MAX_VX, AUTO_TARGET_MAX_VX);
    }
  }
  s.ship.cooldown -= 1;
  if (s.ship.cooldown <= 0) {
    const x = s.ship.x;
    const y = s.ship.y - HALF;
    const data = isActive(s, 'PIERCING_BULLETS') ? 1 : 0;
    if (isActive(s, 'MULTI_SHOT')) {
      for (const a of [-MULTI_SHOT_SPREAD, 0, MULTI_SHOT_SPREAD]) {
        const vx = idiv(SHOT.speed * isin(a), 1000);
        const vy = -idiv(SHOT.speed * icos(a), 1000);
        s.shots.push({ x, y, vx, vy, kind: 'straight', data });
      }
    } else {
      s.shots.push({ x, y, vx: 0, vy: -SHOT.speed, kind: 'straight', data });
    }
    s.ship.cooldown = isActive(s, 'RAPID_FIRE') ? RAPID_FIRE_INTERVAL : SHIP.fireInterval;
  }
}
