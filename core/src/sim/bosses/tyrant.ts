import { FIELD_W } from '../../config';
import { idiv } from '../../fixed';
import type { CrabType } from '../../levels';
import type { Rng } from '../../rng';
import type { BossState, Crab, GameState } from '../../types';
import { castBolt, castOrb, muzzle } from '../boss';
import { damageOctopiDirect, killCrab } from '../collide';
import { SQUAD_BAND, spawnSquad } from '../squads';
import type { BossHooks } from './index';

/**
 * Storm Tyrant (kind 9, spec §5.2 row 9): the old warden of Stormbreak Shelf, who does not aim his
 * lightning at Octopi so much as forbid the water it stands in. The field is six equal vertical
 * lanes; Stormlanes (his ability, reef 9's own label) flashes a handful of them, then strikes every
 * one that flashed — punishing whoever is still standing in the lane, and clearing the lane itself of
 * anything else that was in the way. His own attack, a forked bolt, never draws a thing; the homing
 * orb he adds from phase 2 is the only shot of his that does anything clever on its own, and that
 * cleverness (`hitOrbs`, `updateEnemyShots`) already belongs to `sim/boss.ts`'s shared plumbing —
 * this file only ever decides *when* to cast one.
 *
 * **Lanes** (`laneOf`, below): the field split into `LANE_COUNT` equal vertical strips,
 * `[idiv(FIELD_W*i, LANE_COUNT), idiv(FIELD_W*(i+1), LANE_COUNT))` for lane `i` — a half-open
 * interval, so a point sitting exactly on a boundary shared by two lanes belongs to the one that
 * *starts* there (the higher-index lane), never the one ending there. `laneOf` is total rather than
 * partial: nothing in real play ever asks it about an x outside `[0, FIELD_W)`, but a point at or
 * past the right edge still resolves to the last lane rather than throwing, so a defensive caller
 * (or a test) never has to special-case it.
 *
 * **Stormlanes** (`ability`): picks `2 + idiv(b.phase, 2)` distinct lanes — 2 in phase 1, 3 in phases
 * 2-3, 4 in phase 4 — with a fixed draw count, one `rngBoss.nextInt(LANE_COUNT)` per lane tried,
 * regardless of collisions: a draw that lands on a lane already spoken for (by an earlier draw of
 * this very firing, or — defensively — by an entry `s.lanes` still carries from an earlier firing)
 * walks forward one lane at a time (`+1 modulo LANE_COUNT`, no further draw) until it finds a free
 * one — the exact rule the Frost Castellan's own `raiseCrystals` uses for its six columns
 * (`castellan.ts`). Unlike that one, this never needs a "the field is full, skip the walk" escape
 * hatch (`raiseCrystals`'s own `CRYSTAL_CAP` check): a crystal stands until something destroys it, so
 * repeated raises really can fill all six columns over a long fight, but a lane only ever flashes for
 * `75 − 10·phase` ticks — at most 65, phase 1's own value — before it strikes and is removed, and
 * Stormlanes' own timer never re-fires sooner than 360 ticks after the last one. 65 is nowhere near
 * 360, so every lane of a previous firing has already struck, and been dropped from `s.lanes`, long
 * before the next firing ever runs — `s.lanes` is provably empty every time `ability` looks at it in
 * real play, which is exactly why walking past a pre-existing entry never has to give up. Each lane
 * gets `warning = 75 − 10·b.phase` ticks (65/55/45/35 for phases 1-4) before it strikes, all pushed
 * as `[lane, warning]` pairs into `s.lanes`, and one `lane_warning` for the whole firing — the same
 * "one event per activation, not per item raised" convention `crystal_raised`/`boss_windup` already
 * use elsewhere, since a renderer can already read every lane `s.lanes` itself carries.
 *
 * **The strike** (`strikeLane`, driven by `tickThroughTransition` below): unlike `lane_warning`, one
 * `lane_strike` *per lane* that reaches 0 this tick — the task brief's own "when an entry reaches 0
 * it STRIKES: emit lane_strike" reads as a per-entry action, not a per-firing one, and several lanes
 * of the same firing (sharing the same `warning`) do strike on the very same tick. A struck lane:
 *
 * - Costs Octopi one life through `damageOctopiDirect` (`sim/collide.ts`) — the same SHIELD_BARRIER/
 *   INVINCIBILITY-respecting damage function a crab's own shot goes through, just without a shot in
 *   `s.enemyShots` to match against — if Octopi's own centre x falls in the lane.
 * - Removes every `bubble`/`orb` enemy shot whose centre falls in it, with no event of its own (a
 *   lane strike is not a shot landing, and the spec names no `bubble_pop`/similar for this).
 * - Kills every *squad* crab whose centre falls in it through `killCrab` (`sim/collide.ts`) — exactly
 *   the path a lethal bullet hit or WAVE_BLAST already uses, so the per-squad `alive` counter (and,
 *   for any boss whose squad loots on a wipe, that check too) counts this exactly like any other
 *   kill. **Score included**: spec §5.1's own general squad rule is "Squad crabs score normally when
 *   shot", and a lane strike is exactly that aimed at a whole lane instead of one bullet — there is no
 *   second, score-less kill path for a squad crab anywhere in the game, and inventing one here would
 *   let a squad's `alive` count reach 0 without the loot check (a future boss's, or a shared one)
 *   ever running the way an ordinary kill always does. A boss round never carries a wave (`squads.ts`
 *   own doc), so in real play every crab on the field during this fight already has `squad > 0`; the
 *   check is kept anyway because "squad crab" is the letter of the spec, not "any crab that happens
 *   to be there".
 *
 * **Discharge**: after a tick that struck at least one lane, `b.discharged = TYRANT_DISCHARGE_TICKS`
 * (refreshed, not stacked, exactly the brief's own "if a new strike lands while already discharged,
 * the timer restarts at 180") and one `boss_discharged`. `sim/boss.ts`'s own `dischargeMult` doubles
 * `damageBoss`'s `amount` while it is above 0, gated on `b.kind === 9` — the same kind-gated-
 * multiplier idiom `rageMult`/`rageDelay` already use for Crimson, rather than a new `BossHooks`
 * member: `damageBoss` runs the same few lines for every boss kind regardless, so a plain function
 * that reads `b.kind` costs the other kinds nothing extra to call and changes no arithmetic for them
 * (`b.discharged` is 0 for every one of them, for the whole of any fight, always).
 *
 * **Why the lanes and the discharge countdown share one hook, `tickThroughTransition`, instead of
 * living in the ordinary `tick`:** spec §5.2's own amendment is explicit that "lanes already warned
 * keep counting down through a transition", but `updateBoss` (`sim/boss.ts`) returns before it ever
 * reaches `hooks.tick` while `state === 'transition'` — every other boss's own `tick`-driven counter
 * (Corsair's `effectTicks`, Castellan's `aimTicks`) freezes for exactly that reason, unremarked, and
 * that is fine for them because nothing in the spec asks otherwise. Here it is asked otherwise, so
 * this boss defines a *new* optional hook instead, `BossHooks.tickThroughTransition`
 * (`sim/bosses/index.ts`), which `updateBoss` calls unconditionally right after the boss's own
 * movement, before it ever looks at `state` — undefined for every kind but this one, so it changes
 * nothing for kinds 1-8 and 10. The discharge window has no such requirement of its own (`damageBoss`
 * already refuses to apply any damage at all while `state === 'transition'`, discharged or not, so
 * freezing or not freezing the countdown during one is unobservable either way) but lives in the same
 * hook anyway rather than splitting this boss's per-tick bookkeeping across two: one hook that always
 * runs is simpler than two hooks with different reach, for one boss whose only per-tick bookkeeping
 * is these two counters. Decremented *before* a strike below can set it fresh, so a discharge just
 * triggered is never shaved to 179 on the very tick it starts — the same "never decrement a value the
 * same tick it is (re)set" rule Corsair's/Templar's own `effectTicks` already follow.
 *
 * **The escort** (`onPhaseStart`, phases 2 and 4 only): `spawnSquad(s, 'pair', TYRANT_ESCORT,
 * idiv(FIELD_W, 2), SQUAD_BAND.maxY, dir)`, `dir` 1 at phase 2 and -1 at phase 4 (no draw — spec
 * §5.2's own "escort squad ... at the start of phases 2 and 4", the task brief's "dir alternates, no
 * draw"). `SQUAD_TEMPLATES.pair` (`squads.ts`) is `['11']`: one row, two cells, both tier digit `1`.
 * `kindForTier` reads a roster's tier-`n` entry as `roster[n]` by way of `TIER_KINDS` (`levels.ts`),
 * so a five-kind roster with anything but `bombardier` at index 1 would field the wrong crab — the
 * exact trap the Verdant Templar's own file doc calls out for `line4`'s tier-1 cells. `TYRANT_ESCORT`
 * sidesteps it exactly the way `TEMPLAR_GUARD` does: every tier maps to `bombardier`, so whichever
 * index `pair`'s two `1`s resolve to, both crabs come out bombardiers regardless.
 *
 * **The attack** (`attack`): a `castBolt` fork every attack, no draw. From phase 2 on, one `orb` is a
 * *candidate* every other attack — `b.burst` (scratch, this boss's own use of it) flips every attack
 * once `b.phase >= 2`, unconditionally, the same "the schedule never depends on whether anything
 * actually happens" ruling the Frost Castellan's own phase-2 large shot already established
 * (`castellan.ts`'s `attack`, alternated "by a bare flag, not a draw"); only on the half of those
 * attacks where the flag lands on 1 does it actually try `castOrb`, and even then only if
 * `s.enemyShots` carries no `orb` yet (spec §5.2: "one orb at a time"). The flag is never reset at a
 * phase boundary, so the alternation runs continuously across phases 2, 3 and 4 rather than
 * restarting fresh at each one — nothing in the spec asks for a reset, and Castellan's own precedent
 * (a flag that starts at its spawn-time neutral 0 and is never touched before its first live use)
 * already reads the same way for "the first eligible attack casts one".
 *
 * **The RNG draw order**, every draw `rngBoss`, fixed:
 *
 * 1. Spawn (`spawnBoss`, generic for every boss): facing (`nextInt(2)`), `attackDelay(s, 1)`'s own
 *    jitter (`nextInt(BOSS.attackJitter)`), then the initial ability timer (`nextInt(241)`, offset by
 *    360). This boss defines no `secondary`, so `secondaryTimer` is never drawn (left 0 by `spawnBoss`).
 * 2. Every tick, `updateBoss` calls `tickThroughTransition` *before* it ever checks `state` — draws
 *    nothing at all, strike or no strike, transition or no transition.
 * 3. Only once fighting (never during a transition — `updateBoss`'s own early return): if the attack
 *    timer reaches 0, `attack` itself draws nothing (`castBolt`/`castOrb` are both plain arithmetic),
 *    then the unconditional `attackDelay` jitter redraw every boss gets (`nextInt(BOSS.attackJitter)`).
 * 4. If the ability timer reaches 0 (this boss has no `secondary`, so nothing sits between attack and
 *    ability): `ability` draws exactly `2 + idiv(b.phase, 2)` numbers, one `nextInt(LANE_COUNT)` per
 *    lane tried (never more, never fewer, whatever the walk above does with any one of them), then
 *    the unconditional `nextAbilityTimer` redraw (`nextInt(241)`).
 * 5. `runPending` (no `cast`/`pending` for this boss) and the ordinary `hooks.tick` (undefined for
 *    this boss — both counters this fight needs already live in `tickThroughTransition` above) draw
 *    nothing.
 *
 * A struck lane's own squad-crab kills (`killCrab`) draw from `rngBoosts` (`rollDrop`'s own stream),
 * never `rngBoss` — the same pre-existing, variable-per-kill drop roll every crab death in the game
 * already makes, untouched by this task and irrelevant to the fixed `rngBoss` schedule above.
 *
 * `boss-tyrant.test.ts` pins this sequence, the lane/warning/discharge numbers and the escort.
 */

