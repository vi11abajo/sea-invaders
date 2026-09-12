import { describe, expect, it } from 'vitest';
import { BOSS, BOSS_SHOT, FIELD_W, INITIAL_INPUT, PRACTICE_RUN, castRing, createGame, damageBoss, hashState, spawnBoss, step, updateBoss } from '../src';

const fresh = (kind: 1 | 2 | 3 | 4 | 5 = 1) => {
  const s = createGame('boss', { ...PRACTICE_RUN, features: { boosts: false } });
  s.crabs = [];
  spawnBoss(s, kind);
  return s;
};

describe('boss engine', () => {
  it('spawns with legacy hp, one phase for Emerald, five for Void', () => {
    expect(fresh(1).boss).toMatchObject({ hp: 50, maxHp: 50, maxPhases: 1, phase: 1, state: 'fighting' });
    expect(fresh(5).boss).toMatchObject({ hp: 150, maxHp: 150, maxPhases: 5 });
  });
  it('bounces between the walls at BOSS.speed', () => {
    const s = fresh(1);
    const b = s.boss!;
    b.x = FIELD_W - BOSS.width / 2 - 10; b.vx = BOSS.speed;
    updateBoss(s);
    expect(b.vx).toBe(-BOSS.speed);
  });
  it('enters a 120-tick invulnerable transition at each phase threshold', () => {
    const s = fresh(2); // 75 hp, 2 phases: threshold at 75*(2-1)/2 = 37
    damageBoss(s, 38);
    expect(s.boss).toMatchObject({ hp: 37, state: 'transition', transitionTicks: BOSS.transitionTicks, phase: 1 });
    damageBoss(s, 5);
    expect(s.boss!.hp).toBe(37);
    for (let i = 0; i < BOSS.transitionTicks; i++) updateBoss(s);
    expect(s.boss).toMatchObject({ state: 'fighting', phase: 2 });
  });
  it('attack delay shrinks 20% per phase', () => {
    const s = fresh(3);
    s.boss!.phase = 3;
    s.rngBoss = { nextInt: () => 0 } as never;
    s.boss!.attackTimer = 0;
    updateBoss(s);
    expect(s.boss!.attackTimer).toBe(72); // 120 * (1 - 0.4)
  });
  it('scores 10000*kind decayed 1% per 150 ticks, floor 1%, on death', () => {
    const s = fresh(1);
    s.boss!.fightTicks = 150 * 50;
    damageBoss(s, 50);
    expect(s.boss).toBeNull();
    expect(s.score).toBe(5000);
    expect(s.cleared).toBe(false); // practice run without a level
  });
  it('ring casts count shots evenly with integer trig', () => {
    const s = fresh(1);
    s.enemyShots = [];
    castRing(s, 2000, 2000, 8, 1000, 0);
    expect(s.enemyShots).toHaveLength(8);
    expect(s.enemyShots[0]).toMatchObject({ vx: BOSS_SHOT.speed, vy: 0, kind: 'ring' });
    expect(s.enemyShots[2]).toMatchObject({ vx: 0, vy: BOSS_SHOT.speed });
  });
  it('player shots damage the boss and are consumed', () => {
    const s = fresh(1);
    const b = s.boss!;
    s.shots.push({ x: b.x, y: b.y, vx: 0, vy: -240, kind: 'straight', data: 0 });
    step(s, INITIAL_INPUT);
    expect(b.hp).toBe(49);
    expect(s.shots).toHaveLength(0);
  });
  it('is deterministic', () => {
    const a = fresh(1), b = fresh(1);
    for (let i = 0; i < 600; i++) { step(a, INITIAL_INPUT); step(b, INITIAL_INPUT); }
    expect(hashState(a)).toBe(hashState(b));
  });
});
