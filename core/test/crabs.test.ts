import { describe, expect, it } from 'vitest';
import {
  ENEMY_SHOT, INVASION_Y, PRACTICE_RUN, createGame, crabSpeed, fireChance, marchCrabs, spawnWave, updateEnemyShots,
} from '../src';

describe('crabSpeed', () => {
  it('speeds up by wave and as crabs die', () => {
    const s = createGame('t', PRACTICE_RUN);
    expect(crabSpeed(s)).toBe(6);
    s.crabs = s.crabs.slice(0, 9); // half of 18 killed → +4
    expect(crabSpeed(s)).toBe(10);
    spawnWave(s, 3); // full wave 3 → +2
    expect(crabSpeed(s)).toBe(8);
  });
});

describe('marchCrabs', () => {
  it('moves sideways, then reverses and steps down at the wall', () => {
    const s = createGame('t', PRACTICE_RUN);
    s.dir = 1;
    const x0 = s.crabs[0]!.x;
    const y0 = s.crabs[0]!.y;
    // Rightmost crab: x 4812, edge 5077. Call n moves while 4812 + 6(n-1) + 265 + 6 ≤ 5625, i.e. n ≤ 91.
    for (let n = 1; n <= 91; n++) marchCrabs(s);
    expect(s.dir).toBe(1);
    expect(s.crabs[0]!.x).toBe(x0 + 6 * 91);
    marchCrabs(s); // call 92 would cross the wall
    expect(s.dir).toBe(-1);
    expect(s.crabs[0]!.x).toBe(x0 + 6 * 91);
    expect(s.crabs[0]!.y).toBe(y0 + 250);
  });

  it('ends the run when a crab reaches the invasion line', () => {
    const s = createGame('t', PRACTICE_RUN);
    const y = INVASION_Y - 265 - 1;
    s.crabs = [{ x: 2800, y, kind: 0, type: 'normal', hp: 1, dive: 0, homeX: 2800, homeY: y }];
    s.waveTotal = 1;
    marchCrabs(s);
    expect(s.over).toBe(false);
    s.crabs[0]!.y += 1;
    marchCrabs(s);
    expect(s.over).toBe(true);
  });
});

describe('fireChance', () => {
  it('rises 4 per wave and caps at 60', () => {
    expect(fireChance(1)).toBe(20);
    expect(fireChance(3)).toBe(28);
    expect(fireChance(50)).toBe(60);
  });
});

describe('updateEnemyShots', () => {
  function firstShot(s: ReturnType<typeof createGame>) {
    for (let i = 0; i < 2000 && s.enemyShots.length === 0; i++) updateEnemyShots(s);
    return s.enemyShots[0];
  }

  it('aims straight down at a ship below the crab, tagged as a crab shot', () => {
    const s = createGame('aim', PRACTICE_RUN);
    s.crabs = [{ x: s.ship.x, y: 2000, kind: 0, type: 'normal', hp: 1, dive: 0, homeX: s.ship.x, homeY: 2000 }];
    expect(firstShot(s)).toEqual({
      x: s.ship.x, y: 2265, vx: 0, vy: ENEMY_SHOT.speed, kind: 'crab', data: 0,
    });
  });

  it('aims diagonally with integer velocity', () => {
    const s = createGame('aim', PRACTICE_RUN);
    // Shot origin (crab bottom edge) is 3000 left and 4000 above the ship: a 3-4-5 triangle.
    const x = s.ship.x - 3000;
    const y = s.ship.y - 4000 - 265;
    s.crabs = [{ x, y, kind: 0, type: 'normal', hp: 1, dive: 0, homeX: x, homeY: y }];
    expect(firstShot(s)).toMatchObject({ vx: 66, vy: 88 });
  });

  it('fires on about 2% of wave-1 ticks', () => {
    const s = createGame('rate', PRACTICE_RUN);
    s.crabs = [{ x: 2812, y: 2000, kind: 0, type: 'normal', hp: 1, dive: 0, homeX: 2812, homeY: 2000 }];
    let fired = 0;
    for (let i = 0; i < 20_000; i++) {
      updateEnemyShots(s);
      const last = s.enemyShots[s.enemyShots.length - 1];
      if (last && last.y === 2265) fired += 1; // unmoved = spawned this tick
    }
    expect(fired).toBeGreaterThan(300);
    expect(fired).toBeLessThan(500);
  });

  it('drops shots that leave the field', () => {
    const s = createGame('t', PRACTICE_RUN);
    s.crabs = [];
    s.enemyShots = [{ x: 100, y: 11250 + 96 - 110, vx: 0, vy: 110, kind: 'crab', data: 0 }];
    updateEnemyShots(s);
    expect(s.enemyShots).toHaveLength(0);
  });
});
