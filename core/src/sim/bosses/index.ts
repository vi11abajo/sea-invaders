import type { Rng } from '../../rng';
import type { BoostType, Bullet, BossKind, BossState, GameState } from '../../types';
import { AZURE_HOOKS } from './azure';
import { CASTELLAN_HOOKS } from './castellan';
import { CORSAIR_HOOKS } from './corsair';
import { CRIMSON_HOOKS } from './crimson';
import { EMERALD_HOOKS } from './emerald';
import { HUNTSMAN_HOOKS } from './huntsman';
import { SOLAR_HOOKS } from './solar';
import { TEMPLAR_HOOKS } from './templar';
import { TYRANT_HOOKS } from './tyrant';
import { VOID_HOOKS } from './void';

// The reefs 6-10 bosses are written one task at a time; each one's own module carries its constants
// (the app and the tests read them from here, never by reaching into the module).
export * from './templar';
export * from './castellan';
export * from './corsair';
export * from './tyrant';
export * from './huntsman';

/**
 * Per-boss behaviour, looked up by `BOSS_HOOKS[b.kind]`. `attack` and `ability` are mandatory;
 * `secondary` (Emerald's zigzag pair), `onHit` (Azure's shield), `cast` (delayed follow-up shots
 * queued in `b.pending`), `tick` (per-tick extras, e.g. Void's teleport) and the two phase hooks
 * below are opt-in per boss.
 *
 * Every optional member is a member no boss of the first campaign defines, which is what keeps the
 * shared code in `sim/boss.ts` a no-op for kinds 1-5: an undefined hook draws nothing, reorders
 * nothing and changes no arithmetic (spec §10's invariance promise).
 */
export interface BossHooks {
  attack(s: GameState, b: BossState): void;
  secondary?(s: GameState, b: BossState): void;
  ability(s: GameState, b: BossState): void;
  initialAbilityTimer(rng: Rng): number;
  nextAbilityTimer(rng: Rng): number;
  /**
   * Returns true when a shield absorbed the hit instead of the boss taking damage (or, the Gold
   * Corsair's own Spikes, reflected it back down the field). `shot` is the player bullet that hit
   * the boss box; every real hit through `collide.ts`'s `hitCrabs` supplies it, and it is undefined
   * only when a caller (a test, mostly) reaches `damageBoss` directly without one. Added for the
   * Corsair's task (spec §5.2): every `onHit` before it declares only `(s, b)` and TypeScript allows
   * an implementation with fewer parameters to satisfy an interface that declares more, so this
   * changes nothing for Azure's or the Verdant Templar's own shields.
   */
  onHit?(s: GameState, b: BossState, shot?: Bullet): boolean;
  cast?(s: GameState, b: BossState, id: number): void;
  tick?(s: GameState, b: BossState): void;
  /**
   * The fight pauses: called by `damageBoss` the moment a phase threshold puts the boss into its
   * transition, before any tick of it has run. A boss with an attack in flight settles it here (the
   * Templar closes his guard and drops a queued wall).
   */
  onTransition?(s: GameState, b: BossState): void;
  /**
   * A phase begins: called by `spawnBoss` once the boss stands (phase 1) and by `updateBoss` when a
   * transition runs out (every later phase), each time right after the event that announces it. A
   * boss that opens a phase with something of its own does it here (the Templar's warden line).
   */
  onPhaseStart?(s: GameState, b: BossState): void;
  /**
   * Runs every tick the boss exists, including while it is transitioning between phases — the one
   * hook `updateBoss` calls before it ever looks at `state`, ahead of the `state === 'transition'`
   * check that skips every other per-tick hook outright (`tick` above included). For a mechanic that
   * must not pause when the fight itself does: today only the Storm Tyrant's own lanes (spec §5.2 —
   * "lanes already warned keep counting down through a transition") and, for simplicity, his
   * discharge window alongside them (`sim/bosses/tyrant.ts`'s own doc explains why both live in one
   * hook rather than splitting the discharge countdown into the ordinary `tick`).
   */
  tickThroughTransition?(s: GameState, b: BossState): void;
  /**
   * The player just picked up a boost drop (spec §5.2, the Abyssal Huntsman's Mirror): called from
   * `sim/boosts.ts`, the one place a pickup is actually consumed, with the drop's own `type` — never
   * whatever RANDOM_CHAOS resolved it to, so a chaos pickup never mirrors anything a direct one
   * would. Only ever called while `s.boss` exists; undefined for every kind but 10, so nothing
   * changes for kinds 1-9 (spec §10's invariance promise) — see `sim/bosses/huntsman.ts`'s own doc
   * for the mirror classes and durations.
   */
  onBoostPickup?(s: GameState, b: BossState, type: BoostType): void;
}

/** Per-kind boss hooks, one real implementation per boss kind. Kinds 6-10 (spec §5.2) are all written now — `templar.ts`, `castellan.ts`, `corsair.ts`, `tyrant.ts`, `huntsman.ts`. */
export const BOSS_HOOKS: Record<BossKind, BossHooks> = {
  1: EMERALD_HOOKS,
  2: AZURE_HOOKS,
  3: SOLAR_HOOKS,
  4: CRIMSON_HOOKS,
  5: VOID_HOOKS,
  6: TEMPLAR_HOOKS,
  7: CASTELLAN_HOOKS,
  8: CORSAIR_HOOKS,
  9: TYRANT_HOOKS,
  10: HUNTSMAN_HOOKS,
};
