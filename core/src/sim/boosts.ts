import { BOOSTS, DROP, FIELD_H, RARITY_LISTS, SHIP } from '../config';
import { idiv } from '../fixed';
import type { ActiveBoost, BoostType, Drop, GameState } from '../types';
import { applyEffect, removeEffect } from './boostEffects';
import { pullTowardsWell } from './crabs';

const DROP_HALF = idiv(DROP.size, 2);

/**
 * The pool RANDOM_CHAOS picks from (spec §5.2): the ten timed boosts (duration 600 or 466), in
 * `BoostType`'s declaration order, excluding RANDOM_CHAOS itself.
 */
const CHAOS_POOL: BoostType[] = [
  'RAPID_FIRE', 'ICE_FREEZE', 'POINTS_FREEZE', 'AUTO_TARGET', 'INVINCIBILITY',
  'MULTI_SHOT', 'SCORE_MULTIPLIER', 'RICOCHET', 'GRAVITY_WELL', 'PIERCING_BULLETS',
];

/**
 * Rolls a drop at (x, y) on a crab kill: `DROP.chance`% chance, then a rarity roll (common < 50,
 * rare < 85, epic < 97, else legendary) and a uniform pick within that rarity's list (spec §5.1-5.2,
 * legacy `DISTRIBUTION` order). No-op when the run has boosts disabled.
 */
export function rollDrop(s: GameState, x: number, y: number): void {
  if (!s.run.features.boosts) return;
  if (s.rngBoosts.nextInt(100) >= DROP.chance) return;
  const r = s.rngBoosts.nextInt(100);
  const rarity = r < 50 ? 'common' : r < 85 ? 'rare' : r < 97 ? 'epic' : 'legendary';
  const list = RARITY_LISTS[rarity];
  const boost = list[s.rngBoosts.nextInt(list.length)]!;
  s.drops.push({ x, y, boost, ttl: DROP.ttl });
  s.events.push({ tick: s.tick, type: 'boost_drop', boost });
}

/**
 * Advances every drop (fall, ttl, pickup by the ship) and every active boost timer, then applies
 * GRAVITY_WELL's pull for the tick, in that order. Called once per tick after `hitShip`
 * (spec §5.1-5.2). A pickup that resolves to GRAVITY_WELL (a direct one, or a RANDOM_CHAOS drop
 * that rolled it) sets `boosts.well` to the drop's own position, overriding the ship-position
 * default that `activateBoost` sets when it applies GRAVITY_WELL: keyed off `activateBoost`'s
 * return value (the boost actually applied), not `d.boost`, so a chaos-rolled well anchors the
 * same way a real GRAVITY_WELL pickup does.
 */
