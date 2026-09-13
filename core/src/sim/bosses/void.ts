import { BOSS, BOSS_SHOT, FIELD_W } from '../../config';
import { idiv } from '../../fixed';
import type { Rng } from '../../rng';
import { icos, isin } from '../../trig';
import type { BossState, GameState } from '../../types';
import { castBerserk, castExplosive, castRing, castStraight, muzzle } from '../boss';
import type { BossHooks } from './index';

/** Cast ids scheduled in `b.pending`, dispatched by `VOID_HOOKS.cast` (spec §4.2 row 5). */
const SPIRAL = 1;
const CLONE = 2;
const GRAVITY = 3;
const BERSERK = 4;
const EXPLOSIVE3 = 5;

/** Void's ability timer: 7-15 s, same range as Azure's (spec §4.1). */
function abilityTimer(rng: Rng): number {
  return 420 + rng.nextInt(481);
}

/** Teleports the boss to a fresh random x within the field and emits `boss_teleport` (spec §4.2 row 5). */
function teleport(s: GameState, b: BossState): void {
  const half = idiv(BOSS.width, 2);
  const toX = half + s.rngBoss.nextInt(FIELD_W - BOSS.width + 1);
  s.events.push({ tick: s.tick, type: 'boss_teleport', fromX: b.x, toX });
  b.x = toX;
}

/**
 * Void's spiral shot (spec §4.1 `spiral` row): 6 shots fanned evenly starting at `b.spiral`
 * degrees, each flying outward at 0.8x `BOSS_SHOT.speed` plus a fixed 0.3x downward bias;
 * `b.spiral` then advances 12 degrees (legacy 0.2 rad) for the next cast.
 */
function castSpiral(s: GameState, b: BossState): void {
  const m = muzzle(b);
  for (let i = 0; i < 6; i++) {
    const deg = b.spiral + idiv(i * 360, 6);
    const vx = idiv(BOSS_SHOT.speed * icos(deg) * 8, 10_000);
    const vy = idiv(BOSS_SHOT.speed * isin(deg) * 8, 10_000) + 33;
    s.enemyShots.push({ x: m.x, y: m.y, vx, vy, kind: 'spiral', data: 0 });
  }
  b.spiral = (b.spiral + 12) % 360;
}

/**
 * Void's clone attack (spec §4.1 `clone` row, legacy `createCloneAttack`): the standard 8-shot
 * ring cast from the boss's own muzzle at 0.8x speed, plus a `boss_clone` event giving the
 * renderer two mirror x positions (clamped inside the field) to draw decoy clones at.
 */
function castClone(s: GameState, b: BossState): void {
  const m = muzzle(b);
  const half = idiv(BOSS.width, 2);
  castRing(s, m.x, m.y, 8, 800, 0);
  const leftX = Math.max(half, b.x - 1200);
  const rightX = Math.min(FIELD_W - half, b.x + 1200);
  s.events.push({ tick: s.tick, type: 'boss_clone', leftX, rightX });
}

/**
 * Void's gravity wave (spec §4.1 `gravity` row): 16 shots placed evenly on a 300-unit ring around
 * the muzzle, flying straight outward at 0.5x `BOSS_SHOT.speed`. Each `gravity` shot then pulls
 * player shots towards itself every tick — see `pullShotsTowardGravity` in `sim/crabs.ts`.
 */
function castGravity(s: GameState, b: BossState): void {
  const m = muzzle(b);
  for (let i = 0; i < 16; i++) {
    const deg = idiv(i * 360, 16);
    const x = m.x + idiv(300 * icos(deg), 1000);
    const y = m.y + idiv(300 * isin(deg), 1000);
    const vx = idiv(55 * icos(deg), 1000);
    const vy = idiv(55 * isin(deg), 1000);
    s.enemyShots.push({ x, y, vx, vy, kind: 'gravity', data: 0 });
  }
}

/**
 * Void Sovereign (`crabBossViolet`, kind 5, spec §4.2 row 5): every phase but the last teleports
 * to a random x, then either fires immediately (phase 1) or schedules a delayed follow-up cast in
 * `b.pending` (phases 2-4: spiral, clone, gravity). Phase 5 ("chaos") never teleports: it casts a
 * spiral immediately, then schedules a berserk ring and a 3-shot explosive volley. Its temporal
 * freeze ability halts the player's shots in flight for 180 ticks (`effectTicks`, consumed by
 * `updateShots` in `sim/octopi.ts` and `frame.ts`'s `freeze` field) without touching their stored
 * velocities, so they resume exactly where they left off once it expires.
 */
export const VOID_HOOKS: BossHooks = {
  attack(s, b) {
    if (b.phase !== 5) teleport(s, b);
    const m = muzzle(b);
    if (b.phase === 1) {
      castStraight(s, m.x, m.y);
    } else if (b.phase === 2) {
      b.pending.push(12, SPIRAL);
    } else if (b.phase === 3) {
      b.pending.push(18, CLONE);
    } else if (b.phase === 4) {
      b.pending.push(15, GRAVITY);
    } else {
      castSpiral(s, b);
      b.pending.push(12, BERSERK);
      b.pending.push(24, EXPLOSIVE3);
    }
  },
  ability(s, b) {
    b.effectTicks = 180;
    s.events.push({ tick: s.tick, type: 'player_freeze', ticks: 180 });
    s.events.push({ tick: s.tick, type: 'boss_ability', name: 'freeze' });
  },
  initialAbilityTimer: abilityTimer,
  nextAbilityTimer: abilityTimer,
  cast(s, b, id) {
    if (id === SPIRAL) castSpiral(s, b);
    else if (id === CLONE) castClone(s, b);
    else if (id === GRAVITY) castGravity(s, b);
    else if (id === BERSERK) {
      const m = muzzle(b);
      castBerserk(s, m.x, m.y, 1000);
    } else if (id === EXPLOSIVE3) {
      const m = muzzle(b);
      castExplosive(s, m.x, m.y, 3);
    }
  },
  tick(_s, b) {
    if (b.effectTicks > 0) b.effectTicks -= 1;
  },
};
