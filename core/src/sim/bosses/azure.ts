import { BOSS_SHOT } from '../../config';
import { idiv } from '../../fixed';
import type { Rng } from '../../rng';
import { icos, isin } from '../../trig';
import type { GameState } from '../../types';
import { castLarge, castRing, muzzle } from '../boss';
import type { BossHooks } from './index';

/** The seven tidal-wave angles, legacy `(i-3)*0.5 rad` for i in 0..6, converted to whole degrees. */
const WAVE_DEGREES = [-87, -57, -29, 0, 29, 57, 87];

/**
 * Azure's tidal wave (spec §4.1 `wave` row): 7 shots fanned around straight down, moving linearly
 * (no special per-tick motion; `updateEnemyShots` treats `wave` like any non-zigzag kind).
 */
export function castWave(s: GameState, x: number, y: number): void {
  for (const deg of WAVE_DEGREES) {
    const vx = idiv(BOSS_SHOT.speed * isin(deg) * 73, 100_000);
    const vy = idiv(BOSS_SHOT.speed * icos(deg), 1000);
    s.enemyShots.push({ x, y, vx, vy, kind: 'wave', data: 0 });
  }
}

/** Azure's ability timer: 7-15 s. */
function abilityTimer(rng: Rng): number {
  return 420 + rng.nextInt(481);
}

/**
 * Azure Leviathan (`crabBossBlue`, kind 2, spec §4.2 row 2): phase 1 fires a large slow shot,
 * phase 2 fires the seven-shot tidal wave. Its water shield absorbs hits instead of hp until it
 * breaks, firing a 12-shot ring at ×1.2 speed and +29 collision radius (legacy +30%).
 */
export const AZURE_HOOKS: BossHooks = {
  attack(s, b) {
    const m = muzzle(b);
    if (b.phase === 1) castLarge(s, m.x, m.y);
    else castWave(s, m.x, m.y);
  },
  ability(s, b) {
    if (b.shieldHp <= 0) {
      b.shieldHp = 5;
      s.events.push({ tick: s.tick, type: 'boss_ability', name: 'shield' });
    }
  },
  initialAbilityTimer: abilityTimer,
  nextAbilityTimer: abilityTimer,
  onHit(s, b) {
    if (b.shieldHp > 0) {
      b.shieldHp -= 1;
      if (b.shieldHp === 0) {
        const m = muzzle(b);
        castRing(s, m.x, m.y, 12, 1200, 29);
        s.events.push({ tick: s.tick, type: 'shield_break' });
      }
      return true;
    }
    return false;
  },
};
