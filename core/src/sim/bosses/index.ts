import type { Rng } from '../../rng';
import type { BossState, GameState } from '../../types';
import { castStraight, muzzle } from '../boss';
import { EMERALD_HOOKS } from './emerald';

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

/** Ability timer shared by every boss until Tasks 6-10 give each kind its own (spec §4.1: 5-9 s). */
function defaultAbilityTimer(rng: Rng): number {
  return 300 + rng.nextInt(241);
}

/** Placeholder hook used by every kind so the engine is fully testable before Tasks 6-10 register the real ones. */
function defaultHooks(): BossHooks {
  return {
    attack(s, b) {
      const m = muzzle(b);
      castStraight(s, m.x, m.y);
    },
    ability() {
      /* no-op until the owning task registers this kind's ability. */
    },
    initialAbilityTimer: defaultAbilityTimer,
    nextAbilityTimer: defaultAbilityTimer,
  };
}

/** Per-kind boss hooks. Tasks 7-10 replace the remaining defaults with the real attacks/abilities. */
export const BOSS_HOOKS: Record<1 | 2 | 3 | 4 | 5, BossHooks> = {
  1: EMERALD_HOOKS,
  2: defaultHooks(),
  3: defaultHooks(),
  4: defaultHooks(),
  5: defaultHooks(),
};
