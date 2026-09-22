import type { Rng } from '../../rng';
import type { BossKind, BossState, GameState } from '../../types';
import { AZURE_HOOKS } from './azure';
import { CRIMSON_HOOKS } from './crimson';
import { EMERALD_HOOKS } from './emerald';
import { SOLAR_HOOKS } from './solar';
import { VOID_HOOKS } from './void';

/**
 * Per-boss behaviour, looked up by `BOSS_HOOKS[b.kind]`. `attack` and `ability` are mandatory;
 * `secondary` (Emerald's zigzag pair), `onHit` (Azure's shield), `cast` (delayed follow-up shots
 * queued in `b.pending`) and `tick` (per-tick extras, e.g. Void's teleport) are opt-in per boss.
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
}

/**
 * A placeholder for a boss of reefs 6-10 whose own task has not been written yet: starting a fight
 * with it fails loudly rather than running a half-boss. `spawnBoss` reaches `initialAbilityTimer`
 * the moment it builds the state, so no fight can begin by accident. The shared plumbing those
 * bosses stand on — `BOSS_TABLE`, the new `BossState` fields, squads, obstacles, the new shot
 * kinds — is real; only the five behaviours are still to come, one task each.
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
  6: notWrittenYet(6),
  7: notWrittenYet(7),
  8: notWrittenYet(8),
  9: notWrittenYet(9),
  10: notWrittenYet(10),
};
