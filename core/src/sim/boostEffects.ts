import { MAX_LIVES, surgeEveryFor } from '../config';
import { idiv } from '../fixed';
import type { BoostType, Crab, GameState } from '../types';
import { killCrab } from './collide';

/** Bottom-row tolerance for WAVE_BLAST (spec C4): legacy ±10px ~= 367 units. */
const WAVE_BLAST_ROW_BAND = 367;

/**
 * WAVE_BLAST's bottom-row kill (spec C4, legacy `boost-manager.js:463-481`): every crab within
 * `WAVE_BLAST_ROW_BAND` units of the highest current `y` among crabs (a diving crab counts by its
 * current `y`, not its formation slot) is killed through the same scoring path as a lethal bullet
 * hit (`killCrab`), so drops/score/decay/kills all agree with a normal kill. No boss damage, no shot
 * clearing (both removed per spec C4 — the legacy's WAVE_BLAST never touched either). Returns false
 * (and does nothing else) when there are no crabs at all, so the pickup that triggered this is not
 * consumed (legacy `activateBoost` returning `false`) — the drop keeps falling.
 */
function applyWaveBlast(s: GameState): boolean {
  if (s.crabs.length === 0) return false;
  let maxY = s.crabs[0]!.y;
  for (const c of s.crabs) if (c.y > maxY) maxY = c.y;
  const survivors: Crab[] = [];
  for (const c of s.crabs) {
    if (maxY - c.y <= WAVE_BLAST_ROW_BAND) killCrab(s, c);
    else survivors.push(c);
  }
  s.crabs = survivors;
  return true;
}

/**
 * Coraluna's Surge (champions and skins spec §1): once `surgeEveryFor` kills (30) have been counted
 * in `s.surgeKills` (`killCrab`), spends them on the same bottom-row sweep a WAVE_BLAST pickup makes
 * and raises a `surge` event at Octopi for the app's flash and toast. No WAVE_BLAST pickup is
 * consumed or created, but each swept crab goes through `killCrab` like any kill: it rolls its own
 * loot, scores, and counts towards the next Surge. The event is raised even when the field is empty
 * and the sweep finds nothing: that surge is wasted, not carried over to the next wave.
 *
 * `step` calls this once a tick, after `updateBoosts` and before `nextWave` (ruling R-K), so every
 * kill of the tick — a shot's in `hitCrabs`, a WAVE_BLAST pickup's in `updateBoosts` — is counted
 * first and a surge due on a field that tick emptied is spent there, never on the next wave. At most
 * one surge a tick: a count its own sweep carries back over 30 waits for the next tick's call. A
 * no-op for every variant without a `surgeEvery`.
 */
export function surgeIfDue(s: GameState): void {
  const every = surgeEveryFor(s.run.octopi);
  if (every <= 0 || s.surgeKills < every) return;
  s.surgeKills -= every;
  applyWaveBlast(s);
  s.events.push({ tick: s.tick, type: 'surge', x: s.octopi.x, y: s.octopi.y });
}

/**
 * Applies an instant boost's one-shot effect, or a `-1`-duration boost's activation effect
 * (SHIELD_BARRIER's `shield = 3`, SPEED_TAMER's stack). Timed boosts (duration > 0) are never
 * routed through here: the sim reads them via `isActive` or `s.boosts.well` (GRAVITY_WELL's pickup,
 * captured in `updateBoosts`/`activateBoost`). RAPID_FIRE, MULTI_SHOT, PIERCING_BULLETS,
 * INVINCIBILITY, SCORE_MULTIPLIER, ICE_FREEZE, POINTS_FREEZE, AUTO_TARGET and GRAVITY_WELL are timed
 * and never reach this switch via `activateBoost`, but keep an explicit no-op case each for clarity.
 * RANDOM_CHAOS is intercepted by `activateBoost` before it ever calls `applyEffect` (it activates
 * the picked boost directly), so its case here is unreachable in practice; the `default` is kept
 * only for exhaustiveness. Returns whether the effect actually applied (spec C4: WAVE_BLAST reports
 * `false` with no crabs on screen); every other case is always consumed.
 */
export function applyEffect(s: GameState, type: BoostType): boolean {
  switch (type) {
    case 'HEALTH_BOOST':
      s.octopi.lives = Math.min(MAX_LIVES, s.octopi.lives + 1);
      return true;
    case 'COIN_SHOWER':
      s.score += idiv(s.score, 4);
      return true;
    case 'SHIELD_BARRIER':
      s.boosts.shield = 3;
      return true;
    case 'SPEED_TAMER':
      s.boosts.tamerStacks = Math.min(10, s.boosts.tamerStacks + 1);
      return true;
    case 'WAVE_BLAST':
      return applyWaveBlast(s);
    case 'RAPID_FIRE':
    case 'MULTI_SHOT':
    case 'PIERCING_BULLETS':
    case 'INVINCIBILITY':
    case 'SCORE_MULTIPLIER':
    case 'ICE_FREEZE':
    case 'POINTS_FREEZE':
    case 'AUTO_TARGET':
    case 'GRAVITY_WELL':
      return true;
    case 'RANDOM_CHAOS':
      // Unreachable: activateBoost intercepts RANDOM_CHAOS and never calls applyEffect with it.
      return true;
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

/** Cleanup for a boost that needs it when its timer expires or it is otherwise removed. */
export function removeEffect(s: GameState, type: BoostType): void {
  switch (type) {
    case 'GRAVITY_WELL':
      s.boosts.well = null;
      return;
    case 'SHIELD_BARRIER':
      // Only a chaos-timed shield (spec C8) ever reaches this: a permanent one's active entry has
      // `ticksLeft = -1` and never expires via the tick countdown that calls `removeEffect`.
      s.boosts.shield = 0;
      return;
    case 'SPEED_TAMER':
      // Only a chaos-timed stack (spec C8) ever reaches this, one expiry per stack it granted; a
      // permanent stack's active entry has `ticksLeft = -1` and never expires this way.
      s.boosts.tamerStacks = Math.max(0, s.boosts.tamerStacks - 1);
      return;
    default:
      return;
  }
}
