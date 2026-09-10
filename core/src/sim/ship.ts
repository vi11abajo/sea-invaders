import { FIELD_W, SHIP, SHOT } from '../config';
import { clamp, idiv } from '../fixed';
import type { Bullet, GameState, Input } from '../types';

const HALF = idiv(SHIP.size, 2);

/** Moves the ship toward the target, at most SHIP.maxStep per axis per tick, inside its allowed area. */
export function moveShip(s: GameState, input: Input): void {
  const tx = clamp(input.x | 0, HALF, FIELD_W - HALF);
  const ty = clamp(input.y | 0, SHIP.minY, SHIP.maxY);
  s.ship.x += clamp(tx - s.ship.x, -SHIP.maxStep, SHIP.maxStep);
  s.ship.y += clamp(ty - s.ship.y, -SHIP.maxStep, SHIP.maxStep);
}

/** Moves player shots, drops those that left the field, then fires when the cooldown runs out. */
export function updateShots(s: GameState): void {
  const kept: Bullet[] = [];
  for (const b of s.shots) {
    b.y += b.vy;
    if (b.y + idiv(SHOT.h, 2) > 0) kept.push(b);
  }
  s.shots = kept;
  s.ship.cooldown -= 1;
  if (s.ship.cooldown <= 0) {
    s.shots.push({ x: s.ship.x, y: s.ship.y - HALF, vx: 0, vy: -SHOT.speed });
    s.ship.cooldown = SHIP.fireInterval;
  }
}
