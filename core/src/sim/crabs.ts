import { CRAB, DIVER, ENEMY_SHOT, FANNER_SPREAD, FIELD_H, FIELD_W } from '../config';
import { idiv, isqrt } from '../fixed';
import { icos, isin } from '../trig';
import type { Bullet, Crab, GameState } from '../types';

const HALF = idiv(CRAB.size, 2);

/** A crab whose bottom edge reaches this line has invaded the reef. */
export const INVASION_Y = FIELD_H - 300;

/** Horizontal speed per tick: faster in later waves and as the formation thins out. */
export function crabSpeed(s: GameState): number {
  const killed = s.waveTotal - s.crabs.length;
  return CRAB.baseSpeed + (s.wave - 1) + idiv(killed * 8, s.waveTotal);
}

/** This crab's own signed horizontal step: swift crabs move 1.5x the shared formation speed. */
export function crabSpeedFor(s: GameState, c: Crab): number {
  const v = crabSpeed(s) * s.dir;
  return c.type === 'swift' ? v + idiv(v, 2) : v;
}

/** Every DIVER.interval ticks, sends one diver-type crab still in formation on a dive. */
function triggerDiver(s: GameState): void {
  if (s.tick === 0 || s.tick % DIVER.interval !== 0) return;
  const candidates = s.crabs.filter((c) => c.type === 'diver' && c.dive === 0);
  if (candidates.length === 0) return;
  candidates[s.rngWaves.nextInt(candidates.length)]!.dive = DIVER.ticks;
}

/** Moves crabs currently diving one step towards the ship; snaps back to their formation slot when the dive ends. */
function advanceDivers(s: GameState): void {
  for (const c of s.crabs) {
    if (c.dive === 0) continue;
    if (c.dive === 1) {
      c.x = c.homeX;
      c.y = c.homeY;
      c.dive = 0;
      continue;
    }
    const dx = s.ship.x - c.x;
    const dy = s.ship.y - c.y;
    const len = isqrt(dx * dx + dy * dy);
    if (len > 0) {
      c.x += idiv(dx * DIVER.speed, len);
      c.y += idiv(dy * DIVER.speed, len);
    }
    c.dive -= 1;
  }
}

/**
 * Marches the formation sideways; at a wall it reverses and steps down instead. Swift crabs cover
 * extra ground on their own, and the wall check honours that extent too. Crabs mid-dive skip the
 * march (advanceDivers moves them instead), but their formation slot keeps tracking the group so
 * they return to the right place. Ends the run on invasion.
 */
export function marchCrabs(s: GameState): void {
  if (s.crabs.length === 0) return;
  advanceDivers(s);
  const v = crabSpeed(s) * s.dir;
  const formation = s.crabs.filter((c) => c.dive === 0);
  if (formation.length > 0) {
    let hitsWall = false;
    for (const c of formation) {
      const nx = c.x + crabSpeedFor(s, c);
      if (nx + HALF > FIELD_W || nx - HALF < 0) {
        hitsWall = true;
        break;
      }
    }
    if (hitsWall) {
      s.dir = -s.dir;
      for (const c of s.crabs) {
        if (c.dive === 0) c.y += CRAB.stepDown;
        else c.homeY += CRAB.stepDown;
      }
    } else {
      for (const c of s.crabs) {
        if (c.dive === 0) c.x += crabSpeedFor(s, c);
        else c.homeX += v;
      }
    }
  }
  triggerDiver(s);
  for (const c of s.crabs) {
    if (c.dive === 0 && c.y + HALF >= INVASION_Y) {
      s.over = true;
      return;
    }
  }
}

/** Chance per tick, in 1/1000, that some crab fires. */
export function fireChance(wave: number): number {
  return Math.min(ENEMY_SHOT.perMille + (wave - 1) * 4, 60);
}

/** Moves enemy shots and drops those off the field, then maybe fires from a random crab: one aimed shot, or three fanned out for a `fanner`. */
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
  const vx = len === 0 ? 0 : idiv(dx * ENEMY_SHOT.speed, len);
  const vy = len === 0 ? ENEMY_SHOT.speed : idiv(dy * ENEMY_SHOT.speed, len);
  if (crab.type === 'fanner') {
    for (const a of [-FANNER_SPREAD, 0, FANNER_SPREAD]) {
      const rvx = idiv(vx * icos(a) - vy * isin(a), 1000);
      const rvy = idiv(vx * isin(a) + vy * icos(a), 1000);
      s.enemyShots.push({ x: crab.x, y, vx: rvx, vy: rvy, kind: 'crab', data: 0 });
    }
    return;
  }
  s.enemyShots.push({ x: crab.x, y, vx, vy, kind: 'crab', data: 0 });
}
