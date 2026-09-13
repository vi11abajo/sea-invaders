import { nextWave } from './game';
import { advanceScoreDecay, updateBoosts } from './sim/boosts';
import { updateBoss } from './sim/boss';
import { hitCrabs, hitOctopi } from './sim/collide';
import { marchCrabs, pullShotsTowardGravity, updateEnemyShots } from './sim/crabs';
import { moveOctopi, updateShots } from './sim/octopi';
import type { GameState, Input } from './types';

/** Advances the game by exactly one tick. The same state and input always give the same result. */
export function step(s: GameState, input: Input): void {
  if (s.over || s.cleared) return;
  s.tick += 1;
  if (s.octopi.invuln > 0) s.octopi.invuln -= 1;
  moveOctopi(s, input);
  updateShots(s);
  marchCrabs(s);
  if (s.over) return;
  updateEnemyShots(s);
  pullShotsTowardGravity(s);
  updateBoss(s);
  advanceScoreDecay(s);
  hitCrabs(s);
  hitOctopi(s);
  updateBoosts(s);
  // Decrement before nextWave so a wave it spawns this same tick (arrival reset to 30) keeps its
  // full descent — marchCrabs already consumed this tick's old-wave arrival tick above, and the
  // new wave's own 30 ticks only start counting down from the next step() call.
  if (s.arrival > 0) s.arrival -= 1;
  if (!s.over && !s.cleared && s.crabs.length === 0 && s.boss === null) nextWave(s);
}
