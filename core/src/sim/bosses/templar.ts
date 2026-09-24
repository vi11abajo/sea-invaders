import { FIELD_W } from '../../config';
import { idiv } from '../../fixed';
import type { CrabType } from '../../levels';
import type { Rng } from '../../rng';
import type { BossState, GameState } from '../../types';
import { attackDelay, castFirewall, castZigzag, muzzle } from '../boss';
import { SQUAD_BAND, spawnSquad } from '../squads';
import type { BossHooks } from './index';

/**
 * Verdant Templar (kind 6): the old guard of the Sunken Bastion, a shell shield
 * with windows in it. Nothing he does reaches Octopi while his guard is closed, and nothing the
 * player does reaches him either — the only opening is the one he makes himself.
 *
 * A cycle (the shield spends about half of it up) is four beats:
 *
 * 1. **Rest**, `attackDelay(s, phase)` ticks, shield up. This is the pause: the next swing's timer
 *    starts when the shield comes back up — measured from the instant
 *    the *previous* cycle's opening closed, not from the moment the previous wind-up began. Only the
 *    shared secondary timer runs during it: a zigzag pair in phase 2 (`secondary`), gated on the
 *    shield being up exactly as before.
 * 2. **Wind-up**, `TEMPLAR_WINDUP` ticks, shield still up. `boss_windup` goes out on the first of
 *    them and the doorway of the wall to come is drawn *here*, into `b.gapSlot`, so the renderer can
 *    telegraph it for the whole wind-up rather than springing it on the player with the wall.
 * 3. **The wall**, on the last tick of the wind-up: a `firewall` across the field at the muzzle's
 *    own depth, with the two-slot doorway at `b.gapSlot`. The shield drops with it.
 * 4. **The opening**, `TEMPLAR_SHIELD_DOWN` ticks measured from the wall: the only ticks of the
 *    fight on which the Templar can be hurt. Then the shield is back up and beat 1 starts over.
 *
 * Beats 2-4 are driven exactly as before, by `b.windup` and `b.effectTicks`. Beat 1 rides the boss's
 * ordinary shared `attackTimer`/`attack()` machinery (`updateBoss`, `sim/boss.ts`) rather than a
 * field of its own: `tick()` below *holds* `b.attackTimer` at a value bigger than a whole swing for
 * every tick of beats 2-4 (reasserted every one of those ticks, so it can never reach zero early and
 * call `attack` again mid-swing — the overlap an earlier cadence allowed is gone) and lets it
 * go the instant the shield comes back up, at the very tick it draws the fresh `attackDelay` that
 * times the next beat 1. `onPhaseStart` does the same when a phase turn hands the shield back up
 * early — but only from phase 2 on: phase 1's own rest is already timed by the draw `spawnBoss`
 * makes before this hook ever runs, and drawing again there would only throw that draw away.
 * `onTransition`'s `guardUp` never redraws: the transition itself freezes `attackTimer` (see
 * `updateBoss`'s early return for `state === 'transition'`), so a draw made there would sit unused
 * and be overwritten the moment the phase actually starts.
 *
 * Phase 2 adds two things: the swing throws a second, staggered wall `TEMPLAR_SECOND_WALL_DELAY`
 * ticks after the first with a doorway at least `TEMPLAR_GAP_MIN_DISTANCE` slots from it (so the
 * player cannot simply stand in one doorway and wait), and a zigzag pair comes out during beat 1 on
 * the shared secondary timer while the shield is up.
 *
 * A `line4` of wardens marches with him from the start of each phase (`onPhaseStart`), and Bulwark
 * (`ability`) raises one more while the shield is up if the escort has thinned below four squad
 * crabs. They are ordinary squad crabs — the rune shield
 * included, which is why the Trident's piercing shot is the one that walks through the line and
 * still finds the boss behind it.
 *
 * Every draw is one `rngBoss.nextInt`, and the order inside one cycle is fixed:
 *
 * 1. `nextInt(TEMPLAR_GAP_SLOTS)` — the doorway, drawn by `attack` at the start of the wind-up.
 * 2. `nextInt(BOSS.attackJitter)` — `attackDelay`'s jitter, drawn by `updateBoss` itself right after
 *    `attack` returns. Beat 1 no longer times anything off this draw's *value* — `tick` overwrites
 *    the timer it sets before the swing can run long enough for it to matter — but the shared reset
 *    runs unconditionally for every boss kind, so the draw itself cannot be skipped or moved.
 * 3. (phase 2 only) `nextInt(TEMPLAR_GAP_SLOTS)` — the second doorway, drawn once when the first
 *    wall falls, exactly as before.
 * 4. `nextInt(BOSS.attackJitter)` — the *real* jitter for the next beat 1, drawn by `tick` the
 *    instant the shield comes back up (a draw that did not exist in the previous cadence).
 *
 * `boss-templar.test.ts` pins that sequence and the cycle's timings. The doorway triple pinned
 * against seed `templar` did *not* need re-measuring when this cadence changed — checked, not assumed: the
 * test that pins it forces each wind-up with `announce()` well before a shield-down window could
 * ever run out on its own, so draw 4 never fires inside that specific test and the three draw-1s it
 * reads stay exactly where they were. A test that let the boss run on natural cadence long enough to
 * reach a real draw 4 would need its own, separately measured pin.
 */

