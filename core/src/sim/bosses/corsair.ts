import { FIELD_W } from '../../config';
import { idiv } from '../../fixed';
import { MARCH_MARGIN } from '../../formations';
import type { CrabType } from '../../levels';
import type { Rng } from '../../rng';
import type { BossState, GameState } from '../../types';
import { castAxe, castStraight, muzzle } from '../boss';
import { SQUAD_BAND, SQUAD_GAP_X, SQUAD_TEMPLATES, spawnSquad } from '../squads';
import type { BossHooks } from './index';

/**
 * Gold Corsair (kind 8, spec §5.2 row 8): the old raider of Corsair Cove, who buys his crews with
 * gold and throws his own axe besides. Boarding (his ability, reef 8's own label) sends a boarding
 * crew in from a field corner every 7-15 seconds; a crew the player wipes out whole drops one
 * guaranteed prize where its last crab fell (`crew_looted`). His attack is an axe thrown at a fixed
 * target (`sim/boss.ts`'s own `castAxe`, already a parabola down and a mirrored path back up) and,
 * from phase 2 on, two of them at once. Phase 3 turns half of Boarding's firings into Spikes instead
 * — a flash, then a window in which his own armour throws a player's shot straight back down the
 * field rather than taking the hit.
 *
 * The loot mechanism itself lives outside this file, in `sim/collide.ts`'s `countDownSquad`/
 * `lootCrewIfWiped` (fix round 1, controller ruling R22) and `types.ts`'s `Squad.alive`: every squad,
 * of any boss, carries its own live crab count, decremented once per squad-crab kill through whatever
 * path reaches `killCrab`; the Corsair's own gate (`s.boss?.kind === 8`) is the only place this file's
 * own kind is checked, so a future boss with a squad of its own counts down exactly the same way and
 * simply has nothing that reacts to reaching 0.
 *
 * Attacks and Boarding both ride the plain shared `attackTimer`/`abilityTimer` cadence (`updateBoss`,
 * `sim/boss.ts`) — no custom hold the way the Verdant Templar's swing needs one, because nothing this
 * boss does ever has to freeze that cadence mid-resolution the way a swing's wind-up does.
 *
 * `BossState` fields are scratch, claimed by whichever boss reaches for them first (`types.ts`'s own
 * comment for each lists every claimant, the way it already does for `effectTicks` and `burst`):
 *
 * - `b.windup` — Spikes' 45-tick flash before the reflect window opens (the Verdant Templar's own
 *   wind-up convention, reused verbatim down to the `boss_windup` event — see `ability` below).
 * - `b.effectTicks` — Spikes' own 240-tick reflect window once the flash burns out; this is also
 *   what `view/frame.ts`'s `bossFrame()` already reads for kind 8's `reflecting` flag
 *   (`b.kind === 8 && b.effectTicks > 0`), wired ahead of this task alongside the other reefs 6-10
 *   frame fields.
 * - `b.burst` — 0 or 1, which of phase 3's two ability firings (a crew, Spikes) comes next. Neutral
 *   at spawn and untouched through phases 1-2 (Boarding never touches it there), so it is still 0 —
 *   "the next firing is a crew" — the instant phase 3 begins, without needing a reset of its own.
 *
 * **The crew cap** (spec §5.2's "at most 2 crews alive at once"): the task brief cashes this out as
 * a concrete rule, not a squad count — "if 8 or more squad crabs live, the ability re-arms without
 * spawning" — and that is what `ability` below implements literally: it counts every crab with
 * `squad > 0` (there is only ever one boss's own squads on a boss round's arena) and skips the spawn
 * once that count reaches 8, one crew's own size. This does not wait for two whole crews to
 * accumulate before blocking a third — with no crab lost between two firings a second crew never
 * gets to spawn at all, since the first already reached the threshold alone — but it does guarantee
 * the upper bound the spec names: two *fresh* eight-crab crews can never stand at once, only a crew
 * newly raised alongside whatever is left of an older, already-thinned one. Implemented exactly as
 * the brief's own sentence reads; see this task's own report for the "third firing" phrasing
 * elsewhere in the brief, which describes a stricter per-squad cap this literal rule does not
 * reproduce tick-for-tick.
 *
 * **The RNG draw order**, every draw `rngBoss`, fixed and pinned by `boss-corsair.test.ts`:
 *
 * 1. Spawn (`spawnBoss`, generic for every boss): facing (`nextInt(2)`), `attackDelay(s, 1)`'s own
 *    jitter (`nextInt(BOSS.attackJitter)`), then `initialAbilityTimer` (`nextInt(481)`). This boss
 *    defines no `secondary`, so `secondaryTimer` is never drawn at all (spawnBoss leaves it 0).
 * 2. Every tick the attack timer reaches 0: one `nextInt(AXE_TARGET_COUNT)` for the first axe's
 *    target — the second, from phase 2 on, is `(first + 2) mod AXE_TARGET_COUNT`, no draw of its
 *    own (task brief) — then the unconditional `attackDelay` jitter redraw every boss gets.
 * 3. Every tick the ability timer reaches 0: if this firing is Spikes (phase 3's even firings), no
 *    draw at all — raising the armour is not a roll of anything. Otherwise (a crew firing, which is
 *    every firing in phases 1-2 and phase 3's odd ones) one `nextInt(2)` for the side, *always made*
 *    even when the crew cap above is going to throw the result away (the task brief's own ruling:
 *    how many numbers a firing draws must never depend on how full the field already is, exactly
 *    the reasoning the Frost Castellan's own Crystals raise already established). Either way, the
 *    unconditional `nextAbilityTimer` redraw (`nextInt(481)`) follows, every boss's own cadence.
 *
 * Draining nothing every tick otherwise: this boss has no `cast`/`pending` follow-up (both axes of a
 * phase-2+ throw fire in the same call, not a delayed second one) and no `onPhaseStart`/`onTransition`
 * of its own — spec §5.2's own phase-structure line for this boss, "the transition raises nothing
 * special; pending crews keep marching through a transition", is already true of the shared plumbing
 * with no code of this boss's own: `marchCrabs`/`marchSquads` are never gated on the boss's own
 * `state`, so a crew already on the field keeps marching through a transition exactly like it does
 * the rest of the fight, and Spikes' own countdowns (`windup`/`effectTicks`) simply freeze along with
 * every other `tick`-hook-driven counter while `state === 'transition'` (`updateBoss`'s own early
 * return before it ever reaches `hooks.tick`) rather than needing a hook of this boss's own to pause
 * or reset them.
 */