/** How many equal vertical lanes the field is split into (spec §5.2 row 9). */
export const LANE_COUNT = 6;

/** The left edge of lane `i`; lane `LANE_COUNT` is `FIELD_W` itself, one past the last real lane. */
function laneStart(i: number): number {
  return idiv(FIELD_W * i, LANE_COUNT);
}

/**
 * Which of the `LANE_COUNT` equal vertical lanes contains `x` (spec §5.2 row 9): lane `i` spans
 * `[laneStart(i), laneStart(i + 1))`, a half-open interval, so a point sitting exactly on a shared
 * boundary belongs to the lane that starts there, never the one that ends there. Total rather than
 * partial: an `x` at or past `FIELD_W` still resolves to the last lane rather than throwing.
 */
export function laneOf(x: number): number {
  for (let i = LANE_COUNT - 1; i >= 0; i--) {
    if (x >= laneStart(i)) return i;
  }
  return 0;
}

/** Ticks of Stormlanes' own timer: 6-10 s (spec §5.2), at the fight's start and after every firing. */
function abilityTimer(rng: Rng): number {
  return 360 + rng.nextInt(241);
}

/** How many distinct lanes one Stormlanes firing warns (spec §5.2): 2/3/3/4 for phases 1-4. */
function laneCount(phase: number): number {
  return 2 + idiv(phase, 2);
}

