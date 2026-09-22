import { nextWave } from './game';
import { advanceScoreDecay, updateBoosts } from './sim/boosts';
import { hitOrbs, updateBoss } from './sim/boss';
import { hitCrabs, hitOctopi } from './sim/collide';
import { marchCrabs, pullShotsTowardGravity, updateEnemyShots } from './sim/crabs';
import { hitObstacle } from './sim/obstacles';
import { moveOctopi, updateShots } from './sim/octopi';
import { popBubbles, updateVeterans } from './sim/veterans';
import type { GameState, Input } from './types';

/** Advances the game by exactly one tick. The same state and input always give the same result. */
export function step(s: GameState, input: Input): void {
  if (s.over || s.cleared) return;
  s.tick += 1;
  if (s.octopi.invuln > 0) s.octopi.invuln -= 1;
  moveOctopi(s, input);
  updateShots(s);
  // The veteran timers, rallies and rage settle before anything reads them: the march speed and the
  // fire chance of this very tick already follow a rage, and a crab a patriarch rallies back marches
  // with its wave straight away (spec §2).
  updateVeterans(s);
  marchCrabs(s);
  if (s.over) return;
  updateEnemyShots(s);
  pullShotsTowardGravity(s);
  updateBoss(s);
  advanceScoreDecay(s);
  // Both sides' shots have moved by now (and the boss has cast whatever this tick owed), so this is
  // where everything standing between a shot and its target gets its say, before any hit is scored:
  // first the arena objects, which eat both sides' fire whole (spec §5.1), then the bubbler's
  // bubbles (spec §2) and the Tyrant's orbs (spec §5.1), each of which a player shot has to chew
  // through. A tick with no crystal, no bubble and no orb on the field leaves all three at once.
  hitObstacle(s);
  popBubbles(s);
  hitOrbs(s);
  hitCrabs(s);
  hitOctopi(s);
  updateBoosts(s);
  // Decrement before nextWave so a wave it spawns this same tick (arrival reset to 30) keeps its
  // full descent — marchCrabs already consumed this tick's old-wave arrival tick above, and the
  // new wave's own 30 ticks only start counting down from the next step() call.
  if (s.arrival > 0) s.arrival -= 1;
  if (!s.over && !s.cleared && s.crabs.length === 0 && s.boss === null) nextWave(s);
}
