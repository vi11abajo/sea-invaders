import { BOOSTS, DROP, FIELD_H, RARITY_LISTS, SHIP } from '../config';
import { idiv } from '../fixed';
import type { ActiveBoost, BoostType, Drop, GameState } from '../types';
import { applyEffect, removeEffect } from './boostEffects';

const DROP_HALF = idiv(DROP.size, 2);

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
 * Advances every drop (fall, ttl, pickup by the ship) and every active boost timer, in that order.
 * Called once per tick after `hitShip` (spec §5.1-5.2).
 */
export function updateBoosts(s: GameState): void {
  const kept: Drop[] = [];
  for (const d of s.drops) {
    d.y += DROP.fall;
    d.ttl -= 1;
    if (d.ttl <= 0 || d.y - DROP_HALF > FIELD_H) continue;
    const reach = DROP_HALF + SHIP.hitRadius;
    if (Math.abs(d.x - s.ship.x) < reach && Math.abs(d.y - s.ship.y) < reach) {
      activateBoost(s, d.boost);
      s.events.push({ tick: s.tick, type: 'boost_pickup', boost: d.boost });
      continue;
    }
    kept.push(d);
  }
  s.drops = kept;

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
}

/**
 * Activates or refreshes a boost. Instants (`duration 0`) apply once and are never tracked in
 * `active`. `-1`-duration boosts are tracked once (no timer) and re-apply their effect on every
 * activation (SPEED_TAMER's stack). Timed boosts set or reset `ticksLeft` to the full duration,
 * resetting an already-active one instead of stacking a second entry.
 */
export function activateBoost(s: GameState, type: BoostType): void {
  const cfg = BOOSTS[type];
  if (cfg.duration === 0) {
    applyEffect(s, type);
    return;
  }
  if (cfg.duration === -1) {
    if (!s.boosts.active.some((a) => a.type === type)) s.boosts.active.push({ type, ticksLeft: -1 });
    applyEffect(s, type);
    return;
  }
  const existing = s.boosts.active.find((a) => a.type === type);
  if (existing) existing.ticksLeft = cfg.duration;
  else s.boosts.active.push({ type, ticksLeft: cfg.duration });
}

/** True when `type` currently has an active entry (timed or `-1`). */
export function isActive(s: GameState, type: BoostType): boolean {
  return s.boosts.active.some((a) => a.type === type);
}

/** Boss kind 4 (Crimson) ignores ICE_FREEZE/SPEED_TAMER slowdown while its rage is active. */
export function bossImmuneToSlowdown(s: GameState): boolean {
  return s.boss !== null && s.boss.kind === 4 && s.boss.effectTicks > 0;
}
