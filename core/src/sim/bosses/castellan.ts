import { FIELD_W } from '../../config';
import { idiv } from '../../fixed';
import { MARCH_MARGIN } from '../../formations';
import type { Rng } from '../../rng';
import type { BossState, GameState, Obstacle } from '../../types';
import { castLarge, castShardRing, muzzle } from '../boss';
import { raiseObstacle } from '../obstacles';
import { castWave } from './azure';
import type { BossHooks } from './index';

/**
 * Frost Castellan (kind 7, spec §5.2 row 7): the old warden of Glacier Reach, who grows his walls
 * out of the sea itself. Crystals (his ability, reef 7's label) raise ice on the arena that blocks
 * both sides' fire; the player's own gunnery is what tears them down, and every crystal that falls
 * — by a player's shot or by the Castellan's own Shatter — answers with a burst of ice shards.
 *
 * Attacks ride the plain shared `attackTimer`/`attack()` cadence (`updateBoss`, `sim/boss.ts`), no
 * custom hold the way the Verdant Templar's swing needs one: phase 1 and phase 3 both throw the
 * seven-shot fan Azure's own tidal wave already casts (`castWave`, reused verbatim — its angle
 * table never moves and Azure's own fight is untouched, so the invariance test stays green); phase
 * 2 throws that same fan plus a slow `large` shot on every other attack, alternated by a bare flag
 * rather than a coin flip (task brief: "no extra draw").
 *
 * Two mechanics run on their own clocks, independent of `attackTimer`:
 *
 * - **Shatter** (phase 3's own opener, `onPhaseStart`): a 120-tick warning (`crystal_shatter`),
 *   then every crystal still standing bursts at once, left to right, and the field is swept clear.
 * - **Cold snap** (spec §5.2, reef 7's secondary mechanic): every 8-14 s, `s.chillTicks` is set to
 *   180 and Octopi's per-axis step cap halves to two thirds for as long as it counts down
 *   (`moveOctopi`, `sim/octopi.ts`, already wired — this boss only ever sets the counter). This
 *   cannot ride the shared `secondary`/`secondaryTimer` machinery the way Emerald's and the
 *   Templar's own zigzag pairs do: `updateBoss` hard-codes that timer's reset to `secondaryDelay`'s
 *   1.0-2.2 s range the instant `hooks.secondary` returns, for every boss that defines one, and a
 *   hook has no way to override it. Cold snap needs 8-14 s, so this boss defines no `secondary` at
 *   all — `b.secondaryTimer` is therefore never drawn and never moves for this boss — and runs its
 *   own timer through the generic `tick(s, b)` hook below instead, exactly where the destroyed-
 *   crystal burst and Shatter's own countdown already live.
 *
 * `BossState` carries eight fields the first campaign's five never touch (spec §5.2); this boss
 * claims four of them as plain scratch storage — a field's name describes whichever boss claims it
 * first, not a fixed meaning, the same way the Verdant Templar already reads `shieldUp`/`gapSlot`
 * as his own shield and doorway:
 *
 * - `b.windup` — Shatter's 120-tick countdown (the task brief's own suggestion; `types.ts`'s own
 *   comment for it is already generic enough that it needs no edit).
 * - `b.burst` — 0 or 1, whether the *next* phase-2 attack also throws the large shot.
 * - `b.aimTicks` — cold snap's own countdown, redrawn every time it reaches 0.
 * - `b.aimX` — not a position here: a watermark into `s.events.length`, so the destroyed-crystal
 *   scan below (which reacts to `obstacle_destroyed`, `sim/obstacles.ts`'s only way of reporting a
 *   kill — obstacles.ts stays boss-agnostic on purpose, so this is the reacting side) never bursts
 *   the same crystal twice and never misses one destroyed during a phase transition (`hitObstacle`
 *   runs every tick no matter what the boss is doing, but `hooks.tick` does not — `updateBoss`
 *   returns before reaching it while `state === 'transition'`, so more than one tick's worth of
 *   destructions can pile up between visits). Watermarked from `s.events.length` at this boss's own
 *   spawn (`onPhaseStart`, phase 1), never from 0, so nothing earlier in the session's log — there
 *   is no other source of `obstacle_destroyed` events — is ever mistaken for one of this fight's.
 *
 * None of the four is read by `view/frame.ts`'s `bossFrame()` (only `shieldUp`, `discharged` and
 * `gapSlot` feed the renderer), so this reuse never leaks a stray number onto the screen.
 *
 * Every random draw is `rngBoss`. Order within a tick follows `updateBoss`'s own order — attack,
 * then ability, then this boss's `tick` (there is no `secondary` to interleave, see above) — so on
 * a tick where several timers coincide: `attackDelay`'s jitter draw first (`nextInt(BOSS.
 * attackJitter)`, unconditional for every boss that ever attacks), then, only on the tick Crystals
 * fires, one `nextInt(6)` per crystal the raise tries for (always the fixed count — 3 up to phase
 * 2, 4 from phase 2 on — whether or not the field has room) followed by one `nextInt(481)`
 * redrawing the ability timer, then, only on the tick cold snap fires, one `nextInt(361)` redrawing
 * its own timer. `boss-castellan.test.ts` pins this, including the four spawn-time draws (facing,
 * `attackDelay(1)`, the initial ability timer, the initial cold snap timer, in that order).
 */

