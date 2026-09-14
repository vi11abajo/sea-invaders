import { OCTOPI, REVIVE_LIVES } from '../config';
import type { GameState } from '../types';

/**
 * Revives Octopi mid-level after the last life was lost (spec §4, the Tide flow): only while the
 * run is over with zero lives left. Restores `REVIVE_LIVES` lives, grants `OCTOPI.invulnTicks` of
 * invulnerability (the same 2-second grace a normal hit gives), clears every enemy shot in flight
 * and flips `over` back to false, then records the `revived` event. The campaign level screen calls
 * this only after the on-chain purchase confirms; on any other precondition it does nothing at
 * all — deliberately a silent no-op rather than a throw, matching `step()`'s own "does nothing once
 * the run is over" idiom, so a stray or duplicate call from a UI race never corrupts the run.
 */
export function revive(s: GameState): void {
  if (!s.over || s.octopi.lives !== 0) return;
  s.over = false;
  s.octopi.lives = REVIVE_LIVES;
  s.octopi.invuln = OCTOPI.invulnTicks;
  s.enemyShots = [];
  s.events.push({ tick: s.tick, type: 'revived' });
}
