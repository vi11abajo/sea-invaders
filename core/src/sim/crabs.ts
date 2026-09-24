import {
  ARRIVAL, CRAB, CRAB_SHOTS, CRAB_TYPES, ENEMY_SHOT, FIELD_H, FIELD_W, SPEED_PCT, TYPE_COLOUR, enemyShotPctFor, scalePct,
} from '../config';
import { clamp, idiv, isqrt } from '../fixed';
import type { CrabType } from '../levels';
import type { Bullet, Crab, GameState } from '../types';
import { bossImmuneToSlowdown, chilled, tamed } from './boosts';
import { AXE_GRAVITY, ORB_STEER, ORB_VX_MAX, orbTicks } from './boss';
import { shotRadius } from './collide';
import { moveLivingFormation } from './living';
import { halvedWhileBoss, marchSquads } from './squads';
import {
  burstCharge, driftBubble, fireWeight, flipBubble, hasHerald, heraldedSpeed, isHeralded, raged,
  shotEntryFor,
} from './veterans';

const HALF = idiv(CRAB.size, 2);

/**
 * Builds a crab of `type` at `(x, y)`, spawn hp and colour — the one place every path
 * that makes a `Crab` goes through (`spawnWave` and `spawnFormation` in `game.ts`, the patriarch's
 * rally in `veterans.ts`), so the veteran fields stay in one spot. Every field but
 * `shield` starts neutral (0). A warden starts shielded (`shield = 1`), matching the warden's rune
 * shield at spawn; a patriarch's rally clock is armed by `armRallies` once its whole wave stands,
 * because the stagger depends on how many patriarchs came before it.
 *
 * It lives in `sim/` rather than in `game.ts` so that the simulation never has to reach back into
 * the module that composes it: `game.ts` and `sim/veterans.ts` both call inwards to here.
 */
export function spawnCrab(x: number, y: number, type: CrabType, slot = -1): Crab {
  return {
    x, y, kind: TYPE_COLOUR[type], type, hp: CRAB_TYPES[type].hp,
    slot, shield: type === 'warden' ? 1 : 0, shieldTimer: 0, rallies: 0, rallyTimer: 0, squad: 0,
    revived: 0, cell: -1,
  };
}

/** The bullet kinds crabs fire (from `CRAB_SHOTS`); every other enemy shot is a boss's. */
const CRAB_SHOT_KINDS = new Set(Object.values(CRAB_SHOTS).map((entry) => entry.kind));

/** A crab whose bottom edge reaches this line has invaded the reef. */
export const INVASION_Y = FIELD_H - 300;

/** Void's `gravity` shots pull player shots within this many units. */
const GRAVITY_SHOT_RANGE = 800;
/** Void's `gravity` shots pull player shots towards themselves by this many units/tick. */
const GRAVITY_SHOT_PULL = 10;

/**
 * Void Sovereign's gravity wave: every `gravity` enemy shot pulls every player
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

/**
 * Horizontal speed per tick: faster in later waves, as the formation thins out, by the level's reef,
 * half again as fast while the formation rages over a fallen patriarch, and slowed by
 * SPEED_TAMER's stacks. The rage lifts the wave's own speed and the tamer scales whatever comes out,
 * so the boost and the player's answer to it compose rather than cancel.
 */
export function crabSpeed(s: GameState): number {
  const killed = s.waveTotal - s.crabs.length;
  const v = CRAB.baseSpeed + (s.wave - 1) + idiv(killed * 8, s.waveTotal) + (s.run.level?.speedOffset ?? 0);
  return tamed(s, raged(s, v));
}

/**
 * The formation's actual per-tick march displacement in direction `dir`: the shared signed speed
 * halved by ICE_FREEZE, used by the wall check and by the step itself so the two never
 * disagree. Every kind marches with the formation — swift's old 1.5x step went with the enemy
 * rework of core v8. A split wave asks for each of its halves' directions in turn.
 */
export function crabStepFor(s: GameState, dir: number): number {
  return chilled(s, crabSpeed(s) * dir, false);
}

/** The whole formation's per-tick march displacement, in the wave's own direction. */
function crabStep(s: GameState): number {
  return crabStepFor(s, s.dir);
}