/** How many crystals a raise (the ability) tries for: 3 up to phase 2, one more from then on (spec §5.2). */
function raiseCount(phase: number): number {
  return 3 + (phase >= 2 ? 1 : 0);
}

// A crystal's box and toughness (spec §5.2; `obstacles.test.ts` already pins these same numbers on
// its own example crystal). Not exported: nothing outside this file needs them by name, and the
// existing obstacle tests already spell them out as literals rather than importing a constant.
const CRYSTAL_W = 500;
const CRYSTAL_H = 700;
const CRYSTAL_HP = 12;
const CRYSTAL_Y = 3600;

/**
 * The six columns a crystal may stand on (spec §5.2's "six fixed columns"), spread evenly inside
 * the march margins — `formations.ts`'s own `MARCH_MARGIN`, the room a formation keeps clear of the
 * field edges, reused here for exactly the reason it exists: nothing should be asked to stand right
 * on the edge of the field. `FIELD_W - 2*MARCH_MARGIN` (4825) divides evenly by 5 with the shipped
 * geometry, so all six columns land on whole numbers with nothing left over: 400, 1365, 2330, 3295,
 * 4260, 5225 — `MARCH_MARGIN + i*965` for `i` in 0..5.
 */
export const CRYSTAL_COLUMNS: readonly number[] = (() => {
  const step = idiv(FIELD_W - 2 * MARCH_MARGIN, 5);
  return [0, 1, 2, 3, 4, 5].map((i) => MARCH_MARGIN + i * step);
})();

/** How many crystals may stand on the field at once: one per column (spec §5.2's cap of 6). */
const CRYSTAL_CAP = CRYSTAL_COLUMNS.length;

/** Ticks of warning before Shatter bursts every crystal on the field at once (spec §5.2). */
export const SHATTER_WARNING = 120;

/** Castellan's ability timer: 7-15 s, the same range as Azure's (spec §5.2). */
function abilityTimer(rng: Rng): number {
  return 420 + rng.nextInt(481);
}

/** Cold snap's own timer: 8-14 s (spec §5.2), independent of the shared `secondary` cadence. */
function coldSnapTimer(rng: Rng): number {
  return 480 + rng.nextInt(361);
}

/** The column index (into `CRYSTAL_COLUMNS`) of every crystal already standing. */
function occupiedColumns(s: GameState): Set<number> {
  const cols = new Set<number>();
  for (const o of s.obstacles) {
    if (o.kind !== 'crystal') continue;
    const i = CRYSTAL_COLUMNS.indexOf(o.x);
    if (i >= 0) cols.add(i);
  }
  return cols;
}

