import { OCTOPI, REPLAY_MODE, runReplay } from '@sea-invaders/core';

/**
 * Re-simulates a Daily Run replay exactly as the server verifies one: the day's seed, the daily
 * mode, level 0, the base Octopi and its lives. The server's finish step and the public replay
 * checker (src/tools/verifyReplays.js) both call this, so they can never verify differently.
 * Throws when the replay was not recorded on `seed`.
 */
export function simulateDailyReplay(replay, seed) {
  return runReplay(replay, { seed, mode: REPLAY_MODE.daily, levelId: 0, lives: OCTOPI.lives, octopi: 'base' });
}
