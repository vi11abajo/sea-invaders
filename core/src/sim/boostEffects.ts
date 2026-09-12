import { CRAB_TYPES } from '../config';
import { idiv } from '../fixed';
import type { BoostType, GameState } from '../types';
import { rollDrop } from './boosts';
import { damageBoss, scoreMultiplier } from './boss';

/**
 * Applies an instant boost's one-shot effect, or a `-1`-duration boost's activation effect
 * (SHIELD_BARRIER's `shield = 3`, SPEED_TAMER's stack, WAVE_BLAST's board wipe). Task 15 adds a
 * case here, removed from the throw below as it lands. Timed boosts (duration > 0) are never
 * routed through here: the sim reads them via `isActive` (RICOCHET, GRAVITY_WELL) or `s.boosts.well`
 * (GRAVITY_WELL's pickup, captured in `updateBoosts`/`activateBoost`). RAPID_FIRE, MULTI_SHOT,
 * PIERCING_BULLETS, INVINCIBILITY, SCORE_MULTIPLIER, ICE_FREEZE, POINTS_FREEZE, AUTO_TARGET,
 * RICOCHET and GRAVITY_WELL are timed and never reach this switch via `activateBoost`, but keep an
 * explicit no-op case each so the `default` throw stays a guard for the boost of Task 15
 * (RANDOM_CHAOS).
 */
export function applyEffect(s: GameState, type: BoostType): void {
  switch (type) {
    case 'HEALTH_BOOST':
      s.ship.lives += 1;
      return;
    case 'COIN_SHOWER':
      s.score += idiv(s.score, 4);
      return;
    case 'SHIELD_BARRIER':
      s.boosts.shield = 3;
      return;
    case 'SPEED_TAMER':
      s.boosts.tamerStacks = Math.min(10, s.boosts.tamerStacks + 1);
      return;
    case 'WAVE_BLAST':
      for (const c of s.crabs) {
        rollDrop(s, c.x, c.y);
        s.score += scoreMultiplier(s, CRAB_TYPES[c.type].points * s.wave);
        s.kills += 1;
      }
      s.crabs = [];
      if (s.boss) damageBoss(s, 10);
      s.enemyShots = [];
      return;
    case 'RAPID_FIRE':
    case 'MULTI_SHOT':
    case 'PIERCING_BULLETS':
    case 'INVINCIBILITY':
    case 'SCORE_MULTIPLIER':
    case 'ICE_FREEZE':
    case 'POINTS_FREEZE':
    case 'AUTO_TARGET':
    case 'RICOCHET':
    case 'GRAVITY_WELL':
      return;
    default:
      throw new Error('boost not implemented: ' + type);
  }
}

/** Cleanup for a boost that needs it when its timer expires or it is otherwise removed. */
export function removeEffect(s: GameState, type: BoostType): void {
  switch (type) {
    case 'GRAVITY_WELL':
      s.boosts.well = null;
      return;
    default:
      return;
  }
}
