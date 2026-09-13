import { describe, expect, it } from 'vitest';
import {
  BOSS,
  PRACTICE_RUN,
  activateBoost,
  createGame,
  marchCrabs,
  spawnBoss,
  updateBoosts,
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

  it('never slows an enemy shot (spec C5: only crab movement is slowed, matching the legacy)', () => {
    const s = createGame('t', PRACTICE_RUN);
    activateBoost(s, 'ICE_FREEZE');
    s.enemyShots = [{ x: 1000, y: 1000, vx: 40, vy: 110, kind: 'crab', data: 0 }];
    updateEnemyShots(s);
    expect(s.enemyShots[0]!.x).toBe(1040);
    expect(s.enemyShots[0]!.y).toBe(1110);
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
  it('kills only the bottom row (within 367 units of the max crab y), scoring/dropping like a normal kill', () => {
    const s = createGame('t', PRACTICE_RUN);
    expect(s.crabs).toHaveLength(18);
    const maxY = Math.max(...s.crabs.map((c) => c.y));
    const bottomRow = s.crabs.filter((c) => maxY - c.y <= 367);
    activateBoost(s, 'WAVE_BLAST');
    expect(s.crabs).toHaveLength(18 - bottomRow.length);
    expect(s.crabs.every((c) => maxY - c.y > 367)).toBe(true);
    expect(s.kills).toBe(bottomRow.length);
    expect(s.score).toBe(bottomRow.length * 10); // CRAB_TYPES.normal.points(10) * wave(1), no decay yet
  });

  it('does not damage the boss or clear enemy shots (spec C4: both removed from the legacy behaviour)', () => {
    const s = createGame('t', PRACTICE_RUN);
    spawnBoss(s, 1);
    s.crabs = [{ x: 1000, y: 1000, kind: 0, type: 'normal', hp: 1, dive: 0, homeX: 1000, homeY: 1000 }];
    s.enemyShots = [{ x: 0, y: 0, vx: 0, vy: 0, kind: 'crab', data: 0 }];
    activateBoost(s, 'WAVE_BLAST');
    expect(s.crabs).toHaveLength(0);
    expect(s.boss!.hp).toBe(BOSS.baseHp);
    expect(s.enemyShots).toHaveLength(1);
  });

  it('is not consumed (directly or via a pickup) when there are no crabs on screen', () => {
    const s = createGame('t', PRACTICE_RUN);
    s.crabs = [];
    expect(activateBoost(s, 'WAVE_BLAST')).toEqual({ type: 'WAVE_BLAST', consumed: false });

    s.drops.push({ x: s.ship.x, y: s.ship.y, boost: 'WAVE_BLAST', ttl: 100 });
    updateBoosts(s);
    expect(s.drops).toHaveLength(1); // still falling, not picked up
    expect(s.events.some((e) => e.type === 'boost_pickup')).toBe(false);
  });
});

describe('AUTO_TARGET', () => {
  it('recomputes vx/vy every tick towards the nearest crab (legacy 30%-toward/70%-up blend, no clamp)', () => {
    const s = createGame('t', PRACTICE_RUN);
    activateBoost(s, 'AUTO_TARGET');
    s.crabs = [{ x: 4000, y: 760, kind: 0, type: 'normal', hp: 1, dive: 0, homeX: 4000, homeY: 760 }];
    s.shots = [{ x: 1000, y: 5000, vx: 0, vy: -240, kind: 'straight', data: 0 }];
    updateShots(s);
    // After moving to y=4760, offset to the crab is (3000, -4000), a 3-4-5 triangle (len 5000):
    // vx = idiv(3000*72, 5000) = 43; vy = idiv(-4000*72, 5000) - 168 = -57 - 168 = -225.
    expect(s.shots[0]!.x).toBe(1000); // player shots never drift in x (unchanged precedent)
    expect(s.shots[0]!.y).toBe(4760);
    expect(s.shots[0]!.vx).toBe(43);
    expect(s.shots[0]!.vy).toBe(-225);
  });

  it('targets the boss when no crabs remain', () => {
    const s = createGame('t', PRACTICE_RUN);
    activateBoost(s, 'AUTO_TARGET');
    s.crabs = [];
    spawnBoss(s, 1);
    s.boss!.x = 5000;
    s.boss!.y = 500;
    s.shots = [{ x: 1000, y: 5000, vx: 0, vy: -240, kind: 'straight', data: 0 }];
    updateShots(s);
    // offset to the boss after the move is (4000, -4260), len 5843 (see boosts-complex/boss-void tests).
    expect(s.shots[0]!.vx).toBe(49);
    expect(s.shots[0]!.vy).toBe(-220);
  });

  it('prefers the boss over a farther crab', () => {
    const s = createGame('t', PRACTICE_RUN);
    activateBoost(s, 'AUTO_TARGET');
    s.crabs = [{ x: 5000, y: 100, kind: 0, type: 'normal', hp: 1, dive: 0, homeX: 5000, homeY: 100 }];
    spawnBoss(s, 1);
    s.boss!.x = 1100;
    s.boss!.y = 4700;
    s.shots = [{ x: 1000, y: 5000, vx: 0, vy: -240, kind: 'straight', data: 0 }];
    updateShots(s);
    // offset to the (nearer) boss after the move is (100, -60), len 116.
    expect(s.shots[0]!.vx).toBe(62);
    expect(s.shots[0]!.vy).toBe(-205);
  });

  it('prefers a crab over a farther boss', () => {
    const s = createGame('t', PRACTICE_RUN);
    activateBoost(s, 'AUTO_TARGET');
    s.crabs = [{ x: 1100, y: 4700, kind: 0, type: 'normal', hp: 1, dive: 0, homeX: 1100, homeY: 4700 }];
    spawnBoss(s, 1);
    s.boss!.x = 5000;
    s.boss!.y = 100;
    s.shots = [{ x: 1000, y: 5000, vx: 0, vy: -240, kind: 'straight', data: 0 }];
    updateShots(s);
    expect(s.shots[0]!.vx).toBe(62);
    expect(s.shots[0]!.vy).toBe(-205);
  });

  it('leaves vx/vy unchanged with neither crabs nor a boss', () => {
    const s = createGame('t', PRACTICE_RUN);
    activateBoost(s, 'AUTO_TARGET');
    s.crabs = [];
    s.shots = [{ x: 1000, y: 5000, vx: 0, vy: -240, kind: 'straight', data: 0 }];
    updateShots(s);
    expect(s.shots[0]!.vx).toBe(0);
    expect(s.shots[0]!.vy).toBe(-240);
  });
});
