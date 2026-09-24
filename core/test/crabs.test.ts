import { describe, expect, it } from 'vitest';
import {
  ENEMY_SHOT, INVASION_Y, PRACTICE_RUN, SPEED_PCT, createGame, crabSpeed, fireChance, fireRamp, marchCrabs, scalePct,
  spawnWave, updateEnemyShots,
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
    s.crabs = [{ x: 2800, y, kind: 0, type: 'normal', hp: 1, slot: -1, shield: 0, shieldTimer: 0, rallies: 0, rallyTimer: 0, squad: 0, revived: 0, cell: -1 }];
    s.waveTotal = 1;
    marchCrabs(s);
    expect(s.over).toBe(false);
    s.crabs[0]!.y += 1;
    marchCrabs(s);
    expect(s.over).toBe(true);
  });
});

describe('fireRamp', () => {
  it('rises 4 per wave through wave 6 (unchanged), including wave 0 (a boss round\'s own squads)', () => {
    expect(fireRamp(0)).toBe(-4);
    expect(fireRamp(1)).toBe(0);
    expect(fireRamp(3)).toBe(8);
    expect(fireRamp(6)).toBe(20);
  });

  it('rises only 2 per wave after wave 6, reaching the pre-cap value 20 waves later than before', () => {
    expect(fireRamp(7)).toBe(22);
    expect(fireRamp(8)).toBe(24);
    expect(fireRamp(16)).toBe(40);
    expect(fireRamp(17)).toBe(42);
  });
});

describe('fireChance', () => {
  it('rises 4 per wave through wave 6, caps at 60, then scales by SPEED_PCT.crabFire (unchanged)', () => {
    const p = SPEED_PCT.crabFire;
    expect(fireChance(1)).toBe(scalePct(20, p));
    expect(fireChance(3)).toBe(scalePct(28, p));
    expect(fireChance(6)).toBe(scalePct(40, p));
    expect(fireChance(50)).toBe(scalePct(60, p));
    expect(fireChance(1, 5)).toBe(scalePct(25, p)); // the level's fireOffset adds before the scale
    expect(fireChance(0, 5)).toBe(scalePct(21, p)); // a boss round's own squads: wave 0, still the old term
  });

  it('rises only 2 per wave after wave 6, so the cap of 60 now arrives on wave 16 instead of 11', () => {
    const p = SPEED_PCT.crabFire;
    expect(fireChance(7)).toBe(scalePct(42, p));
    expect(fireChance(15)).toBe(scalePct(58, p));
    expect(fireChance(16)).toBe(scalePct(60, p));
    expect(fireChance(17)).toBe(scalePct(60, p)); // still capped
  });
});

describe('updateEnemyShots', () => {
  function firstShot(s: ReturnType<typeof createGame>) {
    for (let i = 0; i < 2000 && s.enemyShots.length === 0; i++) updateEnemyShots(s);
    return s.enemyShots[0];
  }

  it('aims straight down at Octopi below the crab, tagged as a crab shot', () => {
    const s = createGame('aim', PRACTICE_RUN);
    s.crabs = [{ x: s.octopi.x, y: 2000, kind: 0, type: 'normal', hp: 1, slot: -1, shield: 0, shieldTimer: 0, rallies: 0, rallyTimer: 0, squad: 0, revived: 0, cell: -1 }];
    expect(firstShot(s)).toEqual({
      x: s.octopi.x, y: 2265, vx: 0, vy: ENEMY_SHOT.speed, kind: 'crab', data: 0,
    });
  });

  it('aims diagonally with integer velocity', () => {
    const s = createGame('aim', PRACTICE_RUN);
    // Shot origin (crab bottom edge) is 3000 left and 4000 above Octopi: a 3-4-5 triangle.
    const x = s.octopi.x - 3000;
    const y = s.octopi.y - 4000 - 265;
    s.crabs = [{ x, y, kind: 0, type: 'normal', hp: 1, slot: -1, shield: 0, shieldTimer: 0, rallies: 0, rallyTimer: 0, squad: 0, revived: 0, cell: -1 }];
    expect(firstShot(s)).toMatchObject({ vx: 66, vy: 88 });
  });

  it('fires on about 2% of wave-1 ticks', () => {
    const s = createGame('rate', PRACTICE_RUN);
    s.crabs = [{ x: 2812, y: 2000, kind: 0, type: 'normal', hp: 1, slot: -1, shield: 0, shieldTimer: 0, rallies: 0, rallyTimer: 0, squad: 0, revived: 0, cell: -1 }];
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