/** Ticks a warned lane flashes before it strikes (spec §5.2): 65/55/45/35 for phases 1-4. */
function warningTicks(phase: number): number {
  return 75 - 10 * phase;
}

/** Ticks the Storm Tyrant is discharged (double damage) after a strike (spec §5.2 row 9). */
export const TYRANT_DISCHARGE_TICKS = 180;

/**
 * The escort roster (spec §5.2): `SQUAD_TEMPLATES.pair` is `['11']`, both cells tier digit 1, so
 * every tier maps to `bombardier` — the same all-one-kind trick `TEMPLAR_GUARD` uses for the warden
 * line, so both crabs come out bombardiers regardless of which index `kindForTier` actually reads.
 */
export const TYRANT_ESCORT: readonly CrabType[] = ['bombardier', 'bombardier', 'bombardier', 'bombardier', 'bombardier'];

/** The lanes an in-flight `s.lanes` already carries, as a set (mirrors Castellan's `occupiedColumns`). */
function occupiedLanes(s: GameState): Set<number> {
  const set = new Set<number>();
  for (let i = 0; i < s.lanes.length; i += 2) set.add(s.lanes[i]!);
  return set;
}

/**
 * Stormlanes (the ability, spec §5.2): warns `laneCount(b.phase)` distinct lanes for
 * `warningTicks(b.phase)` ticks each. See the file doc for the fixed draw count and the walk-forward
 * distinctness rule.
 */
