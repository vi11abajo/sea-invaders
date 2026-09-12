import type { Rng } from '../../rng';
import type { BossState, GameState } from '../../types';
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

/** Per-kind boss hooks, one real implementation per boss kind. */
export const BOSS_HOOKS: Record<1 | 2 | 3 | 4 | 5, BossHooks> = {
  1: EMERALD_HOOKS,
  2: AZURE_HOOKS,
  3: SOLAR_HOOKS,
  4: CRIMSON_HOOKS,
  5: VOID_HOOKS,
};
