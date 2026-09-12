import { idiv } from '../fixed';
import type { BoostType, GameState } from '../types';

/**
 * Applies an instant boost's one-shot effect, or a `-1`-duration boost's activation effect
 * (SHIELD_BARRIER's `shield = 3`, SPEED_TAMER's stack). Tasks 12-15 add cases here, each one
 * removed from the throw below as it lands. Timed boosts (duration > 0) are never routed through
 * here: the sim reads them via `isActive`. RAPID_FIRE, MULTI_SHOT, PIERCING_BULLETS, INVINCIBILITY
 * and SCORE_MULTIPLIER are timed and never reach this switch via `activateBoost`, but keep an
 * explicit no-op case each so the `default` throw stays a guard for the boosts of Tasks 13-15.
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
    case 'RAPID_FIRE':
    case 'MULTI_SHOT':
    case 'PIERCING_BULLETS':
    case 'INVINCIBILITY':
    case 'SCORE_MULTIPLIER':
      return;
    default:
      throw new Error('boost not implemented: ' + type);
  }
}

/** Cleanup for a boost that needs it when its timer expires or it is otherwise removed. */
export function removeEffect(s: GameState, type: BoostType): void {
  switch (type) {
    default:
      return;
  }
}
