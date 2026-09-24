import { coralGrowthFor, shellPerWaveFor } from '../config';
import type { GameState } from '../types';

/** The grace after a hit the shell took: the same short window a SHIELD_BARRIER charge gives. */
const SHELL_GRACE_TICKS = 30;

/**
 * Noob's Shell comes up: called at the start of every wave (`startLevelWave` and `spawnWave`) and
 * of every boss fight (`spawnBoss`), never on a boss's phase change, so each of those rounds opens
 * with exactly one hit to spare. An unbroken shell is simply kept, never doubled. A no-op for every
 * other variant, whose shell stays 0 for good.
 */
export function raiseShell(s: GameState): void {
  if (shellPerWaveFor(s.run.octopi)) s.octopi.shell = 1;
}

/**
 * Spends the shell on a hit that would cost a life: no life is lost, Octopi gets the short grace a
 * shield charge gives, and a `shell_break` event marks the spot. It is asked before SHIELD_BARRIER,
 * so the shell always goes first and the boost's charges wait for the hits after it. Returns false,
 * changing nothing, while no shell is up.
 */
export function breakShell(s: GameState): boolean {
  if (s.octopi.shell <= 0) return false;
  s.octopi.shell = 0;
  s.octopi.invuln = SHELL_GRACE_TICKS;
  s.events.push({ tick: s.tick, type: 'shell_break', x: s.octopi.x, y: s.octopi.y });
  return true;
}

/**
 * Coraluna's Coral growth, called from `killCrab` for every kill of the run, whatever made it: the
 * kill that brings the count to `every` (120) grows one life and raises a `coral_growth` event at
 * Octopi. The count stops once `every × perRun` kills are in, so a run (one level) grows at most
 * `perRun` (1) lives however long it lasts, and the Tide's revive does not start it again.
 *
 * A growth that comes due while Octopi already has `cap` (5) lives or more grants nothing and is
 * spent all the same: it is a reward for how the run is going at that kill, not a life held in
 * reserve for later. A no-op for every other variant, whose count stays 0 for good.
 */
export function countCoralKill(s: GameState): void {
  const growth = coralGrowthFor(s.run.octopi);
  if (growth === null || s.growthKills >= growth.every * growth.perRun) return;
  s.growthKills += 1;
  if (s.growthKills % growth.every !== 0 || s.octopi.lives >= growth.cap) return;
  s.octopi.lives += 1;
  s.events.push({ tick: s.tick, type: 'coral_growth', x: s.octopi.x, y: s.octopi.y });
}