/** Ticks of telegraphed wind-up before the wall falls (45). */
export const TEMPLAR_WINDUP = 45;

/** Ticks the shell shield stays down once a wall has fallen (120). */
export const TEMPLAR_SHIELD_DOWN = 120;

/** Ticks between phase 2's two staggered walls (30). */
export const TEMPLAR_SECOND_WALL_DELAY = 30;

/**
 * How many slots the doorway may be drawn on: `FIREWALL_SLOTS - 1`, because a doorway is the drawn
 * slot *and the one to its right* (`nextInt(8)`, never 9, so the
 * doorway is always two slots wide). Written as a literal rather than read off `FIREWALL_SLOTS`:
 * `sim/boss.ts` and this file are a module cycle, and a top-level read across it would hit the
 * temporal dead zone. `boss-templar.test.ts` pins the two together.
 */
export const TEMPLAR_GAP_SLOTS = 8;

/** How many slots apart phase 2's two doorways must stand ("second gap >= 3 slots"). */
export const TEMPLAR_GAP_MIN_DISTANCE = 3;

/** How far a second doorway drawn too close to the first is shifted: half the wall. */
const TEMPLAR_GAP_SHIFT = 4;

/**
 * The roster the warden line is drawn from. `line4` is four cells of tier 1 and `kindForTier` reads
 * a five-kind roster tier for tier, so tier 1 is the roster's second entry: reef 6's own roster
 * (`normal, armored, heavy, elder, warden`) would field four *armored* crabs, not four wardens. This
 * boss needs a line of wardens, so the line is handed a roster that is wardens at every tier.
 */
export const TEMPLAR_GUARD: readonly CrabType[] = ['warden', 'warden', 'warden', 'warden', 'warden'];

/**
 * Cast ids queued in `b.pending`. The staggered second wall carries its own doorway in the id —
 * `SECOND_WALL + gap`, `gap` in `0..TEMPLAR_GAP_SLOTS - 1` — so the doorway is drawn once, when the
 * first wall falls and the second is queued, and nothing has to remember it in the meantime. (The
 * next swing's own draw overwrites `b.gapSlot` only once a whole cycle has resolved — wind-up plus
 * shield-down, `TEMPLAR_WINDUP + TEMPLAR_SHIELD_DOWN` ticks — far longer
 * than the second wall's 30-tick delay, but a queued wall that carries its own doorway cannot be
 * wrong about it whatever the timers do.)
 */
const SECOND_WALL = 10;

/**
 * What `b.attackTimer` is held at through every tick of the wind-up and the shield-down window
 * (bigger than a whole swing, so the shared `updateBoss` decrement can
 * never bring it to zero and fire `attack` again before the shield has come back up. `tick` below
 * reasserts this value on every such tick — it does not need to survive on its own — and only stops
 * once the shield is up again, at which point a real `attackDelay` replaces it.
 */
const TEMPLAR_ATTACK_HOLD = TEMPLAR_WINDUP + TEMPLAR_SHIELD_DOWN;

/** Bulwark's timer: 8-12 s, at the fight's start and after every use. */
function abilityTimer(rng: Rng): number {
  return 480 + rng.nextInt(241);
}

/** Whether two doorways stand far enough apart. */
function farEnough(gap: number, from: number): boolean {
  return Math.abs(gap - from) >= TEMPLAR_GAP_MIN_DISTANCE;
}

