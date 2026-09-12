import { idiv } from '../../fixed';
import type { Rng } from '../../rng';
import { castStraight, castZigzag, muzzle } from '../boss';
import type { BossHooks } from './index';

/** Emerald's ability timer: 5-9 s, independent of its own regeneration cooldown below. */
function abilityTimer(rng: Rng): number {
  return 300 + rng.nextInt(241);
}

/**
 * Emerald Warlord (`crabBOSSGreen`, kind 1, spec §4.2 row 1): a single-phase boss that fires
 * straight shots plus a zigzag pair on its own timer, and regenerates hp on a separate cooldown.
 */
export const EMERALD_HOOKS: BossHooks = {
  attack(s, b) {
    const m = muzzle(b);
    castStraight(s, m.x, m.y);
  },
  secondary(s, b) {
    const m = muzzle(b);
    castZigzag(s, m.x - 925, m.y, -1);
    castZigzag(s, m.x + 925, m.y, 1);
  },
  ability(s, b) {
    if (b.regenCooldown <= 0) {
      b.hp = Math.min(b.maxHp, b.hp + idiv(b.maxHp + 9, 10));
      b.regenCooldown = 300 + s.rngBoss.nextInt(301);
      s.events.push({ tick: s.tick, type: 'boss_ability', name: 'regen' });
    }
  },
  initialAbilityTimer: abilityTimer,
  nextAbilityTimer: abilityTimer,
  tick(_s, b) {
    if (b.regenCooldown > 0) b.regenCooldown -= 1;
  },
};
