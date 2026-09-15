import { describe, expect, it } from 'vitest';
import {
  BOSS, INITIAL_INPUT, PRACTICE_RUN, activateBoost, bossImmuneToSlowdown, createGame, damageBoss, hashState, idiv,
  isqrt, muzzle, spawnBoss, step, updateBoss, updateEnemyShots,
} from '../src';
import type { GameState } from '../src';

const fresh = () => {
  const s = createGame('crimson', { ...PRACTICE_RUN, features: { boosts: false } });
  s.crabs = [];
  spawnBoss(s, 4);
  return s;
};

/** Damages the boss down to each phase threshold and runs its transition, matching `damageBoss`'s own formula. */
function advanceToPhase(s: GameState, target: number): void {
  const b = s.boss!;
  while (b.phase < target) {
    const threshold = idiv(b.maxHp * (b.maxPhases - b.phase), b.maxPhases);
    damageBoss(s, b.hp - threshold);
    for (let i = 0; i < BOSS.transitionTicks; i++) updateBoss(s);
  }
}

describe('Crimson Behemoth (kind 4)', () => {
  it('fires one meteor at the muzzle in phase 1', () => {
    const s = fresh();
    const b = s.boss!;
    b.attackTimer = 1;
    b.abilityTimer = 999_999;
    updateBoss(s); // moves the boss, then fires at its post-move muzzle
    const m = muzzle(b);
    expect(s.enemyShots).toHaveLength(1);
    expect(s.enemyShots[0]).toMatchObject({ x: m.x, y: m.y, vx: 0, vy: 110, kind: 'meteor' });
  });

  it('fires two meteors at x ± 740 in phase 2', () => {
    const s = fresh();
    const b = s.boss!;
    advanceToPhase(s, 2);
    expect(b.phase).toBe(2);
    s.enemyShots = [];
    b.attackTimer = 1;
    b.abilityTimer = 999_999;
    updateBoss(s);
    const m = muzzle(b);
    expect(s.enemyShots).toHaveLength(2);
    expect(s.enemyShots[0]).toMatchObject({ x: m.x - 740, y: m.y, vx: 0, vy: 110, kind: 'meteor' });
    expect(s.enemyShots[1]).toMatchObject({ x: m.x + 740, y: m.y, vx: 0, vy: 110, kind: 'meteor' });
  });

  it('fires three meteors at x − 1110, x, x + 1110 in phase 3', () => {
    const s = fresh();
    const b = s.boss!;
    advanceToPhase(s, 3);
    expect(b.phase).toBe(3);
    s.enemyShots = [];
    b.attackTimer = 1;
    b.abilityTimer = 999_999;
    updateBoss(s);
    const m = muzzle(b);
    expect(s.enemyShots).toHaveLength(3);
    expect(s.enemyShots[0]).toMatchObject({ x: m.x - 1110, y: m.y, vx: 0, vy: 110, kind: 'meteor' });
    expect(s.enemyShots[1]).toMatchObject({ x: m.x, y: m.y, vx: 0, vy: 110, kind: 'meteor' });
    expect(s.enemyShots[2]).toMatchObject({ x: m.x + 1110, y: m.y, vx: 0, vy: 110, kind: 'meteor' });
  });

  it('fires 12 berserk shots evenly spread with speeds in [110, 165] in phase 4', () => {
    const s = fresh();
    const b = s.boss!;
    advanceToPhase(s, 4);
    expect(b.phase).toBe(4);
    s.enemyShots = [];
    s.rngBoss = { nextInt: () => 0 } as never; // minimum per-shot speed multiplier (x1.0)
    b.attackTimer = 1;
    b.abilityTimer = 999_999;
    updateBoss(s);
    expect(s.enemyShots).toHaveLength(12);
    for (const shot of s.enemyShots) {
      expect(shot.kind).toBe('berserk');
      expect(shot.data).toBe(0);
      // Integer sqrt of an integer-trig ring truncates by at most 1 unit off-axis (deg not a multiple of 90).
      const speed = isqrt(shot.vx * shot.vx + shot.vy * shot.vy);
      expect(speed).toBeGreaterThanOrEqual(109);
      expect(speed).toBeLessThanOrEqual(165);
    }
    expect(s.enemyShots[0]).toMatchObject({ vx: 110, vy: 0 }); // deg 0, exact axis speed
    expect(s.enemyShots[3]).toMatchObject({ vx: 0, vy: 110 }); // deg 90, exact axis speed
  });

  it('scales a berserk shot to the maximum x1.5 per-shot multiplier', () => {
    const s = fresh();
    const b = s.boss!;
    advanceToPhase(s, 4);
    s.enemyShots = [];
    s.rngBoss = { nextInt: () => 500 } as never; // maximum per-shot speed multiplier (x1.5)
    b.attackTimer = 1;
    b.abilityTimer = 999_999;
    updateBoss(s);
    expect(s.enemyShots[0]).toMatchObject({ vx: 165, vy: 0 });
  });

  it('triggers rage on ability, scaling the attack delay to 77 and a phase-1 meteor vy to 170', () => {
    const s = fresh();
    const b = s.boss!;
    s.rngBoss = { nextInt: () => 0 } as never;
    b.effectTicks = 100; // rage already active
    b.attackTimer = 1;
    b.abilityTimer = 999_999;
    updateBoss(s);
    expect(s.enemyShots[0]).toMatchObject({ vy: 170, kind: 'meteor' });
    expect(b.attackTimer).toBe(77); // idiv(120 * 100, 155)
  });

  it('moves 23 units per tick in rage instead of 15', () => {
    const s = fresh();
    const b = s.boss!;
    b.attackTimer = 999_999;
    b.abilityTimer = 999_999;
    b.vx = BOSS.speed;
    const x0 = b.x;
    updateBoss(s);
    expect(b.x - x0).toBe(15);

    const r = fresh();
    const rb = r.boss!;
    rb.effectTicks = 100;
    rb.attackTimer = 999_999;
    rb.abilityTimer = 999_999;
    rb.vx = BOSS.speed;
    const x1 = rb.x;
    updateBoss(r);
    expect(rb.x - x1).toBe(23); // idiv(15 * 155, 100)
  });

  it('sets effectTicks in [360, 540) and emits a rage ability event when the ability triggers', () => {
    const s = fresh();
    const b = s.boss!;
    s.rngBoss = { nextInt: () => 0 } as never;
    b.attackTimer = 999_999;
    b.abilityTimer = 1;
    updateBoss(s);
    expect(b.effectTicks).toBeGreaterThan(0); // 360, minus the same-tick tick() decrement
    expect(s.events).toContainEqual({ tick: s.tick, type: 'boss_ability', name: 'rage' });
  });

  it('expires rage after its ticks run out', () => {
    const s = fresh();
    const b = s.boss!;
    b.effectTicks = 5;
    b.attackTimer = 999_999;
    b.abilityTimer = 999_999;
    for (let i = 0; i < 5; i++) updateBoss(s);
    expect(b.effectTicks).toBe(0);
    expect(bossImmuneToSlowdown(s)).toBe(false);
  });

  it('is immune to slowdown only while rage is active', () => {
    const s = fresh();
    const b = s.boss!;
    b.effectTicks = 0;
    expect(bossImmuneToSlowdown(s)).toBe(false);
    b.effectTicks = 50;
    expect(bossImmuneToSlowdown(s)).toBe(true);
  });

  it('a boss shot keeps its full vy under ICE_FREEZE only while Crimson rages; calm, it is halved like every enemy shot', () => {
    const raging = fresh();
    raging.boss!.effectTicks = 50;
    activateBoost(raging, 'ICE_FREEZE');
    raging.enemyShots = [{ x: 2000, y: 0, vx: 0, vy: 100, kind: 'meteor', data: 0 }];
    updateEnemyShots(raging);
    expect(raging.enemyShots[0]!.y).toBe(100);

    const calm = fresh();
    calm.boss!.effectTicks = 0;
    activateBoost(calm, 'ICE_FREEZE');
    calm.enemyShots = [{ x: 2000, y: 0, vx: 0, vy: 100, kind: 'meteor', data: 0 }];
    updateEnemyShots(calm);
    expect(calm.enemyShots[0]!.y).toBe(50);
  });

  it('is deterministic over 600 ticks', () => {
    const a = fresh();
    const b = fresh();
    for (let i = 0; i < 600; i++) {
      step(a, INITIAL_INPUT);
      step(b, INITIAL_INPUT);
    }
    expect(hashState(a)).toBe(hashState(b));
  });
});
