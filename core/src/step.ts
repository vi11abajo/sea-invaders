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
  // The arena objects eat both sides' fire whole (spec §5.1) *before* the boss's own update, so a
  // boss whose `tick` hook reacts to a destruction it caused this very tick (the Frost Castellan's
  // shard burst, fix round 1, controller ruling R18) sees it the same tick rather than one tick
  // late. Moving `hitObstacle` ahead of `updateBoss` costs kinds 1-5 (and kind 6) nothing: with no
  // obstacle ever standing on their arena, `hitObstacle` is an unconditional no-op wherever it sits
  // in the tick. The one visible cost is the Castellan's own: a shot he casts this very tick (from
  // the `updateBoss` call below) is not checked against a crystal until the next tick — unobservable
  // today, since every shot he casts starts at his own muzzle, nowhere near y 3600 where a crystal
  // stands.
  hitObstacle(s);
  updateBoss(s);
  advanceScoreDecay(s);
  // Before any hit is scored: the bubbler's bubbles (spec §2) and the Tyrant's orbs (spec §5.1),
  // each of which a player shot has to chew through before it can reach a crab, the boss box or
  // Octopi (`hitCrabs`, `hitOctopi`). A tick with no bubble and no orb on the field leaves both at
  // once.
  popBubbles(s);
  hitOrbs(s);
  hitCrabs(s);
  hitOctopi(s);
  updateBoosts(s);
  // Whichever boss reacts to a destruction (the Castellan's own `tick` hook, inside the `updateBoss`
  // call above) already drained `destroyedObstacles` for itself; this is the safety net for every
  // other case — no boss, or a boss that never drains it — so the list can never accumulate or leak
  // into the next tick (fix round 1, controller ruling R18).
  s.destroyedObstacles = [];
  // Decrement before nextWave so a wave it spawns this same tick (arrival reset to 30) keeps its
  // full descent — marchCrabs already consumed this tick's old-wave arrival tick above, and the
  // new wave's own 30 ticks only start counting down from the next step() call.
  if (s.arrival > 0) s.arrival -= 1;
  if (!s.over && !s.cleared && s.crabs.length === 0 && s.boss === null) nextWave(s);
}