/** How many fixed x positions the axe throw is aimed at (spec §5.2: "a random x of 5"). */
export const AXE_TARGET_COUNT = 5;

/**
 * The five fixed axe targets, spread evenly inside the march margins — the same idiom the Frost
 * Castellan's own `CRYSTAL_COLUMNS` uses for its six crystal columns (`MARCH_MARGIN + i*step`, the
 * first target sitting exactly on `MARCH_MARGIN` and the last on `FIELD_W - MARCH_MARGIN`). Unlike
 * that one, `FIELD_W - 2*MARCH_MARGIN` (4825) does not divide evenly by `AXE_TARGET_COUNT - 1` (4):
 * `idiv` floors the step to 1206, so the fifth target lands one unit short of a perfect mirror of the
 * first (5224 against 5225) — a harmless, fully deterministic rounding remainder, not a bug.
 */
export const AXE_TARGETS: readonly number[] = (() => {
  const step = idiv(FIELD_W - 2 * MARCH_MARGIN, AXE_TARGET_COUNT - 1);
  const xs: number[] = [];
  for (let i = 0; i < AXE_TARGET_COUNT; i++) xs.push(MARCH_MARGIN + i * step);
  return xs;
})();

/** Boarding's timer: 7-15 s, the same range the Frost Castellan's own Crystals uses (spec §5.2). */
function abilityTimer(rng: Rng): number {
  return 420 + rng.nextInt(481);
}

/** Ticks of flash before Spikes' reflect window opens (spec §5.2: 45 — the Verdant Templar's own wind-up length, reused). */
export const CORSAIR_SPIKES_WINDUP = 45;

/** Ticks the reflect window itself lasts once the flash burns out (spec §5.2: 240). */
export const CORSAIR_SPIKES_TICKS = 240;

/**
 * Squad crabs alive at which Boarding re-arms without spawning a new crew (spec §5.2's "at most 2
 * crews alive at once", cashed out by the task brief as this concrete crab count — see this file's
 * own doc above for what that does and does not guarantee).
 */
export const CORSAIR_CREW_CAP = 8;

/**
 * The roster a boarding crew draws from: reef 8's own five kinds, tiers 0..4 (design spec §4's level
 * table, row 8). Defined locally exactly as the Verdant Templar's own `TEMPLAR_GUARD` is — the level
 * table for reefs 6-10 belongs to a later task's own file (`levels.ts`), not this one's to reach into
 * before it exists. `SQUAD_TEMPLATES.crew` is `['3333', '1111']` (tiers 3 then 1), so a crew is four
 * heralds (tier 3) over four heavy crabs (tier 1) — not "four armored", a mismatch between this
 * task's own brief and its own crew template/roster data; see the report for the correction.
 */
export const CORSAIR_ROSTER: readonly CrabType[] = ['armored', 'heavy', 'warden', 'herald', 'bubbler'];

