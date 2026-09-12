import { describe, expect, it } from 'vitest';
import { CRAB, FIELD_W, INITIAL_INPUT, PRACTICE_RUN, createGame, spawnWave } from '../src';

describe('createGame', () => {
  it('starts with the ship at the bottom centre and wave 1', () => {
    const s = createGame('t', PRACTICE_RUN);
    expect(INITIAL_INPUT).toEqual({ x: 2812, y: 9650 });
    expect(s.ship).toEqual({ x: 2812, y: 9650, cooldown: 8, invuln: 0, lives: 3 });
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

  it('spawns crabs with the new campaign fields at their scaffold defaults', () => {
    const s = createGame('t', PRACTICE_RUN);
    for (const c of s.crabs) {
      expect(c).toMatchObject({ type: 'normal', hp: 1, dive: 0, homeX: c.x, homeY: c.y });
    }
  });

  it('is deterministic per seed and varies across seeds', () => {
    const kinds = (seed: string) => createGame(seed, PRACTICE_RUN).crabs.map((c) => c.kind).join('');
    expect(kinds('a')).toBe(kinds('a'));
    expect(new Set(['a', 'b', 'c', 'd', 'e', 'f'].map(kinds)).size).toBeGreaterThan(1);
  });
});

describe('spawnWave', () => {
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
