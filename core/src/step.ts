import { nextWave } from './game';
import { updateBoosts } from './sim/boosts';
import { updateBoss } from './sim/boss';
import { hitCrabs, hitShip } from './sim/collide';
import { marchCrabs, pullShotsTowardGravity, updateEnemyShots } from './sim/crabs';
import { moveShip, updateShots } from './sim/ship';
import type { GameState, Input } from './types';

/** Advances the game by exactly one tick. The same state and input always give the same result. */
export function step(s: GameState, input: Input): void {
  if (s.over || s.cleared) return;
  s.tick += 1;
  if (s.ship.invuln > 0) s.ship.invuln -= 1;
  moveShip(s, input);
  updateShots(s);
  marchCrabs(s);
  if (s.over) return;
  updateEnemyShots(s);
  pullShotsTowardGravity(s);
  updateBoss(s);
  hitCrabs(s);
  hitShip(s);
  updateBoosts(s);
  // Decrement before nextWave so a wave it spawns this same tick (arrival reset to 30) keeps its
  // full descent — marchCrabs already consumed this tick's old-wave arrival tick above, and the
  // new wave's own 30 ticks only start counting down from the next step() call.
  if (s.arrival > 0) s.arrival -= 1;
  if (!s.over && !s.cleared && s.crabs.length === 0 && s.boss === null) nextWave(s);
}
