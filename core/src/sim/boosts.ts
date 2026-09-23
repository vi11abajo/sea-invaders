import { BOOSTS, DROP, FIELD_H, FIELD_W, RARITY_LISTS, SCORE_DECAY, OCTOPI, WELL, boostDurationPctFor } from '../config';
import { idiv, isqrt } from '../fixed';
import type { ActiveBoost, BoostType, Bullet, Drop, GameState } from '../types';
import { applyEffect, removeEffect } from './boostEffects';
// Ruling R25: only for the one call site below, inside `updateBoosts`, never at this module's own
// top level — `boosts → bosses → <boss module> → boss → boosts` closes a cycle back here, and this
// import is the edge that closes it. It stays safe only because `BOSS_HOOKS` is never read until a
// pickup actually happens, long after every module in the cycle has finished loading; the same
// trap every reefs 6-10 boss module's own doc already calls out for reaching into `boss.ts`/
// `boosts.ts` from a top-level read of its own.
import { BOSS_HOOKS } from './bosses';

/**
 * The pool RANDOM_CHAOS picks from (spec §5.2/C8): every boost except RANDOM_CHAOS itself, in
 * `BoostType`'s declaration order (14 candidates — RICOCHET was removed from the game entirely,
 * owner decision, Phase 3A.1 lane C). Includes the instant boosts (HEALTH_BOOST, COIN_SHOWER,
 * WAVE_BLAST) and the permanent ones (SHIELD_BARRIER, SPEED_TAMER); `activatePicked` below gives
 * each of those its own chaos-specific handling (spec C8).
 */
const CHAOS_POOL: BoostType[] = [
  'RAPID_FIRE', 'ICE_FREEZE', 'HEALTH_BOOST', 'POINTS_FREEZE', 'SHIELD_BARRIER', 'AUTO_TARGET',
  'INVINCIBILITY', 'MULTI_SHOT', 'SCORE_MULTIPLIER', 'WAVE_BLAST', 'COIN_SHOWER', 'GRAVITY_WELL',
  'PIERCING_BULLETS', 'SPEED_TAMER',
];

const DROP_HALF = idiv(DROP.size, 2);

/**
 * The rarity-then-item pick every drop makes (common < 50, rare < 85, epic < 97, else legendary,
 * then a uniform pick within that rarity's list — spec §5.1-5.2, legacy `DISTRIBUTION` order). Two
 * `rngBoosts` draws, shared by `rollDrop`'s own chance-gated drop and `spawnDrop`'s guaranteed one
 * below, so the two can never disagree on how a drop's boost is chosen.
 */
function pickDropBoost(s: GameState): BoostType {
  const r = s.rngBoosts.nextInt(100);
  const rarity = r < 50 ? 'common' : r < 85 ? 'rare' : r < 97 ? 'epic' : 'legendary';
  const list = RARITY_LISTS[rarity];
  return list[s.rngBoosts.nextInt(list.length)]!;
}

/**
 * Rolls a drop at (x, y) on a crab kill: `DROP.chance`% chance, then `pickDropBoost`'s own
 * rarity-then-item pick. No-op when the run has boosts disabled.
 */
export function rollDrop(s: GameState, x: number, y: number): void {
  if (!s.run.features.boosts) return;
  if (s.rngBoosts.nextInt(100) >= DROP.chance) return;
  const boost = pickDropBoost(s);
  s.drops.push({ x, y, boost, ttl: DROP.ttl });
  s.events.push({ tick: s.tick, type: 'boost_drop', boost });
}

/**
 * A guaranteed drop at (x, y) — spec §5.2, the Gold Corsair's boarding-crew loot
 * (`sim/collide.ts`'s `lootCrewIfWiped`): skips `rollDrop`'s own chance roll entirely, so exactly two
 * `rngBoosts` draws (`pickDropBoost`'s own rarity-then-item pick, the same two draws `rollDrop` makes
 * for any drop it does decide to make), and always lands one. Pushes no `boost_drop` event of its
 * own — the caller announces the drop under the spec's own name for this one (`crew_looted`), so
 * this never double-announces the same drop under two names. No-op when the run has boosts disabled,
 * mirroring `rollDrop`; every boss round's own run has them enabled today, so this is a defensive
 * match rather than a path any current fight can reach.
 */
export function spawnDrop(s: GameState, x: number, y: number): void {
  if (!s.run.features.boosts) return;
  s.drops.push({ x, y, boost: pickDropBoost(s), ttl: DROP.ttl });
}

