import type { Rng } from '../../rng';
import type { BossKind, BossState, GameState } from '../../types';
import { AZURE_HOOKS } from './azure';
import { CRIMSON_HOOKS } from './crimson';
import { EMERALD_HOOKS } from './emerald';
import { SOLAR_HOOKS } from './solar';
import { TEMPLAR_HOOKS } from './templar';
import { VOID_HOOKS } from './void';

// The reefs 6-10 bosses are written one task at a time; each one's own module carries its constants
// (the app and the tests read them from here, never by reaching into the module).
export * from './templar';

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
  /** Returns true when a shield absorbed the hit instead of the boss taking damage. */
  onHit?(s: GameState, b: BossState): boolean;
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
}

/**
 * A placeholder for a boss of reefs 6-10 whose own task has not been written yet: starting a fight
 * with it fails loudly rather than running a half-boss. `spawnBoss` reaches `initialAbilityTimer`
 * the moment it builds the state, so no fight can begin by accident. The shared plumbing those
 * bosses stand on — `BOSS_TABLE`, the new `BossState` fields, squads, obstacles, the new shot
 * kinds — is real; only the behaviours are still to come, one task each. Kind 6 is written
 * (`templar.ts`); 7 to 10 are still placeholders.
 */
function notWrittenYet(kind: number): BossHooks {
  const fail = (): never => {
    throw new Error(`boss kind ${kind} is not implemented yet`);
  };
  return { attack: fail, ability: fail, initialAbilityTimer: fail, nextAbilityTimer: fail };
}

/** Per-kind boss hooks, one real implementation per boss kind. */
export const BOSS_HOOKS: Record<BossKind, BossHooks> = {
  1: EMERALD_HOOKS,
  2: AZURE_HOOKS,
  3: SOLAR_HOOKS,
  4: CRIMSON_HOOKS,
  5: VOID_HOOKS,
  6: TEMPLAR_HOOKS,
  7: notWrittenYet(7),
  8: notWrittenYet(8),
  9: notWrittenYet(9),
  10: notWrittenYet(10),
};
