import { nextWave } from './game';
import { updateBoosts } from './sim/boosts';
import { updateBoss } from './sim/boss';
import { hitCrabs, hitShip } from './sim/collide';
import { marchCrabs, updateEnemyShots } from './sim/crabs';
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
  updateBoss(s);
  hitCrabs(s);
  hitShip(s);
  updateBoosts(s);
  if (!s.over && s.crabs.length === 0 && s.boss === null) nextWave(s);
}