/**
 * Rolls GRAVITY_WELL's centre (spec C1, legacy `boost-manager.js:317-336` `activateBoost`): a
 * seeded random point inset `WELL.margin` from the field edges, re-rolled while it lands within
 * `WELL.minDist` of Octopi, up to `WELL.maxAttempts` rolls in total — the last roll stands even if
 * every attempt landed too close. Neither Octopi's position nor the drop's own position is used as
 * the centre any more (that was the port's own invention, not the legacy's).
 */
function rollWellCentre(s: GameState): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (let attempt = 0; attempt < WELL.maxAttempts; attempt++) {
    x = WELL.margin + s.rngBoosts.nextInt(FIELD_W - 2 * WELL.margin);
    y = WELL.margin + s.rngBoosts.nextInt(FIELD_H - 2 * WELL.margin);
    const dx = x - s.octopi.x;
    const dy = y - s.octopi.y;
    if (dx * dx + dy * dy >= WELL.minDist * WELL.minDist) break;
  }
  return { x, y };
}

/**
 * GRAVITY_WELL's per-tick pull on enemy fire (spec C1, legacy `boost-effects.js:203-247`
 * `applyGravityWellEffect`): every enemy shot (any kind) has its velocity replaced outright to
 * point at `well` at `WELL.speed` units/tick; one that ends up within `WELL.absorb` units of the
 * centre is removed instead (the legacy's "eaten by the black hole" moment). Crabs are never pulled
 * — the legacy's well only ever touched bullets, never crab bodies.
 */
function applyGravityWell(s: GameState, well: { x: number; y: number }): void {
  const kept: Bullet[] = [];
  for (const b of s.enemyShots) {
    const dx = well.x - b.x;
    const dy = well.y - b.y;
    const len = isqrt(dx * dx + dy * dy);
    if (len <= WELL.absorb) continue;
    b.vx = idiv(dx * WELL.speed, len);
    b.vy = idiv(dy * WELL.speed, len);
    kept.push(b);
  }
  s.enemyShots = kept;
}

/**
 * Advances every drop (fall, ttl, pickup by Octopi) and every active boost timer, then applies
 * GRAVITY_WELL's pull for the tick (if one is active), in that order. Called once per tick after
 * `hitOctopi` (spec §5.1-5.2). A pickup is consumed only when `activateBoost` reports it applied (spec
 * C4: a WAVE_BLAST — direct or chaos-picked — with no crabs on screen leaves the drop falling).
 */
export function updateBoosts(s: GameState): void {
  // Iterate a snapshot, not `s.drops` itself: a WAVE_BLAST pickup (via `activateBoost` below) calls
  // `rollDrop` for every crab it kills, pushing new drops into `s.drops`, and without this those
  // would be picked up by this same pass and get an extra fall step (or even be collected) on the
  // same tick. Order is deterministic: survivors first, then anything spawned during this pass, in
  // the order `rollDrop` pushed them.
  const list = s.drops;
  s.drops = [];
  const kept: Drop[] = [];
  for (const d of list) {
    d.y += DROP.fall;
    d.ttl -= 1;
    if (d.ttl <= 0 || d.y - DROP_HALF > FIELD_H) continue;
    const reach = DROP_HALF + OCTOPI.hitRadius;
    const inReach = Math.abs(d.x - s.octopi.x) < reach && Math.abs(d.y - s.octopi.y) < reach;
    if (inReach) {
      const result = activateBoost(s, d.boost);
      if (result.consumed) {
        s.events.push({ tick: s.tick, type: 'boost_pickup', boost: d.boost });
        // Ruling R25 (the Abyssal Huntsman's Mirror, spec §5.2): the drop's OWN boost, `d.boost` —
        // never `result.type` — so a RANDOM_CHAOS pickup mirrors nothing, whatever it rolled.
        // Undefined for kinds 1-9, so this changes nothing for them.
        if (s.boss) BOSS_HOOKS[s.boss.kind].onBoostPickup?.(s, s.boss, d.boost);
        continue;
      }
      // Not consumed (WAVE_BLAST with no crabs, spec C4): the drop keeps falling, kept below.
    }
    kept.push(d);
  }
  s.drops = [...kept, ...s.drops];

  const active: ActiveBoost[] = [];
  for (const a of s.boosts.active) {
    if (a.ticksLeft > 0) {
      a.ticksLeft -= 1;
      if (a.ticksLeft === 0) {
        removeEffect(s, a.type);
        s.events.push({ tick: s.tick, type: 'boost_expire', boost: a.type });
        continue;
      }
    }
    active.push(a);
  }
  s.boosts.active = active;

  if (s.boosts.well) applyGravityWell(s, s.boosts.well);
}

