import { ARRIVAL, CRAB, CRAB_SHOTS, ENEMY_SHOT, FIELD_H, FIELD_W, FIRE_WEIGHT, TUNING, scalePct } from '../config';
import { idiv, isqrt } from '../fixed';
import type { Bullet, Crab, GameState } from '../types';
import { chilled, tamed } from './boosts';
import { shotRadius } from './collide';
import { moveLivingFormation } from './living';

const HALF = idiv(CRAB.size, 2);

/** The bullet kinds crabs fire (from `CRAB_SHOTS`); every other enemy shot is a boss's. */
const CRAB_SHOT_KINDS = new Set(Object.values(CRAB_SHOTS).map((entry) => entry.kind));

/** A crab whose bottom edge reaches this line has invaded the reef. */
export const INVASION_Y = FIELD_H - 300;

/** Void's `gravity` shots (spec §4.1 `gravity` row) pull player shots within this many units. */
const GRAVITY_SHOT_RANGE = 800;
/** Void's `gravity` shots pull player shots towards themselves by this many units/tick. */
const GRAVITY_SHOT_PULL = 10;

/**
 * Void Sovereign's gravity wave (spec §4.2 row 5): every `gravity` enemy shot pulls every player
 * shot within `GRAVITY_SHOT_RANGE` units towards itself by `GRAVITY_SHOT_PULL` units/tick, along an
 * integer-normalised vector (positions only, `vx`/`vy` untouched).
 * Called from `step` right after `updateEnemyShots` so it sees this tick's freshly moved gravity
 * shots, leaving `updateEnemyShots`'s own crab-shot firing and motion path untouched.
 */
export function pullShotsTowardGravity(s: GameState): void {
  for (const g of s.enemyShots) {
    if (g.kind !== 'gravity') continue;
    for (const p of s.shots) {
      const dx = g.x - p.x;
      const dy = g.y - p.y;
      const distSq = dx * dx + dy * dy;
      if (distSq === 0) continue;
      const len = isqrt(distSq);
      if (len > GRAVITY_SHOT_RANGE) continue;
      p.x += idiv(dx * GRAVITY_SHOT_PULL, len);
      p.y += idiv(dy * GRAVITY_SHOT_PULL, len);
    }
  }
}

/** Horizontal speed per tick: faster in later waves, as the formation thins out, by the level's reef, and slowed by SPEED_TAMER's stacks. */
export function crabSpeed(s: GameState): number {
  const killed = s.waveTotal - s.crabs.length;
  const v = CRAB.baseSpeed + (s.wave - 1) + idiv(killed * 8, s.waveTotal) + (s.run.level?.speedOffset ?? 0);
  return tamed(s, v);
}

/**
 * The formation's actual per-tick march displacement in direction `dir`: the shared signed speed
 * halved by ICE_FREEZE (spec §5.2), used by the wall check and by the step itself so the two never
 * disagree. Every kind marches with the formation — swift's old 1.5x step went with the enemy
 * rework of core v8. A split wave asks for each of its halves' directions in turn (spec §3).
 */
export function crabStepFor(s: GameState, dir: number): number {
  return chilled(s, crabSpeed(s) * dir, false);
}

/** The whole formation's per-tick march displacement, in the wave's own direction. */
function crabStep(s: GameState): number {
  return crabStepFor(s, s.dir);
}

/**
 * How many march steps the formation takes on `tick`: `TUNING.crabMovePct` percent of one step per
 * tick, spread evenly by rounding the running total up (at 90 it marches on ticks 0-8 and rests on
 * tick 9 of every ten, at 100 it marches every tick, at 150 it alternates two steps and one).
 * Scaling the number of steps instead of the small per-tick step keeps the tuned speed exact.
 */
export function marchSteps(tick: number, pct: number = TUNING.crabMovePct): number {
  return idiv((tick + 1) * pct + 99, 100) - idiv(tick * pct + 99, 100);
}

/**
 * One block step of `step` units: sideways, or reverse and step down at a wall (see `marchCrabs`).
 * The wall test runs over the crabs' own positions, so it is the outermost living crab that turns
 * the block round however the wave is shaped at that moment.
 *
 * A campaign wave's origin rides along with the block — the same step sideways, the same step down
 * — so `origin + slot` keeps naming each crab's place. That bookkeeping never touches a crab, which
 * is what lets a `march` wave stay bit-identical to core v10.
 */
export function marchBlockOnce(s: GameState, step: number): void {
  let hitsWall = false;
  for (const c of s.crabs) {
    const nx = c.x + step;
    if (nx + HALF > FIELD_W || nx - HALF < 0) {
      hitsWall = true;
      break;
    }
  }
  if (hitsWall) {
    s.dir = -s.dir;
    for (const c of s.crabs) c.y += CRAB.stepDown;
    if (s.formation) s.formation.oy += CRAB.stepDown;
  } else {
    for (const c of s.crabs) c.x += step;
    if (s.formation) s.formation.ox += step;
  }
}

/** One formation step at the wave's own march speed. */
function marchOnce(s: GameState): void {
  marchBlockOnce(s, crabStep(s));
}

