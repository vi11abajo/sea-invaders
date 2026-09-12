import type { BoostType, GameState } from '../types';

/**
 * Applies an instant boost's one-shot effect, or a `-1`-duration boost's activation effect
 * (SHIELD_BARRIER's `shield = 3`, SPEED_TAMER's stack). Tasks 12-15 add cases here, each one
 * removed from the throw below as it lands. Timed boosts (duration > 0) are never routed through
 * here: the sim reads them via `isActive`.
 */
export function applyEffect(s: GameState, type: BoostType): void {
  switch (type) {
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