/**
 * How many march steps the formation takes on `tick`: `SPEED_PCT.crabMove` percent of one step per
 * tick, spread evenly by rounding the running total up (at 90 it marches on ticks 0-8 and rests on
 * tick 9 of every ten, at 100 it marches every tick, at 150 it alternates two steps and one).
 * Scaling the number of steps instead of the small per-tick step keeps the tuned speed exact.
 */
export function marchSteps(tick: number, pct: number = SPEED_PCT.crabMove): number {
  return idiv((tick + 1) * pct + 99, 100) - idiv(tick * pct + 99, 100);
}

/**
 * Whether a crab centred on `x` stands inside the field: the one wall test the whole game asks, so
 * nothing can ever answer the same question with a second margin. `marchBlockOnce` turns the block
 * round on it, `living.ts` slides a wave back inside the same band, and a patriarch's rally checks a
 * place against it before putting a crab there — a crab outside the band fails the test in
 * *both* directions, which would freeze its block into a step-down on every march step.
 */
export function insideField(x: number): boolean {
  return x - HALF >= 0 && x + HALF <= FIELD_W;
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
    if (!insideField(c.x + step)) {
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
 * formation any more — so the whole block shares one step. Ends the run on invasion.
 *
 * While a campaign wave is arriving (`s.arrival > 0`) every crab's `y` instead
 * just descends by `ARRIVAL.speed` (slowed by ICE_FREEZE/SPEED_TAMER like every other crab movement),
 * `x` untouched and no wall or invasion test — the formation is still above the field,
 * closing in on its slots. A living formation holds still through that descent too: it
 * only starts to turn, split or reform once its wave has arrived.
 *
 * A wave whose behaviour is anything but `march` hands its movement to `sim/living.ts`; every other
 * wave — daily, practice and every static silhouette — takes the block march below, unchanged.
 *
 * A boss's squads are the one thing on the field that does not march with a wave, and
 * with one of them standing the tick goes to `marchSquads` instead. The two can never want the tick
 * at the same time: a boss round carries no wave at all (a boss level has `waves: 0`, and
 * `nextWave` only calls the boss up once the last wave is cleared), so while `s.squads` is not
 * empty every crab on the field is a squad crab. Should the game ever field both at once, this
 * is the line that has to learn to tell them apart — `Crab.squad` is how.
 */
export function marchCrabs(s: GameState): void {
  if (s.squads.length > 0) {
    marchSquads(s);
    return;
  }
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
 * Picks the crab that fires this tick, by `FIRE_WEIGHT` over the live crabs: one draw in
 * `[0, total)`, then a walk through `s.crabs` in array order subtracting each weight — exactly one
 * RNG draw, the same as the uniform pick it replaces, so the draw count never depends on the kinds
 * on the field. Only ever called with at least one crab alive, so `total` is at least 1.
 *
 * A heralded crab weighs twice its kind's weight: the walk is the same walk, over doubled
 * weights, so the aura never costs a second draw. `aura` is `hasHerald(s)` — false for every wave
 * with no herald in it, which makes the whole aura lookup disappear.
 */
function pickShooter(s: GameState, aura: boolean): Crab {
  let total = 0;
  for (const c of s.crabs) total += fireWeight(s, c, aura);
  let r = s.rngFire.nextInt(total);
  for (const c of s.crabs) {
    r -= fireWeight(s, c, aura);
    if (r < 0) return c;
  }
  return s.crabs[s.crabs.length - 1]!;
}

/**
 * Up to `FIRE_RAMP_KNEE` the fire chance still climbs `FIRE_STEP` per mille a wave (unchanged);
 * after it, `FIRE_STEP_LATE` (half that) a wave, so the same cap of 60 arrives on wave 16 instead of
 * 11. Halving the ramp past the knee — alongside `dailyPool`'s slower veteran cadence in
 * `levels.ts` — stretches a daily/practice run's climb after wave 5 over roughly twice as many
 * waves, without changing the top difficulty it eventually reaches.
 */
const FIRE_RAMP_KNEE = 6;
const FIRE_STEP = 4;
const FIRE_STEP_LATE = 2;

/**
 * The wave's own (unclamped, unscaled) addition to the fire chance: `(wave-1)*FIRE_STEP` through
 * `FIRE_RAMP_KNEE`, `FIRE_STEP_LATE` a wave after it. Campaign waves are numbered 1..5 (the longest
 * level has 5 waves — `levels.test.ts` pins `LEVELS`'s row count) and a boss round's own squads
 * fire with `wave` 0 (`startLevelWave` never runs for a boss level's `waves: 0`, so `s.wave` stays
 * 0), so both stay inside the unchanged `wave <= FIRE_RAMP_KNEE` branch and see exactly today's
 * term — only the daily/practice grid, which alone reaches wave 7 and beyond, ever takes the
 * shallower branch.
 */
export function fireRamp(wave: number): number {
  return wave <= FIRE_RAMP_KNEE
    ? (wave - 1) * FIRE_STEP
    : (FIRE_RAMP_KNEE - 1) * FIRE_STEP + (wave - FIRE_RAMP_KNEE) * FIRE_STEP_LATE;
}

/**
 * Chance per tick, in 1/1000, that some crab fires: the original chance (capped at 60) scaled by
 * `SPEED_PCT.crabFire`. `offset` is the level's fireOffset (0 outside the campaign).
 */
export function fireChance(wave: number, offset = 0): number {
  return scalePct(Math.min(ENEMY_SHOT.perMille + offset + fireRamp(wave), 60), SPEED_PCT.crabFire);
}

/** An `explosive` shot below this line splits into fragments immediately, fuse or not. */
const EXPLOSIVE_SPLIT_Y = idiv(FIELD_H * 2, 3);

/**
 * The four cardinal directions an `explosive` shot's fragments fly off in, speed 73; the
 * bombardier's bursting charge uses the same four.
 */
export const FRAGMENT_VECTORS: ReadonlyArray<readonly [number, number]> = [
  [73, 0],
  [0, 73],
  [-73, 0],
  [0, -73],
];

/**
 * One tick of a homing orb: its sideways velocity `vx` accumulates towards Octopi by at
 * most `ORB_STEER` units a tick — the clamp bounds the *turn*, not `vx` itself, so this does not
 * damp. `vx` keeps climbing for as long as Octopi sits further away than `ORB_STEER`, carries the
 * orb past Octopi's x, and then climbs back the other way, so the orb overshoots and oscillates
 * about Octopi's x rather than settling on it, bounded either way by `|vx| ≤ ORB_VX_MAX`. `vy`
 * (its sinking speed) is untouched, and one tick comes off the life packed into `data`
 * (`ticksLeft * 4 + hp`, so a whole tick is 4).
 */
function steerOrb(s: GameState, b: Bullet): void {
  b.vx = clamp(b.vx + clamp(s.octopi.x - b.x, -ORB_STEER, ORB_STEER), -ORB_VX_MAX, ORB_VX_MAX);
  b.data -= 4;
}

/**
 * Hex's per-tick step: `v` scaled to `pct` percent, truncating towards
 * zero like every other integer scale in the core; 100 hands `v` back untouched.
 */
function hexStep(v: number, pct: number): number {
  return pct === 100 ? v : idiv(v * pct, 100);
}

/**
 * Moves enemy shots (a `zigzag` boss shot flips `vx` every 20 ticks via `data`; an `explosive`
 * shot's `data` counts down its fuse; a `bubble` flips its drift on its own 40-tick clock and a
 * `charge` bursts into fragments near Octopi; an `axe` loses `AXE_GRAVITY` of its fall
 * every tick so it turns and climbs back out, and an `orb` steers towards Octopi and spends a tick
 * of its packed life) and drops those off the field, then maybe
 * fires one aimed shot from one crab: `pickShooter` weights the choice by kind, doubled
 * for a heralded crab, in a single RNG draw, and the crab fires the one shot its kind's
 * `CRAB_SHOTS` entry describes — a heralded crab's 1.2x faster, a bubbler's swapped for the plain
 * crab shot while six bubbles are already in the water, a bubble's velocity replaced by its own
 * sinking drift. The whole fire roll is half again as likely while the formation rages over a
 * fallen patriarch. Crab shots (`crab` and
 * `heavy`) are untouched by the zigzag/explosive branches and keep their own collision radius.
 * While ICE_FREEZE is active every enemy shot moves at half speed (not just crab movement, as an
 * earlier version had it): the stored `vx`/`vy` stay as fired and only the step is halved
 * through `chilled`, so the shot resumes full speed when the freeze ends; a boss's shots share its
 * own immunity (Crimson in a rage). Against hex every enemy shot, crab's and boss's alike, moves at
 * `enemyShotPctFor` (70 %) of its speed through the same per-tick seam, applied before the freeze's
 * halving and with the same boss immunity.
 * SPEED_TAMER still never touches bullets. A shot above the field but still moving down (a meteor-shower drop spawned at y -200) is
 * never pruned for being off the top edge — only for having left through the bottom, left or right.
 *
 * While a campaign wave is arriving (`s.arrival > 0`) existing shots still move
 * and get pruned as usual, but nothing new fires.
 */
export function updateEnemyShots(s: GameState): void {
  const kept: Bullet[] = [];
  // Hex, read once per call: nothing in the loop below changes the
  // variant or the boss's rage. 100 for every other variant, and then the immunity is never asked.
  const hexPct = enemyShotPctFor(s.run.octopi);
  const bossHexImmune = hexPct !== 100 && bossImmuneToSlowdown(s);
  for (const b of s.enemyShots) {
    if (b.kind === 'zigzag') {
      b.data -= 1;
      if (b.data <= 0) { b.vx = -b.vx; b.data = 20; }
    } else if (b.kind === 'bubble') {
      flipBubble(b); // the bubbler's own zigzag, on its own 40-tick clock
    } else if (b.kind === 'explosive') {
      b.data -= 1;
    } else if (b.kind === 'axe') {
      b.vy -= AXE_GRAVITY; // the boomerang's parabola down and back up
    } else if (b.kind === 'orb') {
      steerOrb(s, b); // the homing orb turns towards Octopi and spends a tick of life
    }
    const bossShot = !CRAB_SHOT_KINDS.has(b.kind);
    // Hex scales the step only, never the stored `vx`/`vy`; a raging Crimson's own shots are exempt.
    const shotPct = bossShot && bossHexImmune ? 100 : hexPct;
    b.x += chilled(s, hexStep(b.vx, shotPct), bossShot);
    b.y += chilled(s, hexStep(b.vy, shotPct), bossShot);
    if (b.kind === 'explosive' && (b.data <= 0 || b.y > EXPLOSIVE_SPLIT_Y)) {
      for (const [vx, vy] of FRAGMENT_VECTORS) kept.push({ x: b.x, y: b.y, vx, vy, kind: 'fragment', data: 0 });
      continue;
    }
    if (b.kind === 'charge' && burstCharge(s, b, kept)) continue; // the bombardier's charge
    if (b.kind === 'orb' && orbTicks(b) <= 0) continue; // it has swum out its life
    const r = shotRadius(b);
    const aboveTop = b.y + r <= 0;
    if (b.x + r > 0 && b.x - r < FIELD_W && (!aboveTop || b.vy > 0) && b.y - r < FIELD_H) kept.push(b);
  }
  s.enemyShots = kept;
  if (s.arrival > 0) return; // wave arriving: shots still fly, nothing new fires
  if (s.crabs.length === 0) return;
  // A boss's squads fire by exactly these rules, at half the chance while their boss is
  // alive. `halvedWhileBoss` is the identity with no boss on the field, and a boss fight of the
  // first campaign never reaches this line at all — it has no crabs.
  if (s.rngFire.nextInt(1000) >= halvedWhileBoss(s, raged(s, fireChance(s.wave, s.run.level?.fireOffset ?? 0)))) return;
  const aura = hasHerald(s);
  const crab = pickShooter(s, aura);
  const entry = shotEntryFor(s, crab);
  const y = crab.y + HALF;
  const dx = s.octopi.x - crab.x;
  const dy = s.octopi.y - y;
  const len = isqrt(dx * dx + dy * dy);
  const heralded = aura && isHeralded(s, crab);
  const speed = heralded ? heraldedSpeed(entry.speed) : entry.speed;
  const vx = len === 0 ? 0 : idiv(dx * speed, len);
  const vy = len === 0 ? speed : idiv(dy * speed, len);
  const shot: Bullet = { x: crab.x, y, vx, vy, kind: entry.kind, data: 0 };
  if (entry.kind === 'bubble') driftBubble(shot, s.octopi.x >= crab.x ? 1 : -1, heralded); // the bubbler's own drift
  s.enemyShots.push(shot);
}