/** (Re)sets `type`'s active-timer entry to `ticksLeft`, resetting an already-active one instead of stacking a second entry. */
function setActive(s: GameState, type: BoostType, ticksLeft: number): void {
  const existing = s.boosts.active.find((a) => a.type === type);
  if (existing) existing.ticksLeft = ticksLeft;
  else s.boosts.active.push({ type, ticksLeft });
}

/**
 * Applies `picked`'s activation effect and (re)sets its active-timer entry, given either its own
 * table duration (a direct pickup, `chaosTicks === null`) or RANDOM_CHAOS's 600-900 tick roll (spec
 * C8) — which overrides even an instant or permanent boost's own duration, except where the boost
 * has no "timer" concept to override at all:
 * - HEALTH_BOOST/COIN_SHOWER/WAVE_BLAST (instant) always apply once, ignoring any duration.
 * - SHIELD_BARRIER: a no-op (still consumed) while a shield is already up (spec C6, applies to a
 *   chaos pick too — the legacy's own re-activation guard runs unconditionally inside
 *   `activateBoost`, so a chaos roll landing on SHIELD_BARRIER is subject to it exactly like a
 *   direct pickup); otherwise `shield = 3` and its active entry's `ticksLeft` is the chaos roll when
 *   picked by chaos (a genuinely timed shield, spec C8) or `-1` (until broken) for a direct pickup.
 * - SPEED_TAMER: always adds a stack, capped at 10; a chaos pick additionally pushes its own timed
 *   active entry (so multiple chaos-granted stacks can expire independently, each removing exactly
 *   one stack) — but only when a stack was actually added: at the cap `applyEffect` is a no-op, and
 *   a chaos pick that granted nothing must not later remove a stack on expiry either (fix round 1).
 *   A direct pickup instead (re)sets the single permanent (`-1`) entry, which never expires.
 * - GRAVITY_WELL: rolls a fresh centre (`rollWellCentre`) every time it activates, direct or chaos.
 * Kakashi's Copy (champions and skins spec §1) stretches every timer this sets to
 * `boostDurationPctFor` (150 %) of itself — the table duration and a chaos roll alike — while an
 * instant (0) or until-consumed (-1) duration passes through untouched; at 100 % (every other
 * variant) `stretch` is the identity.
 * Returns whether the pickup should be consumed (only WAVE_BLAST with no crabs is not, spec C4).
 */
function activatePicked(s: GameState, picked: BoostType, chaosTicks: number | null): boolean {
  const pct = boostDurationPctFor(s.run.octopi);
  const stretch = (d: number): number => (d > 0 && pct !== 100 ? idiv(d * pct, 100) : d);
  const chaos = chaosTicks === null ? null : stretch(chaosTicks);
  if (picked === 'HEALTH_BOOST' || picked === 'COIN_SHOWER' || picked === 'WAVE_BLAST') {
    return applyEffect(s, picked);
  }
  if (picked === 'SHIELD_BARRIER') {
    if (s.boosts.shield > 0) return true; // spec C6: re-pickup while active is a no-op, still consumed
    applyEffect(s, picked); // shield = 3
    setActive(s, picked, chaos ?? -1);
    return true;
  }
  if (picked === 'SPEED_TAMER') {
    const before = s.boosts.tamerStacks;
    applyEffect(s, picked); // tamerStacks += 1 (capped at 10)
    if (chaos !== null) {
      // Only push a timed entry when a stack was actually added: at the cap (10) applyEffect is a
      // no-op, so a chaos pick that grants nothing must not later remove a stack on expiry either.
      if (s.boosts.tamerStacks > before) s.boosts.active.push({ type: picked, ticksLeft: chaos });
    } else {
      setActive(s, picked, -1);
    }
    return true;
  }
  if (picked === 'GRAVITY_WELL') {
    s.boosts.well = rollWellCentre(s);
    setActive(s, picked, chaos ?? stretch(BOOSTS.GRAVITY_WELL.duration));
    return true;
  }
  // Every other timed boost (RAPID_FIRE, ICE_FREEZE, POINTS_FREEZE, AUTO_TARGET, INVINCIBILITY,
  // MULTI_SHOT, SCORE_MULTIPLIER, PIERCING_BULLETS): just (re)set its timer.
  setActive(s, picked, chaos ?? stretch(BOOSTS[picked].duration));
  return true;
}

