import { nextWave } from './game';
import { surgeIfDue } from './sim/boostEffects';
import { advanceScoreDecay, updateBoosts } from './sim/boosts';
import { hitOrbs, updateBoss } from './sim/boss';
import { hitCrabs, hitOctopi } from './sim/collide';
import { marchCrabs, pullShotsTowardGravity, updateEnemyShots } from './sim/crabs';
import { hitObstacle } from './sim/obstacles';
import { moveOctopi, updateShots } from './sim/octopi';
import { popSquads } from './sim/squads';
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
  // The escort goes with its boss the moment it dies (spec §5.1), but not synchronously inside
  // `damageBoss` any more (fix round 1, controller ruling R22): popping mid-`hitCrabs`'s own loop
  // over `s.shots` could remove a squad crab before a *later* shot in the same tick's array ever
  // reached it, silently losing that crab's own loot check to nothing but shot order. Popping here
  // instead — once, right after every shot of this tick has already had its chance to hit a crab or
  // the boss box — means whichever shot actually lands a crew's true last kill always runs through
  // `killCrab` (and its own loot check, `sim/collide.ts`) before this pop ever gets a chance to beat
  // it to `s.crabs`. A no-op while the boss is still alive or `s.squads` is already empty — every
  // fight of the first campaign, and every tick a boss with a squad is still fighting — so this reads
  // and changes nothing for kinds 1-5 (see `popSquads`'s own doc, `sim/squads.ts`, for why it is safe
  // to call unconditionally here).
  if (s.boss === null && s.squads.length > 0) popSquads(s);
  // Coraluna's Surge (champions and skins spec §1) lands on the tick of its 30th kill, once every hit
  // of this tick has been counted and before anything can hurt Octopi; a no-op for every other variant.
  surgeIfDue(s);
  hitOctopi(s);
  updateBoosts(s);
  // `destroyedObstacles` is no longer swept here (fix round 2, controller ruling R19 — an
  // unconditional per-tick clear at this point wiped an entry pushed during a boss phase transition
  // before the boss's own `tick` hook, which does not run during one, ever got a chance to drain
  // it). It is now swept from inside `updateBoss` itself (`sim/boss.ts`, right after the point that
  // would have dispatched `hooks.tick`, which a transition's own early return never reaches) and at
  // the point the boss is removed at death (`damageBoss`), so a destruction pending during a
  // transition survives until the boss's own `tick` runs again instead of being lost.
  // Decrement before nextWave so a wave it spawns this same tick (arrival reset to 30) keeps its
  // full descent — marchCrabs already consumed this tick's old-wave arrival tick above, and the
  // new wave's own 30 ticks only start counting down from the next step() call.
  if (s.arrival > 0) s.arrival -= 1;
  if (!s.over && !s.cleared && s.crabs.length === 0 && s.boss === null) nextWave(s);
}
