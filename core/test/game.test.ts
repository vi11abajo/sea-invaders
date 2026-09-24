import { describe, expect, it } from 'vitest';
import {
  CRAB, CRAB_TYPES, FIELD_W, INITIAL_INPUT, PRACTICE_RUN, TYPE_COLOUR, createGame, dailyPool, spawnWave,
} from '../src';

describe('createGame', () => {
  it('starts with Octopi at the bottom centre and wave 1', () => {
    const s = createGame('t', PRACTICE_RUN);
    expect(INITIAL_INPUT).toEqual({ x: 2812, y: 9650 });
    expect(s.octopi).toEqual({ x: 2812, y: 9650, cooldown: 8, invuln: 0, lives: 3, fireCarry: 0, shell: 0 });
    expect(s).toMatchObject({ tick: 0, wave: 1, waveTotal: 18, score: 0, kills: 0, over: false });
    expect(s.crabs).toHaveLength(18);
    expect([1, -1]).toContain(s.dir);
  });

  it('places the formation inside the field on integer coordinates', () => {
    const s = createGame('t', PRACTICE_RUN);
    const half = CRAB.size / 2;
    for (const c of s.crabs) {
      expect(Number.isInteger(c.x) && Number.isInteger(c.y)).toBe(true);
      expect(c.x - half).toBeGreaterThanOrEqual(0);
      expect(c.x + half).toBeLessThanOrEqual(FIELD_W);
      expect(c.kind >= 0 && c.kind < CRAB.kinds).toBe(true);
    }
    expect(s.crabs[0]).toMatchObject({ x: 812, y: 1500 });
    expect(s.crabs[5]).toMatchObject({ x: 4812, y: 1500 });
    expect(s.crabs[17]).toMatchObject({ x: 4812, y: 2900 });
  });

  it('spawns wave 1 entirely from the wave-1 pool: plain green crabs', () => {
    const s = createGame('t', PRACTICE_RUN);
    for (const c of s.crabs) {
      expect(c).toMatchObject({ type: 'normal', hp: 1, kind: TYPE_COLOUR.normal });
    }
  });

  it('is deterministic per seed and varies across seeds', () => {
    const types = (seed: string) => {
      const s = createGame(seed, PRACTICE_RUN);
      spawnWave(s, 5); // the widest pool: all five kinds can come up
      return s.crabs.map((c) => c.type).join(',');
    };
    expect(types('a')).toBe(types('a'));
    expect(new Set(['a', 'b', 'c', 'd', 'e', 'f'].map(types)).size).toBeGreaterThan(1);
  });
});

describe('spawnWave', () => {
  it('draws one type per row from the wave pool, one RNG draw each', () => {
    const s = createGame('pool', PRACTICE_RUN);
    let draws = 0;
    const real = s.rngWaves.nextInt.bind(s.rngWaves);
    s.rngWaves.nextInt = ((n: number) => {
      draws += 1;
      return real(n);
    }) as never;
    for (const wave of [1, 2, 3, 4, 5, 9]) {
      const pool = dailyPool(wave);
      draws = 0;
      spawnWave(s, wave);
      const rows = Math.min(2 + wave, 5);
      expect({ wave, draws }).toEqual({ wave, draws: rows + 1 }); // one per row, plus the direction draw
      for (const c of s.crabs) {
        expect(pool).toContain(c.type);
        expect(c.kind).toBe(TYPE_COLOUR[c.type]);
        expect(c.hp).toBe(CRAB_TYPES[c.type].hp);
      }
      // A row is one type all the way across.
      for (const y of new Set(s.crabs.map((c) => c.y))) {
        expect(new Set(s.crabs.filter((c) => c.y === y).map((c) => c.type)).size).toBe(1);
      }
    }
  });

  it('grows from 3 to 5 rows of 6 crabs', () => {
    const s = createGame('t', PRACTICE_RUN);
    spawnWave(s, 2);
    expect(s.crabs).toHaveLength(24);
    spawnWave(s, 3);
    expect(s.crabs).toHaveLength(30);
    spawnWave(s, 9);
    expect(s.crabs).toHaveLength(30);
    expect(s).toMatchObject({ wave: 9, waveTotal: 30 });
  });
});