/**
 * The crew's origin x for `side` (0 left, 1 right — spec §5.2's "ONE rngBoss.nextInt(2) picks the
 * side"): the outer column's own centre lands exactly on the field margin, `MARCH_MARGIN` on the
 * left and `FIELD_W - MARCH_MARGIN` on the right. `spawnSquad`'s own `originX` names the template's
 * *centre*, not its edge, so this undoes exactly the half-span `spawnSquad` re-subtracts internally
 * (`span = (template width - 1) * SQUAD_GAP_X`, `x0 = originX - span/2`).
 *
 * Computed inside a function, never at this module's own top level: `SQUAD_GAP_X`/`SQUAD_TEMPLATES`
 * live in `squads.ts`, and `squads.ts` reaches this module indirectly — `sim/crabs.ts` imports
 * `sim/boss.ts` (for the axe's own motion), which imports the hook registry `bosses/index.ts`, which
 * imports this file — closing a cycle back through `squads.ts`'s own import of `crabs.ts`. There is
 * also a shorter, more direct cycle through this file's own top-level `import { castAxe, castStraight,
 * muzzle } from '../boss'` (fix round 1, review minor #4): `sim/boss.ts` -> `bosses/index.ts` ->
 * this file -> `sim/boss.ts`. Both cycles are harmless *here* only because every read of
 * `SQUAD_GAP_X`/`SQUAD_TEMPLATES` and every call of `castAxe`/`castStraight`/`muzzle` in this file
 * happens inside a function body (this one, or a hook method), never at module top level — a
 * top-level read of either export would risk the exact temporal-dead-zone trap the Verdant Templar's
 * own file doc already hit reading `sim/boss.ts`'s consts (see `templar.ts`, `TEMPLAR_GAP_SLOTS`).
 */
function crewOriginX(side: number): number {
  const span = (SQUAD_TEMPLATES.crew[0]!.length - 1) * SQUAD_GAP_X;
  const half = idiv(span, 2);
  return side === 0 ? MARCH_MARGIN + half : FIELD_W - MARCH_MARGIN - half;
}

export const CORSAIR_HOOKS: BossHooks = {
  attack(s, b) {
    // The axe throw (spec §5.2): one target drawn of five; a second, from phase 2 on, at the first's
    // own "opposite-ish" index with no extra draw (task brief: `(first + 2) mod 5`).
    const m = muzzle(b);
    const i = s.rngBoss.nextInt(AXE_TARGET_COUNT);
    castAxe(s, m.x, m.y, AXE_TARGETS[i]!);
    if (b.phase >= 2) castAxe(s, m.x, m.y, AXE_TARGETS[(i + 2) % AXE_TARGET_COUNT]!);
  },
  ability(s, b) {
    if (b.phase === 3 && b.burst === 1) {
      // Spikes (spec §5.2): phase 3's even firings, alternating with Boarding's crews below. No
      // draw at all — raising the armour is not a roll of anything. `b.windup` telegraphs it for
      // `CORSAIR_SPIKES_WINDUP` ticks, reusing the Verdant Templar's own wind-up convention
      // (`boss_windup`); `tick` below opens the reflect window once the flash burns out.
      b.burst = 0; // the next phase-3 firing goes back to Boarding
      b.windup = CORSAIR_SPIKES_WINDUP;
      s.events.push({ tick: s.tick, type: 'boss_windup' });
      return;
    }
    if (b.phase === 3) b.burst = 1; // this firing was Boarding; the next one raises Spikes
    // Boarding (spec §5.2): ONE draw for the side, always made — a fixed draw count regardless of
    // the cap below, exactly the ruling the Frost Castellan's own Crystals raise already
    // established for its own fixed draw count.
    const side = s.rngBoss.nextInt(2);
    if (s.crabs.filter((c) => c.squad > 0).length >= CORSAIR_CREW_CAP) return; // re-arms, nothing spawns
    spawnSquad(s, 'crew', CORSAIR_ROSTER, crewOriginX(side), SQUAD_BAND.maxY, side === 0 ? 1 : -1);
  },
  initialAbilityTimer: abilityTimer,
  nextAbilityTimer: abilityTimer,
  onHit(s, b, shot) {
    // Spikes' reflect window (spec §5.2): while `b.effectTicks` is running, a hit costs the boss
    // nothing at all — it comes back down the field instead, from the x it struck at, as a plain
    // enemy `straight` shot from the boss box's own bottom edge (`muzzle`). `collide.ts`'s
    // `hitCrabs` already consumes *any* player shot that reaches the boss box outright, piercing or
    // not, so a piercing shot is reflected exactly the same way — it never had a path through the
    // boss box to begin with. `shot` is undefined only when a caller reaches `damageBoss` directly
    // without one (every real hit through `hitCrabs` always supplies it); `muzzle(b).x` — the boss's
    // own centre — stands in for that case.
    if (b.effectTicks <= 0) return false;
    const x = shot ? shot.x : muzzle(b).x;
    castStraight(s, x, muzzle(b).y);
    s.events.push({ tick: s.tick, type: 'boss_reflect' });
    return true;
  },
  tick(s, b) {
    // The flash burns down first, so a flash ending this very tick opens the reflect window the same
    // tick; the window itself follows — the same order, for the same reason, as the Verdant
    // Templar's own `effectTicks`-then-`windup` `tick` (ruling R14): a fresh value `windup` sets is
    // never decremented on the very tick it starts.
    if (b.effectTicks > 0) b.effectTicks -= 1;
    if (b.windup > 0) {
      b.windup -= 1;
      if (b.windup === 0) b.effectTicks = CORSAIR_SPIKES_TICKS;
    }
  },
};
