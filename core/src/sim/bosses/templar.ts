import { FIELD_W } from '../../config';
import { idiv } from '../../fixed';
import type { CrabType } from '../../levels';
import type { Rng } from '../../rng';
import type { BossState, GameState } from '../../types';
import { castFirewall, castZigzag, muzzle } from '../boss';
import { SQUAD_BAND, spawnSquad } from '../squads';
import type { BossHooks } from './index';

/**
 * Verdant Templar (kind 6, spec §5.2 row 6): the old guard of the Sunken Bastion, a shell shield
 * with windows in it. Nothing he does reaches Octopi while his guard is closed, and nothing the
 * player does reaches him either — the only opening is the one he makes himself.
 *
 * Every attack is one sword swing, and a swing is three beats:
 *
 * 1. **Wind-up**, `TEMPLAR_WINDUP` ticks. `boss_windup` goes out on the first of them and the
 *    doorway of the wall to come is drawn *here*, into `b.gapSlot`, so the renderer can telegraph
 *    it for the whole wind-up rather than springing it on the player with the wall.
 * 2. **The wall**, on the last tick of the wind-up: a `firewall` across the field at the muzzle's
 *    own depth, with the two-slot doorway at `b.gapSlot`. The shield drops with it.
 * 3. **The opening**, `TEMPLAR_SHIELD_DOWN` ticks measured from the wall: the only ticks of the
 *    fight on which the Templar can be hurt. Then the shield is back up.
 *
 * Phase 2 adds two things: the swing throws a second, staggered wall `TEMPLAR_SECOND_WALL_DELAY`
 * ticks after the first with a doorway at least `TEMPLAR_GAP_MIN_DISTANCE` slots from it (so the
 * player cannot simply stand in one doorway and wait), and a zigzag pair comes out between swings on
 * the shared secondary timer while the shield is up.
 *
 * A `line4` of wardens marches with him from the start of each phase (`onPhaseStart`). They are
 * ordinary squad crabs — the rune shield of spec §2 included, which is why the Trident's piercing
 * shot is the one that walks through the line and still finds the boss behind it.
 *
 * Every draw is one `rngBoss.nextInt`, and the order inside a swing is fixed: the doorway first
 * (`attack`), then `attackDelay`'s jitter (drawn by `updateBoss` itself, right after the hook
 * returns), then in phase 2 the second doorway when the first wall falls. `boss-templar.test.ts`
 * pins that sequence.
 */

/** Ticks of telegraphed wind-up before the wall falls (spec §5.2: 45). */
export const TEMPLAR_WINDUP = 45;

/** Ticks the shell shield stays down once a wall has fallen (spec §5.2: 120). */
export const TEMPLAR_SHIELD_DOWN = 120;

/** Ticks between phase 2's two staggered walls (spec §5.2: 30). */
export const TEMPLAR_SECOND_WALL_DELAY = 30;

/**
 * How many slots the doorway may be drawn on: `FIREWALL_SLOTS - 1`, because a doorway is the drawn
 * slot *and the one to its right* (spec §5.2 as amended, ruling R13 — `nextInt(8)`, never 9, so the
 * doorway is always two slots wide). Written as a literal rather than read off `FIREWALL_SLOTS`:
 * `sim/boss.ts` and this file are a module cycle, and a top-level read across it would hit the
 * temporal dead zone. `boss-templar.test.ts` pins the two together.
 */
export const TEMPLAR_GAP_SLOTS = 8;

/** How many slots apart phase 2's two doorways must stand (spec §5.2: "second gap >= 3 slots"). */
export const TEMPLAR_GAP_MIN_DISTANCE = 3;

/** How far a second doorway drawn too close to the first is shifted: half the wall (task brief). */
const TEMPLAR_GAP_SHIFT = 4;

/**
 * The roster the warden line is drawn from. `line4` is four cells of tier 1 and `kindForTier` reads
 * a five-kind roster tier for tier, so tier 1 is the roster's second entry: reef 6's own roster
 * (`normal, armored, heavy, elder, warden`) would field four *armored* crabs, not four wardens. The
 * spec asks for a line of wardens, so the line is handed a roster that is wardens at every tier.
 */
export const TEMPLAR_GUARD: readonly CrabType[] = ['warden', 'warden', 'warden', 'warden', 'warden'];

/**
 * Cast ids queued in `b.pending`. The staggered second wall carries its own doorway in the id —
 * `SECOND_WALL + gap`, `gap` in `0..TEMPLAR_GAP_SLOTS - 1` — so the doorway is drawn once, when the
 * first wall falls and the second is queued, and nothing has to remember it in the meantime. (The
 * next swing's own draw overwrites `b.gapSlot` long after this wall has fallen — `attackDelay` never
 * comes back inside 96 ticks and the second wall is 30 ticks out — but a queued wall that carries
 * its own doorway cannot be wrong about it whatever the timers do.)
 */
const SECOND_WALL = 10;

/** Bulwark's timer: 8-12 s (task brief), at the fight's start and after every use. */
function abilityTimer(rng: Rng): number {
  return 480 + rng.nextInt(241);
}

/** Whether two doorways stand far enough apart for the spec's rule (spec §5.2). */
function farEnough(gap: number, from: number): boolean {
  return Math.abs(gap - from) >= TEMPLAR_GAP_MIN_DISTANCE;
}

