import { OCTOPI, TIDE_REVIVE_LIVES } from '../config';
import type { GameState } from '../types';

/**
 * Revives Octopi mid-level after the last life was lost (the Tide flow): only while the
 * run is over with zero lives left. Restores `TIDE_REVIVE_LIVES` lives, grants `OCTOPI.invulnTicks` of
 * invulnerability (2 seconds; noob's Shell is not raised again, it belongs to the start of a wave
 * or a boss fight), clears every enemy shot in flight
 * and flips `over` back to false, then records the `revived` event. The campaign level screen calls
 * this only after the on-chain purchase confirms; on any other precondition it does nothing at
 * all — deliberately a silent no-op rather than a throw, matching `step()`'s own "does nothing once
 * the run is over" idiom, so a stray or duplicate call from a UI race never corrupts the run.
 *
 * A revive is not part of the replay format (`Replay` in `replay.ts`): it changes the state outside
 * `step()`, so a run with one cannot be re-simulated from its replay. Only daily runs are verified
 * today, and a daily run has no Tide, so nothing relies on it; verifying campaign runs would need the
 * revives recorded first.
 */
export function revive(s: GameState): void {
  if (!s.over || s.octopi.lives !== 0) return;
  s.over = false;
  s.octopi.lives = TIDE_REVIVE_LIVES;
  s.octopi.invuln = OCTOPI.invulnTicks;
  s.enemyShots = [];
  s.events.push({ tick: s.tick, type: 'revived' });
}