/**
 * Activates or refreshes a boost, and returns the `BoostType` actually applied (its argument,
 * except for RANDOM_CHAOS, which uniformly picks one of `CHAOS_POOL` and activates that instead —
 * spec C8) plus whether the pickup should be consumed (spec C4: false only for a WAVE_BLAST, direct
 * or chaos-picked, with no crabs on screen — the legacy's `activateBoost` returning `false`).
 */
export function activateBoost(s: GameState, type: BoostType): { type: BoostType; consumed: boolean } {
  if (type === 'RANDOM_CHAOS') {
    const picked = CHAOS_POOL[s.rngBoosts.nextInt(CHAOS_POOL.length)]!;
    const ticksLeft = 600 + s.rngBoosts.nextInt(301);
    return { type: picked, consumed: activatePicked(s, picked, ticksLeft) };
  }
  return { type, consumed: activatePicked(s, type, null) };
}

/** True when `type` currently has an active entry (timed or `-1`). */
export function isActive(s: GameState, type: BoostType): boolean {
  return s.boosts.active.some((a) => a.type === type);
}

/** Boss kind 4 (Crimson) ignores ICE_FREEZE/SPEED_TAMER slowdown while its rage is active. */
export function bossImmuneToSlowdown(s: GameState): boolean {
  return s.boss !== null && s.boss.kind === 4 && s.boss.effectTicks > 0;
}

/**
 * Applies SPEED_TAMER's linear slowdown to `v` (spec C5): `max(0.1, 1 - 0.1*stacks)`, computed with
 * integer division as `max(idiv(v, 10), idiv(v*(10-stacks), 10))` so the floor (0.1x, reached at 9
 * stacks already) and the linear ramp below it agree exactly; a no-op with no stacks.
 */
export function tamed(s: GameState, v: number): number {
  const stacks = s.boosts.tamerStacks;
  if (stacks <= 0) return v;
  return Math.max(idiv(v, 10), idiv(v * (10 - stacks), 10));
}

/**
 * Applies ICE_FREEZE's ×0.5 slowdown to a per-tick displacement `v` (spec §5.2), alongside `tamed`
 * (never on a stored velocity, so the hash stays stable across activation/expiry mid-flight).
 * `bossShot` skips the halving while `bossImmuneToSlowdown` (Crimson's rage), same guard as `tamed`.
 * Crab movement (the march and a wave's arrival descent, spec C5) passes `false`. Enemy shots ARE
 * slowed, per tick (owner ruling 2026-09-15, replacing spec C5's movement-only rule):
 * `updateEnemyShots` puts every shot's step through here, with `bossShot` set for a boss's own
 * shots, and Hex's `hexStep` rides the same seam, scaling the step before this halves it.
 * SPEED_TAMER (`tamed`) still never touches bullets.
 */
export function chilled(s: GameState, v: number, bossShot: boolean): number {
  if (bossShot && bossImmuneToSlowdown(s)) return v;
  return isActive(s, 'ICE_FREEZE') ? idiv(v, 2) : v;
}

/**
 * The wave-mode score-decay percentage right now (spec C7, legacy `game-constants.js`'s
 * `currentScoreMultiplier`): falls 1% every `SCORE_DECAY.every` ticks on `s.scoreDecay`, floored at
 * `SCORE_DECAY.floorPct`. Applied to a crab kill's base points before SCORE_MULTIPLIER's ×2.
 */
export function scoreDecayPct(s: GameState): number {
  return Math.max(SCORE_DECAY.floorPct, 100 - idiv(s.scoreDecay, SCORE_DECAY.every));
}

/**
 * Advances the wave-mode score-decay clock (spec C7): only while the run has boosts enabled (so a
 * practice/daily run with `features.boosts` off scores exactly as it did before this clock
 * existed), only outside a boss fight (which keeps its own `fightTicks` decay), and only
 * while POINTS_FREEZE is not active — mirroring `updateBoss`'s own `fightTicks` gate exactly.
 */
export function advanceScoreDecay(s: GameState): void {
  if (!s.run.features.boosts) return;
  if (s.boss) return;
  if (isActive(s, 'POINTS_FREEZE')) return;
  s.scoreDecay += 1;
}