/**
 * The doorway of phase 2's staggered second wall, at least `TEMPLAR_GAP_MIN_DISTANCE` slots from the
 * first one's.
 *
 * **Exactly one draw, never a redraw loop** (task brief): how many times a boss draws per swing has
 * to be fixed, or the stream would depend on its own results. So one `nextInt(TEMPLAR_GAP_SLOTS)`,
 * and the drawn slot is corrected in place when it lands too close:
 *
 * 1. The brief's correction first — shift by `TEMPLAR_GAP_SHIFT` (half the wall), modulo the slots.
 * 2. That is not enough on its own, because the wall is a line and the shift is a circle: with the
 *    first doorway at 3 and the draw at 5, `(5 + 4) % 8 = 1`, still two slots away. Five (first,
 *    draw) pairs land like that. So a shift that is still too close falls back on the far edge of
 *    the wall — the end the first doorway is not on, which is always at least four slots off.
 *
 * `boss-templar.test.ts` walks all 64 (first, draw) pairs and pins the distance for every one.
 */
function secondGap(s: GameState, first: number): number {
  const draw = s.rngBoss.nextInt(TEMPLAR_GAP_SLOTS);
  if (farEnough(draw, first)) return draw;
  const shifted = (draw + TEMPLAR_GAP_SHIFT) % TEMPLAR_GAP_SLOTS;
  if (farEnough(shifted, first)) return shifted;
  return first < TEMPLAR_GAP_SHIFT ? TEMPLAR_GAP_SLOTS - 1 : 0;
}

/**
 * The swing lands: the wall falls at the muzzle's depth through the doorway the wind-up telegraphed,
 * the shield drops for `TEMPLAR_SHIELD_DOWN` ticks, and in phase 2 a second wall is queued behind it.
 */
function swing(s: GameState, b: BossState): void {
  b.shieldUp = 0;
  b.effectTicks = TEMPLAR_SHIELD_DOWN;
  castFirewall(s, muzzle(b).y, b.gapSlot);
  if (b.phase >= 2) b.pending.push(TEMPLAR_SECOND_WALL_DELAY, SECOND_WALL + secondGap(s, b.gapSlot));
}

/**
 * The guard closes: the shield goes back up, a wind-up under way is dropped and a staggered wall
 * still queued never falls. Used at both ends of the pause between phases — when the fight turns
 * (`onTransition`) and when it resumes (`onPhaseStart`) — so a swing interrupted by the turn cannot
 * resolve into the next phase.
 */
function guardUp(b: BossState): void {
  b.shieldUp = 1;
  b.windup = 0;
  b.effectTicks = 0;
  b.pending = [];
}

/** Calls up a rank of four wardens, centred, at the bottom of the squad band (spec §5.2). */
function raiseWardenLine(s: GameState): void {
  spawnSquad(s, 'line4', TEMPLAR_GUARD, idiv(FIELD_W, 2), SQUAD_BAND.maxY, 1);
}

export const TEMPLAR_HOOKS: BossHooks = {
  attack(s, b) {
    // The doorway is drawn at the very start of the wind-up, not when the wall falls: telegraphing
    // it is the whole point of the 45 ticks (spec §5.2).
    b.windup = TEMPLAR_WINDUP;
    b.gapSlot = s.rngBoss.nextInt(TEMPLAR_GAP_SLOTS);
    s.events.push({ tick: s.tick, type: 'boss_windup' });
  },
  secondary(s, b) {
    // Spec §5.2: zigzag pairs between the swings of phase 2, thrown while the guard is closed. They
    // are not part of a swing, so they neither open the shield nor wait for one.
    if (b.phase < 2 || b.shieldUp === 0) return;
    const m = muzzle(b);
    castZigzag(s, m.x - 925, m.y, -1);
    castZigzag(s, m.x + 925, m.y, 1);
  },
  ability(s, b) {
    // Bulwark (spec §5, reef 6's ability label) is the shell shield itself: the Templar plants it
    // again. The ticks after a swing are the only window the player has on this boss, so Bulwark
    // never cuts one short — while the shield is down it does nothing at all (task brief). With no
    // swing resolving, the shield is already up and all Bulwark does is announce itself for the
    // renderer and the crest sound. The escort the brief calls this ability's real job does not run
    // on this timer: a warden line comes with each phase, through `onPhaseStart`.
    if (b.shieldUp === 0) return;
    s.events.push({ tick: s.tick, type: 'boss_ability', name: 'shield' });
  },
  initialAbilityTimer: abilityTimer,
  nextAbilityTimer: abilityTimer,
  onHit(s, b) {
    // Spec §5.2: a player shot that reaches the boss box while the guard is closed is consumed
    // whole. Azure's water shield answers `damageBoss` the same way — true means absorbed.
    if (b.shieldUp === 0) return false;
    s.events.push({ tick: s.tick, type: 'boss_block' });
    return true;
  },
  cast(s, b, id) {
    if (id < SECOND_WALL) return;
    castFirewall(s, muzzle(b).y, id - SECOND_WALL);
  },
  tick(s, b) {
    // The shield-down window first, so a swing landing on this very tick opens a whole one.
    if (b.effectTicks > 0) {
      b.effectTicks -= 1;
      if (b.effectTicks === 0) b.shieldUp = 1;
    }
    if (b.windup > 0) {
      b.windup -= 1;
      if (b.windup === 0) swing(s, b);
    }
  },
  onTransition(_s, b) {
    guardUp(b);
  },
  onPhaseStart(s, b) {
    guardUp(b);
    raiseWardenLine(s);
  },
};
