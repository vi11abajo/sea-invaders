import type { Rng } from '../../rng';
import { castBerserk, castMeteor, muzzle, rageMult } from '../boss';
import type { BossHooks } from './index';

/** Crimson's ability timer: 6-10 s. */
function abilityTimer(rng: Rng): number {
  return 360 + rng.nextInt(241);
}

/**
 * Crimson Behemoth (`crabBossRed`, kind 4): meteor volleys that grow from one
 * shot in phase 1 to three in phase 3, then the 12-shot berserk ring in phase 4. Its rage ability
 * (`ability`/`tick` below) scales every shot speed via `rageMult` and the attack cadence via
 * `rageDelay` (both in `boss.ts`, already wired into `updateBoss`), plus the boss's own march
 * speed (`rageMult` on `BOSS.speed`, also in `updateBoss`), and makes the boss immune to
 * ICE_FREEZE/SPEED_TAMER slowdowns for its duration (`bossImmuneToSlowdown` in `boosts.ts`).
 */
export const CRIMSON_HOOKS: BossHooks = {
  attack(s, b) {
    const m = muzzle(b);
    const mult = rageMult(b, 1000);
    if (b.phase === 1) {
      castMeteor(s, m.x, m.y, mult);
    } else if (b.phase === 2) {
      castMeteor(s, m.x - 740, m.y, mult);
      castMeteor(s, m.x + 740, m.y, mult);
    } else if (b.phase === 3) {
      castMeteor(s, m.x - 1110, m.y, mult);
      castMeteor(s, m.x, m.y, mult);
      castMeteor(s, m.x + 1110, m.y, mult);
    } else {
      castBerserk(s, m.x, m.y, mult);
    }
  },
  ability(s, b) {
    b.effectTicks = 360 + s.rngBoss.nextInt(181);
    s.events.push({ tick: s.tick, type: 'boss_ability', name: 'rage' });
  },
  initialAbilityTimer: abilityTimer,
  nextAbilityTimer: abilityTimer,
  tick(_s, b) {
    if (b.effectTicks > 0) b.effectTicks -= 1;
  },
};
