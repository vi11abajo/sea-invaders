import { ARRIVAL, CRAB, CRAB_SHOTS, DIVER, ENEMY_SHOT, FANNER_SPREAD, FIELD_H, FIELD_W, TUNING, scalePct } from '../config';
import { idiv, isqrt } from '../fixed';
import { icos, isin } from '../trig';
import type { Bullet, Crab, GameState } from '../types';
import { chilled, tamed } from './boosts';
import { shotRadius } from './collide';

const HALF = idiv(CRAB.size, 2);

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

/** This crab's own signed horizontal step: swift crabs move 1.5x the shared formation speed. */
export function crabSpeedFor(s: GameState, c: Crab): number {
  const v = crabSpeed(s) * s.dir;
  return c.type === 'swift' ? v + idiv(v, 2) : v;
}

/** This crab's actual per-tick march displacement: `crabSpeedFor` halved by ICE_FREEZE (spec §5.2), used consistently by the wall check and the step itself so the two never disagree. */
function crabStep(s: GameState, c: Crab): number {
  return chilled(s, crabSpeedFor(s, c), false);
}

/**
 * Every DIVER.interval ticks, sends one diver-type crab still in formation on a dive. The chosen
 * crab's home slot is captured here, from its current (post-march) position, rather than trusting
 * whatever `homeX`/`homeY` already held — a crab in formation only has its `x`/`y` moved by
 * `marchCrabs` (see that function's docstring), so its home fields go stale the moment it stops
 * diving; snapshotting them right before the dive starts is what keeps the return slot in sync
 * with the row it's rejoining.
 */
function triggerDiver(s: GameState): void {
  if (s.tick === 0 || s.tick % DIVER.interval !== 0) return;
  const candidates = s.crabs.filter((c) => c.type === 'diver' && c.dive === 0);
  if (candidates.length === 0) return;
  const c = candidates[s.rngWaves.nextInt(candidates.length)]!;
  c.homeX = c.x;
  c.homeY = c.y;
  c.dive = DIVER.ticks;
}

/** Moves crabs currently diving one step towards Octopi; snaps back to their formation slot when the dive ends. */
function advanceDivers(s: GameState): void {
  for (const c of s.crabs) {
    if (c.dive === 0) continue;
    if (c.dive === 1) {
      c.x = c.homeX;
      c.y = c.homeY;
      c.dive = 0;
      continue;
    }
    const dx = s.octopi.x - c.x;
    const dy = s.octopi.y - c.y;
    const len = isqrt(dx * dx + dy * dy);
    if (len > 0) {
      const speed = chilled(s, tamed(s, DIVER.speed), false);
      c.x += idiv(dx * speed, len);
      c.y += idiv(dy * speed, len);
    }
    c.dive -= 1;
  }
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

/** One formation step: sideways, or reverse and step down at a wall (see `marchCrabs`). */
function marchOnce(s: GameState): void {
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
}

/**
 * Marches the formation sideways (`marchSteps` steps this tick); at a wall it reverses and steps
 * down instead. Swift crabs cover extra ground on their own, and the wall check honours that
 * extent too. The march always applies
 * to every crab's formation slot — a diving crab's `(homeX, homeY)` for a crab that's away, its
 * actual `(x, y)` otherwise — so the slot keeps tracking the group even when every crab is diving.
 * `advanceDivers` runs after, so a crab whose dive ends this tick snaps to its already-moved slot
 * and isn't marched again in the same tick. Ends the run on invasion.
 *
 * While a campaign wave is arriving (`s.arrival > 0`, spec §14 amendment) every crab's `y` and
 * `homeY` instead just descend by `ARRIVAL.speed` (slowed by ICE_FREEZE/SPEED_TAMER like every other
 * crab movement, spec C5), `x` untouched, no diver trigger and no wall or invasion test — the
 * formation is still above the field, closing in on its slots.
 */
export function marchCrabs(s: GameState): void {
  if (s.crabs.length === 0) return;
  if (s.arrival > 0) {
    const speed = chilled(s, tamed(s, ARRIVAL.speed), false);
    for (const c of s.crabs) {
      c.y += speed;
      c.homeY += speed;
    }
    return;
  }
  const steps = marchSteps(s.tick);
  for (let i = 0; i < steps; i++) marchOnce(s);
  advanceDivers(s);
  triggerDiver(s);
  for (const c of s.crabs) {
    if (c.dive === 0 && c.y + HALF >= INVASION_Y) {
      s.over = true;
      return;
    }
  }
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
 * shot's `data` counts down its fuse) and drops those off the field, then maybe fires from a
 * random crab: one aimed shot of the shooter type's `CRAB_SHOTS` kind/speed, or three fanned out
 * when its entry has `count: 3`; a `null` entry (`diver`) fires nothing that tick, though the fire
 * chance and shooter RNG draws still happen exactly as for any other type. Crab shots
 * (`kind: 'crab'`, from a `normal` shooter) are untouched by the zigzag/explosive branches and keep
 * the same collision radius as before, so this stays bit-for-bit compatible with the v2 goldens.
 * Enemy shot velocity is never slowed by ICE_FREEZE or SPEED_TAMER (spec C5: both boosts slow crab
 * movement only — march step, arrival descent, diver dives — never bullets, matching the legacy's
 * released behaviour; its one function that would have scaled bullet speed too was dead code, never
 * called). A shot above the field but still moving down (a meteor-shower drop spawned at y -200) is
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
    b.x += b.vx;
    b.y += b.vy;
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
  const crab = s.crabs[s.rngFire.nextInt(s.crabs.length)]!;
  const entry = CRAB_SHOTS[crab.type];
  if (entry === null) return; // diver: chosen to fire, but fires nothing this tick
  const y = crab.y + HALF;
  const dx = s.octopi.x - crab.x;
  const dy = s.octopi.y - y;
  const len = isqrt(dx * dx + dy * dy);
  const speed = entry.speed;
  const vx = len === 0 ? 0 : idiv(dx * speed, len);
  const vy = len === 0 ? speed : idiv(dy * speed, len);
  if (entry.count === 3) {
    for (const a of [-FANNER_SPREAD, 0, FANNER_SPREAD]) {
      const rvx = idiv(vx * icos(a) - vy * isin(a), 1000);
      const rvy = idiv(vx * isin(a) + vy * icos(a), 1000);
      s.enemyShots.push({ x: crab.x, y, vx: rvx, vy: rvy, kind: entry.kind, data: 0 });
    }
    return;
  }
  s.enemyShots.push({ x: crab.x, y, vx, vy, kind: entry.kind, data: 0 });
}
