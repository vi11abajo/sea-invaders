import { spawnWave } from './game';
import { hitCrabs, hitShip } from './sim/collide';
import { marchCrabs, updateEnemyShots } from './sim/crabs';
import { moveShip, updateShots } from './sim/ship';
import type { GameState, Input } from './types';

/** Advances the game by exactly one tick. The same state and input always give the same result. */
export function step(s: GameState, input: Input): void {
  if (s.over) return;
  s.tick += 1;
  if (s.ship.invuln > 0) s.ship.invuln -= 1;
  moveShip(s, input);
  updateShots(s);
  marchCrabs(s);
  if (s.over) return;
  updateEnemyShots(s);
  hitCrabs(s);
  hitShip(s);
  if (!s.over && s.crabs.length === 0) spawnWave(s, s.wave + 1);
}