/**
 * Crystals (the ability, spec §5.2): raises `raiseCount(b.phase)` crystals on distinct columns.
 *
 * Distinctness with a fixed draw count (task brief's own ruling — how many numbers a raise draws
 * must never depend on how full the field already is, or the stream would depend on its own
 * results): exactly one `nextInt(6)` per crystal the raise tries for. A draw landing on a column
 * already standing — from an earlier raise still on the field, or from an earlier crystal of this
 * very raise — walks forward one column at a time (`+1 modulo 6`, no further draw) until it finds a
 * free one. Once every column already holds a crystal (the field is at its 6-crystal cap) a draw
 * that would have walked has nowhere free to land, so the walk — and the placement — is skipped
 * outright for the rest of this raise's draws; they still happen, they just find no room.
 */
function raiseCrystals(s: GameState, b: BossState): void {
  const count = raiseCount(b.phase);
  const occupied = occupiedColumns(s);
  for (let i = 0; i < count; i++) {
    let col = s.rngBoss.nextInt(CRYSTAL_COLUMNS.length);
    if (s.obstacles.length >= CRYSTAL_CAP) continue; // the field is full; the draw above still happened
    while (occupied.has(col)) col = (col + 1) % CRYSTAL_COLUMNS.length;
    occupied.add(col);
    raiseObstacle(s, 'crystal', CRYSTAL_COLUMNS[col]!, CRYSTAL_Y, CRYSTAL_W, CRYSTAL_H, CRYSTAL_HP);
  }
  s.events.push({ tick: s.tick, type: 'crystal_raised' });
}

/** Bursts every crystal on the field at once, left to right (ties broken by y), and clears it. */
function shatterCrystals(s: GameState): void {
  const ordered: Obstacle[] = [...s.obstacles].sort((a, c) => a.x - c.x || a.y - c.y);
  for (const o of ordered) castShardRing(s, o.x, o.y);
  s.obstacles = [];
}

export const CASTELLAN_HOOKS: BossHooks = {
  attack(s, b) {
    const m = muzzle(b);
    castWave(s, m.x, m.y);
    if (b.phase === 2) {
      // Alternated by a bare flag, not a draw (task brief): every other phase-2 attack, starting
      // with the first, also throws the slow shot.
      b.burst = b.burst === 0 ? 1 : 0;
      if (b.burst === 1) castLarge(s, m.x, m.y);
    }
  },
  ability(s, b) {
    raiseCrystals(s, b);
  },
  initialAbilityTimer: abilityTimer,
  nextAbilityTimer: abilityTimer,
  onPhaseStart(s, b) {
    if (b.phase === 1) {
      // Cold snap's own timer starts once, at the fight's very first tick, and never again — a
      // later phase turn must not hand it a free redraw.
      b.aimTicks = coldSnapTimer(s.rngBoss);
      // The watermark starts at this fight's own spawn, not 0 (see the file doc above).
      b.aimX = s.events.length;
    }
    if (b.phase === 3) {
      s.events.push({ tick: s.tick, type: 'crystal_shatter' });
      b.windup = SHATTER_WARNING;
    }
  },
  tick(s, b) {
    // Shatter's warning (phase 3's opener): counts down regardless of what else this tick does, and
    // bursts the whole field the instant it reaches 0 — even an empty one, which simply bursts
    // nothing.
    if (b.windup > 0) {
      b.windup -= 1;
      if (b.windup === 0) shatterCrystals(s);
    }
    // A crystal the player destroyed: see `b.aimX`'s own doc above for why this is a watermark
    // rather than "last tick".
    for (let i = b.aimX; i < s.events.length; i++) {
      const e = s.events[i]!;
      if (e.type === 'obstacle_destroyed') castShardRing(s, e.x, e.y);
    }
    b.aimX = s.events.length;
    // Cold snap: its own 8-14 s timer, never the shared `secondary` cadence (see the file doc above).
    b.aimTicks -= 1;
    if (b.aimTicks <= 0) {
      s.chillTicks = 180;
      s.events.push({ tick: s.tick, type: 'cold_snap' });
      b.aimTicks = coldSnapTimer(s.rngBoss);
    }
  },
};