/**
 * The doorway of phase 2's staggered second wall, at least `TEMPLAR_GAP_MIN_DISTANCE` slots from the
 * first one's.
 *
 * **Exactly one draw, never a redraw loop**: how many times a boss draws per swing has
 * to be fixed, or the stream would depend on its own results. So one `nextInt(TEMPLAR_GAP_SLOTS)`,
 * and the drawn slot is corrected in place when it lands too close:
 *
 * 1. Shift first — by `TEMPLAR_GAP_SHIFT` (half the wall), modulo the slots.
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

/** Calls up a rank of four wardens, centred, at the bottom of the squad band. */
function raiseWardenLine(s: GameState): void {
  spawnSquad(s, 'line4', TEMPLAR_GUARD, idiv(FIELD_W, 2), SQUAD_BAND.maxY, 1);
}

export const TEMPLAR_HOOKS: BossHooks = {
  attack(s, b) {
    // The doorway is drawn at the very start of the wind-up, not when the wall falls: telegraphing
    // it is the whole point of the 45 ticks.
    b.windup = TEMPLAR_WINDUP;
    b.gapSlot = s.rngBoss.nextInt(TEMPLAR_GAP_SLOTS);
    s.events.push({ tick: s.tick, type: 'boss_windup' });
  },
  secondary(s, b) {
    // Zigzag pairs between the swings of phase 2, thrown while the guard is closed. They
    // are not part of a swing, so they neither open the shield nor wait for one.
    if (b.phase < 2 || b.shieldUp === 0) return;
    const m = muzzle(b);
    castZigzag(s, m.x - 925, m.y, -1);
    castZigzag(s, m.x + 925, m.y, 1);
  },
  ability(s, b) {
    // Bulwark (reef 6's ability label) is the shell shield itself: the Templar plants it
    // again. The ticks after a swing are the only window the player has on this boss, so Bulwark
    // never cuts one short — while the shield is down it does nothing at all, and the timer simply
    // re-arms. With the shield up it always announces
    // itself for the renderer and the crest sound, and on top of that
    // raises one more `line4` at the warden line's own anchor if the escort has thinned below four
    // squad crabs; four or more already standing, and there is nothing more to do this tick.
    if (b.shieldUp === 0) return;
    s.events.push({ tick: s.tick, type: 'boss_ability', name: 'shield' });
    if (s.crabs.filter((c) => c.squad > 0).length < 4) raiseWardenLine(s);
  },
  initialAbilityTimer: abilityTimer,
  nextAbilityTimer: abilityTimer,
  onHit(s, b) {
    // A player shot that reaches the boss box while the guard is closed is consumed
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
    let justOpened = false;
    if (b.effectTicks > 0) {
      b.effectTicks -= 1;
      if (b.effectTicks === 0) {
        b.shieldUp = 1;
        justOpened = true;
      }
    }
    if (b.windup > 0) {
      b.windup -= 1;
      if (b.windup === 0) swing(s, b);
    }
    // `attackTimer` only really counts down through beat 1 (rest, shield
    // up). Every tick of the wind-up or the shield-down window it is held above a whole swing, so
    // the shared decrement in `updateBoss` can never bring it to zero and call `attack` again before
    // this swing has fully resolved; the instant the shield comes back up it is handed a freshly
    // drawn `attackDelay`, which is what actually times the next wind-up.
    if (b.windup > 0 || b.shieldUp === 0) {
      b.attackTimer = TEMPLAR_ATTACK_HOLD;
    } else if (justOpened) {
      b.attackTimer = attackDelay(s, b.phase);
    }
  },
  onTransition(_s, b) {
    // No redraw here: the transition freezes `attackTimer` (see `updateBoss`'s early return for
    // `state === 'transition'`), so a draw made now would sit unused until `onPhaseStart` overwrites
    // it below — one draw, not two, for the same event.
    guardUp(b);
  },
  onPhaseStart(s, b) {
    guardUp(b);
    // A phase start hands the shield back up (early, cutting a resolving
    // swing short, for every phase after the first) or starts the fight with it already up (phase
    // 1, where `spawnBoss` has already drawn the very first `attackDelay` before this hook runs —
    // drawing again here would only throw that draw away).
    if (b.phase > 1) b.attackTimer = attackDelay(s, b.phase);
    raiseWardenLine(s);
  },
};