function fireStormlanes(s: GameState, b: BossState): void {
  const n = laneCount(b.phase);
  const warning = warningTicks(b.phase);
  const occupied = occupiedLanes(s);
  for (let i = 0; i < n; i++) {
    let lane = s.rngBoss.nextInt(LANE_COUNT);
    while (occupied.has(lane)) lane = (lane + 1) % LANE_COUNT;
    occupied.add(lane);
    s.lanes.push(lane, warning);
  }
  s.events.push({ tick: s.tick, type: 'lane_warning' });
}

/** Resolves one lane's strike (spec §5.2). See the file doc for what it does and why. */
function strikeLane(s: GameState, lane: number): void {
  s.events.push({ tick: s.tick, type: 'lane_strike' });
  if (laneOf(s.octopi.x) === lane) damageOctopiDirect(s, 1);
  s.enemyShots = s.enemyShots.filter(
    (shot) => !((shot.kind === 'bubble' || shot.kind === 'orb') && laneOf(shot.x) === lane),
  );
  if (s.crabs.length === 0) return;
  const hit: Crab[] = [];
  const spared: Crab[] = [];
  for (const c of s.crabs) {
    if (c.squad > 0 && laneOf(c.x) === lane) hit.push(c);
    else spared.push(c);
  }
  if (hit.length === 0) return;
  for (const c of hit) killCrab(s, c);
  s.crabs = spared;
}

export const TYRANT_HOOKS: BossHooks = {
  attack(s, b) {
    // The fork (spec §5.2): every attack, no draw.
    const m = muzzle(b);
    castBolt(s, m.x, m.y);
    if (b.phase < 2) return;
    // The orb, from phase 2 (spec §5.2): a bare flag, not a draw (see the file doc) — every other
    // attack is a candidate, and even then only while no orb is already alive.
    b.burst = b.burst === 0 ? 1 : 0;
    if (b.burst === 0) return;
    if (s.enemyShots.some((shot) => shot.kind === 'orb')) return; // one orb at a time
    castOrb(s, m.x, m.y);
  },
  ability(s, b) {
    fireStormlanes(s, b);
  },
  initialAbilityTimer: abilityTimer,
  nextAbilityTimer: abilityTimer,
  onPhaseStart(s, b) {
    // The escort (spec §5.2): phases 2 and 4 only, direction alternating with no draw.
    if (b.phase === 2) spawnSquad(s, 'pair', TYRANT_ESCORT, idiv(FIELD_W, 2), SQUAD_BAND.maxY, 1);
    else if (b.phase === 4) spawnSquad(s, 'pair', TYRANT_ESCORT, idiv(FIELD_W, 2), SQUAD_BAND.maxY, -1);
  },
  tickThroughTransition(s, b) {
    // Discharge counts down first, so a strike below that sets it fresh is never shaved on the very
    // tick it starts (see the file doc for why this lives here rather than the ordinary `tick`).
    if (b.discharged > 0) b.discharged -= 1;
    if (s.lanes.length === 0) return;
    const kept: number[] = [];
    let struck = false;
    for (let i = 0; i < s.lanes.length; i += 2) {
      const lane = s.lanes[i]!;
      const ticksLeft = s.lanes[i + 1]! - 1;
      if (ticksLeft > 0) {
        kept.push(lane, ticksLeft);
        continue;
      }
      struck = true;
      strikeLane(s, lane);
    }
    s.lanes = kept;
    if (struck) {
      b.discharged = TYRANT_DISCHARGE_TICKS;
      s.events.push({ tick: s.tick, type: 'boss_discharged' });
    }
  },
};
