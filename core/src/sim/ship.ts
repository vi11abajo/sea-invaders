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

/** Moves the ship toward the target, at most SHIP.maxStep per axis per tick, inside its allowed area. */
export function moveShip(s: GameState, input: Input): void {
  const tx = clamp(input.x | 0, HALF, FIELD_W - HALF);
  const ty = clamp(input.y | 0, SHIP.minY, SHIP.maxY);
  s.ship.x += clamp(tx - s.ship.x, -SHIP.maxStep, SHIP.maxStep);
  s.ship.y += clamp(ty - s.ship.y, -SHIP.maxStep, SHIP.maxStep);
}

/**
 * Moves player shots, drops those that left the field, then fires when the cooldown runs out.
 * RAPID_FIRE shortens the cooldown; MULTI_SHOT fires three shots (-15/0/+15 degrees) instead of
 * one; PIERCING_BULLETS tags every new shot's `data` with bit 0 so `hitCrabs` lets it keep flying.
 */
export function updateShots(s: GameState): void {
  const kept: Bullet[] = [];
  for (const b of s.shots) {
    b.y += b.vy;
    if (b.y + idiv(SHOT.h, 2) > 0) kept.push(b);
  }
  s.shots = kept;
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