export function updateBoosts(s: GameState): void {
  // Iterate a snapshot, not `s.drops` itself: a WAVE_BLAST pickup (via `activateBoost` below) calls
  // `rollDrop` for every crab, pushing new drops into `s.drops`, and without this those would be
  // picked up by this same pass and get an extra fall step (or even be collected) on the same
  // tick. Order is deterministic: survivors first, then anything spawned during this pass, in the
  // order `rollDrop` pushed them.
  const list = s.drops;
  s.drops = [];
  const kept: Drop[] = [];
  for (const d of list) {
    d.y += DROP.fall;
    d.ttl -= 1;
    if (d.ttl <= 0 || d.y - DROP_HALF > FIELD_H) continue;
    const reach = DROP_HALF + SHIP.hitRadius;
    if (Math.abs(d.x - s.ship.x) < reach && Math.abs(d.y - s.ship.y) < reach) {
      const resolved = activateBoost(s, d.boost);
      if (resolved === 'GRAVITY_WELL') s.boosts.well = { x: d.x, y: d.y };
      s.events.push({ tick: s.tick, type: 'boost_pickup', boost: d.boost });
      continue;
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

  if (s.boosts.well) pullTowardsWell(s, s.boosts.well);
}

/**
 * Activates or refreshes a boost, and returns the `BoostType` actually applied (its argument,
 * except for RANDOM_CHAOS — see below); `updateBoosts` keys its drop-position well override off
 * this return value rather than the type requested, so a chaos roll is indistinguishable from a
 * direct pickup of whatever it resolved to. Instants (`duration 0`) apply once and are never
 * tracked in `active`. `-1`-duration boosts are tracked once (no timer) and re-apply their effect
 * on every activation (SPEED_TAMER's stack). Timed boosts set or reset `ticksLeft` to the full
 * duration, resetting an already-active one instead of stacking a second entry. GRAVITY_WELL
 * additionally (re)captures its well at the ship's current position; a drop pickup in
 * `updateBoosts` overrides this with the drop's own position right after this call returns.
 *
 * RANDOM_CHAOS (spec §5.2) never adds a RANDOM_CHAOS entry: it uniformly picks one of `CHAOS_POOL`
 * and activates that instead, for `600 + rngBoosts.nextInt(301)` ticks (600-900) rather than the
 * picked boost's own table duration. A picked GRAVITY_WELL still anchors at the ship's position by
 * the same rule as a direct GRAVITY_WELL activation (and `updateBoosts` still overrides that to
 * the drop's position for a chaos drop pickup, same as any other).
 */
export function activateBoost(s: GameState, type: BoostType): BoostType {
  if (type === 'RANDOM_CHAOS') {
    const picked = CHAOS_POOL[s.rngBoosts.nextInt(CHAOS_POOL.length)]!;
    const ticksLeft = 600 + s.rngBoosts.nextInt(301);
    if (picked === 'GRAVITY_WELL') s.boosts.well = { x: s.ship.x, y: s.ship.y };
    const existing = s.boosts.active.find((a) => a.type === picked);
    if (existing) existing.ticksLeft = ticksLeft;
    else s.boosts.active.push({ type: picked, ticksLeft });
    return picked;
  }
  const cfg = BOOSTS[type];
  if (cfg.duration === 0) {
    applyEffect(s, type);
    return type;
  }
  if (cfg.duration === -1) {
    if (!s.boosts.active.some((a) => a.type === type)) s.boosts.active.push({ type, ticksLeft: -1 });
    applyEffect(s, type);
    return type;
  }
  if (type === 'GRAVITY_WELL') s.boosts.well = { x: s.ship.x, y: s.ship.y };
  const existing = s.boosts.active.find((a) => a.type === type);
  if (existing) existing.ticksLeft = cfg.duration;
  else s.boosts.active.push({ type, ticksLeft: cfg.duration });
  return type;
}

/** True when `type` currently has an active entry (timed or `-1`). */
export function isActive(s: GameState, type: BoostType): boolean {
  return s.boosts.active.some((a) => a.type === type);
}

/** Boss kind 4 (Crimson) ignores ICE_FREEZE/SPEED_TAMER slowdown while its rage is active. */
export function bossImmuneToSlowdown(s: GameState): boolean {
  return s.boss !== null && s.boss.kind === 4 && s.boss.effectTicks > 0;
}

/** Applies SPEED_TAMER's ×0.9-per-stack slowdown to `v` (spec §5.2); a no-op with no stacks. */
export function tamed(s: GameState, v: number): number {
  let r = v;
  for (let i = 0; i < s.boosts.tamerStacks; i++) r = idiv(r * 9, 10);
  return r;
}

/**
 * Applies ICE_FREEZE's ×0.5 slowdown to a per-tick displacement `v` (spec §5.2), alongside `tamed`
 * (never on a stored velocity, so the hash stays stable across activation/expiry mid-flight).
 * `bossShot` skips the halving while `bossImmuneToSlowdown` (Crimson's rage), same guard as `tamed`.
 */
export function chilled(s: GameState, v: number, bossShot: boolean): number {
  if (bossShot && bossImmuneToSlowdown(s)) return v;
  return isActive(s, 'ICE_FREEZE') ? idiv(v, 2) : v;
}