/**
 * Marches the formation sideways (`marchSteps` steps this tick); at a wall it reverses and steps
 * down instead. Every crab moves with the group and none ever leaves it — no kind dives out of
 * formation any more (spec §1) — so the whole block shares one step. Ends the run on invasion.
 *
 * While a campaign wave is arriving (`s.arrival > 0`, spec §14 amendment) every crab's `y` instead
 * just descends by `ARRIVAL.speed` (slowed by ICE_FREEZE/SPEED_TAMER like every other crab movement,
 * spec C5), `x` untouched and no wall or invasion test — the formation is still above the field,
 * closing in on its slots. A living formation (spec §3) holds still through that descent too: it
 * only starts to turn, split or reform once its wave has arrived.
 *
 * A wave whose behaviour is anything but `march` hands its movement to `sim/living.ts`; every other
 * wave — daily, practice and every static silhouette — takes the block march below, unchanged.
 */
export function marchCrabs(s: GameState): void {
  if (s.crabs.length === 0) return;
  if (s.arrival > 0) {
    const speed = chilled(s, tamed(s, ARRIVAL.speed), false);
    for (const c of s.crabs) c.y += speed;
    if (s.formation) s.formation.oy += speed;
    return;
  }
  if (s.formation && s.formation.behaviour !== 'march') {
    moveLivingFormation(s, s.formation);
  } else {
    const steps = marchSteps(s.tick);
    for (let i = 0; i < steps; i++) marchOnce(s);
  }
  for (const c of s.crabs) {
    if (c.y + HALF >= INVASION_Y) {
      s.over = true;
      return;
    }
  }
}

/**
 * Picks the crab that fires this tick, by `FIRE_WEIGHT` over the live crabs (spec §1): one draw in
 * `[0, total)`, then a walk through `s.crabs` in array order subtracting each weight — exactly one
 * RNG draw, the same as the uniform pick it replaces, so the draw count never depends on the kinds
 * on the field. Only ever called with at least one crab alive, so `total` is at least 1.
 */
function pickShooter(s: GameState): Crab {
  let total = 0;
  for (const c of s.crabs) total += FIRE_WEIGHT[c.type];
  let r = s.rngFire.nextInt(total);
  for (const c of s.crabs) {
    r -= FIRE_WEIGHT[c.type];
    if (r < 0) return c;
  }
  return s.crabs[s.crabs.length - 1]!;
}

/**
 * Chance per tick, in 1/1000, that some crab fires: the original chance (capped at 60) scaled by
 * `TUNING.crabFirePct`. `offset` is the level's fireOffset (0 outside the campaign).
 */
export function fireChance(wave: number, offset = 0): number {
  return scalePct(Math.min(ENEMY_SHOT.perMille + offset + (wave - 1) * 4, 60), TUNING.crabFirePct);
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
 * shot's `data` counts down its fuse) and drops those off the field, then maybe fires one aimed
 * shot from one crab: `pickShooter` weights the choice by kind (spec §1) in a single RNG draw, and
 * the crab fires the one shot its kind's `CRAB_SHOTS` entry describes. Crab shots (`crab` and
 * `heavy`) are untouched by the zigzag/explosive branches and keep their own collision radius.
 * While ICE_FREEZE is active every enemy shot moves at half speed (owner ruling 2026-09-15, replacing
 * spec C5's movement-only rule): the stored `vx`/`vy` stay as fired and only the step is halved
 * through `chilled`, so the shot resumes full speed when the freeze ends; a boss's shots share its
 * own immunity (Crimson in a rage). SPEED_TAMER still never touches bullets. A shot above the field but still moving down (a meteor-shower drop spawned at y -200) is
 * never pruned for being off the top edge — only for having left through the bottom, left or right.
 *
 * While a campaign wave is arriving (`s.arrival > 0`, spec §14 amendment) existing shots still move
 * and get pruned as usual, but nothing new fires.
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
    const bossShot = !CRAB_SHOT_KINDS.has(b.kind);
    b.x += chilled(s, b.vx, bossShot);
    b.y += chilled(s, b.vy, bossShot);
    if (b.kind === 'explosive' && (b.data <= 0 || b.y > EXPLOSIVE_SPLIT_Y)) {
      for (const [vx, vy] of FRAGMENT_VECTORS) kept.push({ x: b.x, y: b.y, vx, vy, kind: 'fragment', data: 0 });
      continue;
    }
    const r = shotRadius(b);
    const aboveTop = b.y + r <= 0;
    if (b.x + r > 0 && b.x - r < FIELD_W && (!aboveTop || b.vy > 0) && b.y - r < FIELD_H) kept.push(b);
  }
  s.enemyShots = kept;
  if (s.arrival > 0) return; // wave arriving: shots still fly, nothing new fires
  if (s.crabs.length === 0) return;
  if (s.rngFire.nextInt(1000) >= fireChance(s.wave, s.run.level?.fireOffset ?? 0)) return;
  const crab = pickShooter(s);
  const entry = CRAB_SHOTS[crab.type];
  const y = crab.y + HALF;
  const dx = s.octopi.x - crab.x;
  const dy = s.octopi.y - y;
  const len = isqrt(dx * dx + dy * dy);
  const speed = entry.speed;
  const vx = len === 0 ? 0 : idiv(dx * speed, len);
  const vy = len === 0 ? speed : idiv(dy * speed, len);
  s.enemyShots.push({ x: crab.x, y, vx, vy, kind: entry.kind, data: 0 });
}
