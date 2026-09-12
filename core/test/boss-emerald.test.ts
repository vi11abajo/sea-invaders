import { describe, expect, it } from 'vitest';
import {
  BOSS_SHOT, INITIAL_INPUT, PRACTICE_RUN, createGame, hashState, muzzle, spawnBoss, step, updateBoss, updateEnemyShots,
} from '../src';

const fresh = () => {
  const s = createGame('emerald', { ...PRACTICE_RUN, features: { boosts: false } });
  s.crabs = [];
  spawnBoss(s, 1);
  return s;
};

describe('Emerald Warlord (kind 1)', () => {
  it('fires one straight shot at the muzzle when the attack timer expires', () => {
    const s = fresh();
    const b = s.boss!;
    s.rngBoss = { nextInt: () => 0 } as never;
    b.attackTimer = 1;
    b.secondaryTimer = 999; // keep the secondary attack from also firing this tick
    updateBoss(s); // moves the boss, then fires at its post-move muzzle
    const m = muzzle(b);
    expect(s.enemyShots).toHaveLength(1);
    expect(s.enemyShots[0]).toMatchObject({ x: m.x, y: m.y, vx: 0, vy: BOSS_SHOT.speed, kind: 'straight' });
  });

  it('fires a zigzag pair at x ± 925 when the secondary timer expires', () => {
    const s = fresh();
    const b = s.boss!;
    s.rngBoss = { nextInt: () => 0 } as never;
    b.attackTimer = 999; // keep the primary attack from also firing this tick
    b.secondaryTimer = 1;
    updateBoss(s); // moves the boss, then fires at its post-move muzzle
    const m = muzzle(b);
    expect(s.enemyShots).toHaveLength(2);
    expect(s.enemyShots[0]).toMatchObject({ x: m.x - 925, y: m.y, vx: -73, vy: 110, kind: 'zigzag' });
    expect(s.enemyShots[1]).toMatchObject({ x: m.x + 925, y: m.y, vx: 73, vy: 110, kind: 'zigzag' });
  });

  it("flips a zigzag shot's vx after 20 updateEnemyShots calls", () => {
    const s = fresh();
    s.enemyShots = [{ x: 2000, y: 0, vx: -73, vy: 110, kind: 'zigzag', data: 20 }];
    for (let i = 0; i < 20; i++) updateEnemyShots(s);
    expect(s.enemyShots[0]!.vx).toBe(73);
  });

  it('heals ceil(maxHp*0.1) hp when the ability triggers with an elapsed cooldown', () => {
    const s = fresh();
    const b = s.boss!;
    s.rngBoss = { nextInt: () => 0 } as never;
    b.hp = 45;
    b.regenCooldown = 0;
    b.abilityTimer = 1;
    updateBoss(s);
    expect(b.hp).toBe(50);
    expect(b.regenCooldown).toBeGreaterThan(0);
    expect(s.events).toContainEqual({ tick: s.tick, type: 'boss_ability', name: 'regen' });
  });

  it('never heals above maxHp', () => {
    const s = fresh();
    const b = s.boss!;
    s.rngBoss = { nextInt: () => 0 } as never;
    b.hp = 48;
    b.regenCooldown = 0;
    b.abilityTimer = 1;
    updateBoss(s);
    expect(b.hp).toBe(50);
  });

  it('does not heal again while regenCooldown has not elapsed', () => {
    const s = fresh();
    const b = s.boss!;
    s.rngBoss = { nextInt: () => 0 } as never;
    b.hp = 40;
    b.regenCooldown = 50;
    b.abilityTimer = 1;
    updateBoss(s);
    expect(b.hp).toBe(40);
    expect(s.events.find((e) => e.type === 'boss_ability')).toBeUndefined();
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
