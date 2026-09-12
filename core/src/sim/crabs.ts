import { CRAB, DIVER, ENEMY_SHOT, FANNER_SPREAD, FIELD_H, FIELD_W } from '../config';
import { idiv, isqrt } from '../fixed';
import { icos, isin } from '../trig';
import type { Bullet, Crab, GameState } from '../types';
import { bossImmuneToSlowdown, chilled, tamed } from './boosts';
import { shotRadius } from './collide';

const HALF = idiv(CRAB.size, 2);

/** A crab whose bottom edge reaches this line has invaded the reef. */
export const INVASION_Y = FIELD_H - 300;

/** Horizontal speed per tick: faster in later waves, as the formation thins out, by the level's reef, and slowed by SPEED_TAMER's stacks. */
export function crabSpeed(s: GameState): number {
  const killed = s.waveTotal - s.crabs.length;
  const v = CRAB.baseSpeed + (s.wave - 1) + idiv(killed * 8, s.waveTotal) + (s.run.level?.speedOffset ?? 0);
  return tamed(s, v);
}

/** This crab's own signed horizontal step: swift crabs move 1.5x the shared formation speed. */
export function crabSpeedFor(s: GameState, c: Crab): number {
  const v = crabSpeed(s) * s.dir;
  return c.type === 'swift' ? v + idiv(v, 2) : v;
}

/** This crab's actual per-tick march displacement: `crabSpeedFor` halved by ICE_FREEZE (spec §5.2), used consistently by the wall check and the step itself so the two never disagree. */
function crabStep(s: GameState, c: Crab): number {
  return chilled(s, crabSpeedFor(s, c), false);
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
      const speed = chilled(s, DIVER.speed, false);
      c.x += idiv(dx * speed, len);
      c.y += idiv(dy * speed, len);
    }
    c.dive -= 1;
  }
}

/**
 * Marches the formation sideways; at a wall it reverses and steps down instead. Swift crabs cover
 * extra ground on their own, and the wall check honours that extent too. The march always applies
 * to every crab's formation slot — a diving crab's `(homeX, homeY)` for a crab that's away, its
 * actual `(x, y)` otherwise — so the slot keeps tracking the group even when every crab is diving.
 * `advanceDivers` runs after, so a crab whose dive ends this tick snaps to its already-moved slot
 * and isn't marched again in the same tick. Ends the run on invasion.
 */
export function marchCrabs(s: GameState): void {
  if (s.crabs.length === 0) return;
  let hitsWall = false;
  for (const c of s.crabs) {
    const slotX = c.dive === 0 ? c.x : c.homeX;
    const nx = slotX + crabStep(s, c);
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
      if (c.dive === 0) c.x += crabStep(s, c);
      else c.homeX += crabStep(s, c);
    }
  }
  advanceDivers(s);
  triggerDiver(s);
  for (const c of s.crabs) {
    if (c.dive === 0 && c.y + HALF >= INVASION_Y) {
      s.over = true;
      return;
    }
  }
}

/** Chance per tick, in 1/1000, that some crab fires. `offset` is the level's fireOffset (0 outside the campaign). */
export function fireChance(wave: number, offset = 0): number {
  return Math.min(ENEMY_SHOT.perMille + offset + (wave - 1) * 4, 60);
}

/** An `explosive` shot below this line splits into fragments immediately, fuse or not (spec §4.1 `explosive`). */
const EXPLOSIVE_SPLIT_Y = idiv(FIELD_H * 2, 3);

/** The four cardinal directions an `explosive` shot's fragments fly off in, speed 73 (spec §4.1 `explosive`). */
const FRAGMENT_VECTORS: ReadonlyArray<readonly [number, number]> = [
  [73, 0],
  [0, 73],
  [-73, 0],
  [0, -73],
];

/**
 * Moves enemy shots (a `zigzag` boss shot flips `vx` every 20 ticks via `data`; an `explosive`
 * shot's `data` counts down its fuse) and drops those off the field, then maybe fires from a
 * random crab: one aimed shot, or three fanned out for a `fanner`. Crab shots (`kind: 'crab'`) are
 * untouched by the zigzag/explosive branches and keep the same collision radius as before, so this
 * stays bit-for-bit compatible with the v2 goldens. SPEED_TAMER and ICE_FREEZE both scale the
 * per-tick displacement (never the stored `vx`/`vy`, so the hash stays stable across activation/
 * expiry mid-flight): always for crab shots, skipped for boss shots while `bossImmuneToSlowdown`.
 * A shot above the field but still moving down (a meteor-shower drop spawned at y -200) is never
 * pruned for being off the top edge — only for having left through the bottom, left or right.
 */
export function updateEnemyShots(s: GameState): void {
  const kept: Bullet[] = [];
  for (const b of s.enemyShots) {
    if (b.kind === 'zigzag') {
      b.data -= 1;
      if (b.data <= 0) { b.vx = -b.vx; b.data = 20; }
    } else if (b.kind === 'explosive') {
      b.data -= 1;
    }
    const bossShot = b.kind !== 'crab';
    const slow = !bossShot || !bossImmuneToSlowdown(s);
    b.x += slow ? chilled(s, tamed(s, b.vx), bossShot) : b.vx;
    b.y += slow ? chilled(s, tamed(s, b.vy), bossShot) : b.vy;
    if (b.kind === 'explosive' && (b.data <= 0 || b.y > EXPLOSIVE_SPLIT_Y)) {
      for (const [vx, vy] of FRAGMENT_VECTORS) kept.push({ x: b.x, y: b.y, vx, vy, kind: 'fragment', data: 0 });
      continue;
    }
    const r = shotRadius(b);
    const aboveTop = b.y + r <= 0;
    if (b.x + r > 0 && b.x - r < FIELD_W && (!aboveTop || b.vy > 0) && b.y - r < FIELD_H) kept.push(b);
  }
  s.enemyShots = kept;
  if (s.crabs.length === 0) return;
  if (s.rngFire.nextInt(1000) >= fireChance(s.wave, s.run.level?.fireOffset ?? 0)) return;
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
