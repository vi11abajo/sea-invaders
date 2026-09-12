import { describe, expect, it } from 'vitest';
import {
  BOSS,
  PRACTICE_RUN,
  activateBoost,
  createGame,
  marchCrabs,
  spawnBoss,
  updateBoss,
  updateEnemyShots,
  updateShots,
} from '../src';

describe('ICE_FREEZE', () => {
  it('halves the formation march step (6 to 3 at wave 1)', () => {
    const s = createGame('t', PRACTICE_RUN);
    s.dir = 1;
    const before = s.crabs[0]!.x;
    activateBoost(s, 'ICE_FREEZE');
    marchCrabs(s);
    expect(s.crabs[0]!.x - before).toBe(3);
  });

  it('halves an enemy shot displacement', () => {
    const s = createGame('t', PRACTICE_RUN);
    activateBoost(s, 'ICE_FREEZE');
    s.enemyShots = [{ x: 1000, y: 1000, vx: 40, vy: 110, kind: 'crab', data: 0 }];
    updateEnemyShots(s);
    expect(s.enemyShots[0]!.x).toBe(1020);
    expect(s.enemyShots[0]!.y).toBe(1055);
  });
});

describe('POINTS_FREEZE', () => {
  it('pauses the boss fightTicks counter while active', () => {
    const s = createGame('t', PRACTICE_RUN);
    s.crabs = [];
    spawnBoss(s, 1);
    activateBoost(s, 'POINTS_FREEZE');
    for (let i = 0; i < 10; i++) updateBoss(s);
    expect(s.boss!.fightTicks).toBe(0);
  });
});

describe('WAVE_BLAST', () => {
  it('clears every crab for full points, damages a boss and clears enemy shots', () => {
    const s = createGame('t', PRACTICE_RUN);
    expect(s.crabs).toHaveLength(18);
    spawnBoss(s, 1);
    s.enemyShots = [{ x: 0, y: 0, vx: 0, vy: 0, kind: 'crab', data: 0 }];
    activateBoost(s, 'WAVE_BLAST');
    expect(s.crabs).toHaveLength(0);
    expect(s.kills).toBe(18);
    expect(s.score).toBe(180);
    expect(s.boss!.hp).toBe(BOSS.baseHp - 10);
    expect(s.enemyShots).toHaveLength(0);
    expect(s.drops.length).toBeLessThanOrEqual(18);
  });
});

describe('AUTO_TARGET', () => {
  it('curves a shot placed off-axis towards a single crab, saturating vx at 120', () => {
    const s = createGame('t', PRACTICE_RUN);
    activateBoost(s, 'AUTO_TARGET');
    s.crabs = [{ x: 5000, y: 500, kind: 0, type: 'normal', hp: 1, dive: 0, homeX: 5000, homeY: 500 }];
    s.shots = [{ x: 1000, y: 5000, vx: 0, vy: -240, kind: 'straight', data: 0 }];
    updateShots(s);
    expect(s.shots[0]!.vx).toBe(60);
    updateShots(s);
    expect(s.shots[0]!.vx).toBe(120);
    updateShots(s);
    expect(s.shots[0]!.vx).toBe(120);
    expect(s.shots[0]!.vy).toBe(-240);
  });

  it('targets the boss when no crabs remain', () => {
    const s = createGame('t', PRACTICE_RUN);
    activateBoost(s, 'AUTO_TARGET');
    s.crabs = [];
    spawnBoss(s, 1);
    s.boss!.x = 5000;
    s.shots = [{ x: 1000, y: 5000, vx: 0, vy: -240, kind: 'straight', data: 0 }];
    updateShots(s);
    expect(s.shots[0]!.vx).toBe(60);
  });

  it('leaves vx unchanged with neither crabs nor a boss', () => {
    const s = createGame('t', PRACTICE_RUN);
    activateBoost(s, 'AUTO_TARGET');
    s.crabs = [];
    s.shots = [{ x: 1000, y: 5000, vx: 0, vy: -240, kind: 'straight', data: 0 }];
    updateShots(s);
    expect(s.shots[0]!.vx).toBe(0);
  });
});
