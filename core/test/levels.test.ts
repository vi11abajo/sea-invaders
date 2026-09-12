import { describe, expect, it } from 'vitest';
import { CRAB, FIELD_W, LEVELS, createGame, levelById, levelSeed, step, INITIAL_INPUT } from '../src';

describe('LEVELS', () => {
  it('has 30 contiguous rows, 5 reefs of 6, bosses on every sixth', () => {
    expect(LEVELS.map((l) => l.id)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    for (const l of LEVELS) {
      expect(l.reef).toBe(Math.floor((l.id - 1) / 6) + 1);
      expect(l.index).toBe(((l.id - 1) % 6) + 1);
      expect(l.speedOffset).toBe(2 * (l.reef - 1));
      expect(l.fireOffset).toBe(6 * (l.reef - 1));
      if (l.index === 6) expect(l).toMatchObject({ waves: 0, boss: l.reef });
      else expect(l.waves).toBeGreaterThan(0);
    }
  });
  it('never decreases wave count within a reef', () => {
    for (let r = 1; r <= 5; r++) {
      const w = LEVELS.filter((l) => l.reef === r && l.index < 6).map((l) => l.waves);
      for (let i = 1; i < w.length; i++) expect(w[i]).toBeGreaterThanOrEqual(w[i - 1]!);
    }
  });
  it('every non-boss level spawns inside the field', () => {
    for (const l of LEVELS.filter((l) => !l.boss)) {
      const s = createGame(levelSeed('run', l.id), { mode: 'campaign', level: l, lives: 5, features: { boosts: false } });
      for (const c of s.crabs) expect(c.x - CRAB.size / 2 >= 0 && c.x + CRAB.size / 2 <= FIELD_W).toBe(true);
    }
  });
  it('clears a level after its last wave and stops stepping', () => {
    const l = levelById(1);
    const s = createGame('x', { mode: 'campaign', level: l, lives: 5, features: { boosts: false } });
    s.crabs = [];
    step(s, INITIAL_INPUT);
    expect(s.cleared).toBe(true);
    expect(s.events.at(-1)).toMatchObject({ type: 'level_cleared' });
    const tick = s.tick;
    step(s, INITIAL_INPUT);
    expect(s.tick).toBe(tick);
  });
  it('advances waves inside a level with growing rows', () => {
    const l = levelById(4); // 3 waves, 4 rows
    const s = createGame('x', { mode: 'campaign', level: l, lives: 5, features: { boosts: false } });
    expect(s.wave).toBe(1);
    s.crabs = [];
    step(s, INITIAL_INPUT);
    expect(s.wave).toBe(2);
    expect(s.cleared).toBe(false);
  });
});
