import { describe, expect, it } from 'vitest';
import {
  BOSS, FIELD_H, INITIAL_INPUT, PRACTICE_RUN, createGame, damageBoss, hashState, idiv, muzzle, spawnBoss, step,
  updateBoss, updateEnemyShots,
} from '../src';

const fresh = (kind: 1 | 2 | 3 | 4 | 5 = 3) => {
  const s = createGame('solar', { ...PRACTICE_RUN, features: { boosts: false } });
  s.crabs = [];
  spawnBoss(s, kind);
  return s;
};

describe('Solar Kraken (kind 3)', () => {
  it('fires one straight shot at x1.22 speed at the muzzle in phase 1', () => {
    const s = fresh();
    const b = s.boss!;
    b.attackTimer = 1;
    updateBoss(s); // moves the boss, then fires at its post-move muzzle
    const m = muzzle(b);
    expect(s.enemyShots).toHaveLength(1);
    expect(s.enemyShots[0]).toMatchObject({ x: m.x, y: m.y, vx: 0, vy: 134, kind: 'straight' });
  });

  it('enters phase 2 at hp <= 66 (100 * (3-1)/3) after the 120-tick transition', () => {
    const s = fresh();
    damageBoss(s, 34); // 100 - 34 = 66
    expect(s.boss).toMatchObject({ hp: 66, state: 'transition', transitionTicks: BOSS.transitionTicks, phase: 1 });
    for (let i = 0; i < BOSS.transitionTicks; i++) updateBoss(s);
    expect(s.boss).toMatchObject({ state: 'fighting', phase: 2 });
  });

  it('fires 8 ring shots with vx 122 at x1.11 speed in phase 2', () => {
    const s = fresh();
    const b = s.boss!;
    damageBoss(s, 34);
    for (let i = 0; i < BOSS.transitionTicks; i++) updateBoss(s);
    expect(b.phase).toBe(2);
    s.enemyShots = [];
    b.attackTimer = 1;
    updateBoss(s);
    expect(s.enemyShots).toHaveLength(8);
    for (const shot of s.enemyShots) expect(shot.kind).toBe('ring');
    expect(s.enemyShots[0]!.vx).toBe(122);
  });

  it('enters phase 3 at hp <= 33 (66 * (3-2)/3) and fires 5 explosive shots with a 45-tick fuse', () => {
    const s = fresh();
    const b = s.boss!;
    damageBoss(s, 34); // -> 66, phase 1 -> transition
    for (let i = 0; i < BOSS.transitionTicks; i++) updateBoss(s);
    damageBoss(s, 33); // 66 - 33 = 33, phase 2 -> transition
    for (let i = 0; i < BOSS.transitionTicks; i++) updateBoss(s);
    expect(b.phase).toBe(3);
    s.enemyShots = [];
    b.attackTimer = 1;
    updateBoss(s);
    expect(s.enemyShots).toHaveLength(5);
    for (const shot of s.enemyShots) {
      expect(shot.kind).toBe('explosive');
      expect(shot.data).toBe(45);
      expect(shot.vy).toBeGreaterThanOrEqual(0);
    }
  });

  it('splits an explosive shot into 4 fragments once its fuse reaches zero', () => {
    const s = fresh();
    s.enemyShots = [{ x: 2000, y: 2000, vx: 10, vy: 20, kind: 'explosive', data: 1 }];
    updateEnemyShots(s);
    expect(s.enemyShots.filter((sh) => sh.kind === 'explosive')).toHaveLength(0);
    const fragments = s.enemyShots.filter((sh) => sh.kind === 'fragment');
    expect(fragments).toHaveLength(4);
    for (const f of fragments) expect(f.data).toBe(0);
    const vectors = fragments.map((f) => `${f.vx},${f.vy}`).sort();
    expect(vectors).toEqual(['-73,0', '0,-73', '0,73', '73,0']);
  });

  it('splits an explosive shot immediately once below two thirds of the field, even before the fuse ends', () => {
    const s = fresh();
    const y = idiv(FIELD_H * 2, 3) + 50; // already past the threshold
    s.enemyShots = [{ x: 2000, y, vx: 0, vy: 0, kind: 'explosive', data: 40 }];
    updateEnemyShots(s);
    expect(s.enemyShots.filter((sh) => sh.kind === 'explosive')).toHaveLength(0);
    expect(s.enemyShots.filter((sh) => sh.kind === 'fragment')).toHaveLength(4);
  });

  it('schedules 8 meteor warnings at x=300 when the ability triggers with rngBoss stubbed to 0', () => {
    const s = fresh();
    const b = s.boss!;
    s.rngBoss = { nextInt: () => 0 } as never;
    b.attackTimer = 100_000;
    b.abilityTimer = 1;
    updateBoss(s);
    expect(b.pending).toHaveLength(16); // 8 pairs of [ticksLeft, castId]
    const warnings = s.events.filter((e) => e.type === 'meteor_warning');
    expect(warnings).toHaveLength(8);
    for (const w of warnings) expect((w as { x: number }).x).toBe(300);
    expect(s.events).toContainEqual({ tick: s.tick, type: 'boss_ability', name: 'meteor' });
  });

  it('drops 8 meteors from above the field 60 ticks after the ability triggers', () => {
    const s = fresh();
    const b = s.boss!;
    s.rngBoss = { nextInt: () => 0 } as never;
    b.attackTimer = 100_000; // never fires during this test
    b.abilityTimer = 1;
    for (let i = 0; i < 60; i++) updateBoss(s);
    expect(b.state).toBe('fighting');
    const meteors = s.enemyShots.filter((sh) => sh.kind === 'meteor');
    expect(meteors).toHaveLength(8);
    for (const m of meteors) {
      expect(m.x).toBe(300);
      expect(m.y).toBe(-200);
      expect(m.vy).toBe(88);
    }
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
