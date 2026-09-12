import { CRAB, ENEMY_SHOT, FIELD_H, FIELD_W } from '../config';
import { idiv, isqrt } from '../fixed';
import type { Bullet, GameState } from '../types';

const HALF = idiv(CRAB.size, 2);

/** A crab whose bottom edge reaches this line has invaded the reef. */
export const INVASION_Y = FIELD_H - 300;

/** Horizontal speed per tick: faster in later waves and as the formation thins out. */
export function crabSpeed(s: GameState): number {
  const killed = s.waveTotal - s.crabs.length;
  return CRAB.baseSpeed + (s.wave - 1) + idiv(killed * 8, s.waveTotal);
}

/** Marches the formation sideways; at a wall it reverses and steps down instead. Ends the run on invasion. */
export function marchCrabs(s: GameState): void {
  if (s.crabs.length === 0) return;
  const v = crabSpeed(s) * s.dir;
  let minX = s.crabs[0]!.x;
  let maxX = minX;
  for (const c of s.crabs) {
    if (c.x < minX) minX = c.x;
    if (c.x > maxX) maxX = c.x;
  }
  if (maxX + HALF + v > FIELD_W || minX - HALF + v < 0) {
    s.dir = -s.dir;
    for (const c of s.crabs) c.y += CRAB.stepDown;
  } else {
    for (const c of s.crabs) c.x += v;
  }
  for (const c of s.crabs) {
    if (c.y + HALF >= INVASION_Y) {
      s.over = true;
      return;
    }
  }
}

/** Chance per tick, in 1/1000, that some crab fires. */
export function fireChance(wave: number): number {
  return Math.min(ENEMY_SHOT.perMille + (wave - 1) * 4, 60);
}

/** Moves enemy shots and drops those off the field, then maybe fires one aimed shot from a random crab. */
export function updateEnemyShots(s: GameState): void {
  const r = ENEMY_SHOT.radius;
  const kept: Bullet[] = [];
  for (const b of s.enemyShots) {
    b.x += b.vx;
    b.y += b.vy;
    if (b.x + r > 0 && b.x - r < FIELD_W && b.y + r > 0 && b.y - r < FIELD_H) kept.push(b);
  }
  s.enemyShots = kept;
  if (s.crabs.length === 0) return;
  if (s.rngFire.nextInt(1000) >= fireChance(s.wave)) return;
  const crab = s.crabs[s.rngFire.nextInt(s.crabs.length)]!;
  const y = crab.y + HALF;
  const dx = s.ship.x - crab.x;
  const dy = s.ship.y - y;
  const len = isqrt(dx * dx + dy * dy);
  s.enemyShots.push({
    x: crab.x,
    y,
    vx: len === 0 ? 0 : idiv(dx * ENEMY_SHOT.speed, len),
    vy: len === 0 ? ENEMY_SHOT.speed : idiv(dy * ENEMY_SHOT.speed, len),
    kind: 'crab',
    data: 0,
  });
}
