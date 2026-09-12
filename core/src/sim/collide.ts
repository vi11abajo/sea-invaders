import { CRAB, CRAB_TYPES, ENEMY_SHOT, SHIP, SHOT } from '../config';
import { clamp, idiv } from '../fixed';
import type { Bullet, GameState } from '../types';
import { rollDrop } from './boosts';

const CRAB_HALF = idiv(CRAB.size, 2);

/** Each player shot hits the first crab it overlaps; a kill (hp reaches 0) scores the type's points × wave. */
export function hitCrabs(s: GameState): void {
  const kept: Bullet[] = [];
  for (const b of s.shots) {
    const i = s.crabs.findIndex(
      (c) => Math.abs(b.x - c.x) * 2 < SHOT.w + CRAB.size && Math.abs(b.y - c.y) * 2 < SHOT.h + CRAB.size,
    );
    if (i < 0) {
      kept.push(b);
      continue;
    }
    const c = s.crabs[i]!;
    c.hp -= 1;
    if (c.hp <= 0) {
      s.crabs.splice(i, 1);
      rollDrop(s, c.x, c.y);
      s.score += CRAB_TYPES[c.type].points * s.wave;
      s.kills += 1;
    }
  }
  s.shots = kept;
}

/** Enemy shots and crab bodies hurt the ship unless it is invulnerable. A crab that touches the ship dies without score. */
export function hitShip(s: GameState): void {
  if (s.ship.invuln > 0 || s.over) return;
  const { x, y } = s.ship;
  const reach = SHIP.hitRadius + ENEMY_SHOT.radius;
  for (const b of s.enemyShots) {
    const dx = b.x - x;
    const dy = b.y - y;
    if (dx * dx + dy * dy < reach * reach) {
      loseLife(s);
      return;
    }
  }
  const r2 = SHIP.hitRadius * SHIP.hitRadius;
  for (let i = 0; i < s.crabs.length; i++) {
    const c = s.crabs[i]!;
    const dx = x - clamp(x, c.x - CRAB_HALF, c.x + CRAB_HALF);
    const dy = y - clamp(y, c.y - CRAB_HALF, c.y + CRAB_HALF);
    if (dx * dx + dy * dy < r2) {
      s.crabs.splice(i, 1);
      loseLife(s);
      return;
    }
  }
}

export function loseLife(s: GameState): void {
  s.ship.lives -= 1;
  s.ship.invuln = SHIP.invulnTicks;
  s.enemyShots = [];
  if (s.ship.lives <= 0) s.over = true;
}
