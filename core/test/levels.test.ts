import { describe, expect, it } from 'vitest';
import {
  CRAB, FIELD_W, FORMATIONS, INITIAL_INPUT, LEVELS, REEF_KINDS, REFORM_TARGET, createGame, dailyPool,
  formationPositions, kindForTier, levelById, levelSeed, startLevelWave, step, type CrabType,
  type Formation,
} from '../src';

/** The level table of spec §2, transcribed here so a table edit has to be deliberate. */
const TABLE: ReadonlyArray<readonly [number, number, Formation]> = [
  [1, 2, 'classic'], [2, 2, 'fish'], [3, 3, 'diamond'], [4, 3, 'jellyfish'], [5, 4, 'wreck'],
  [7, 3, 'classic'], [8, 3, 'shell'], [9, 3, 'fish'], [10, 4, 'ring'], [11, 4, 'octopus'],
  [13, 3, 'diamond'], [14, 4, 'classic'], [15, 4, 'wreck'], [16, 4, 'jellyfish'], [17, 5, 'ring'],
  [19, 4, 'fish'], [20, 4, 'shell'], [21, 4, 'octopus'], [22, 5, 'wreck'], [23, 5, 'classic'],
  [25, 4, 'jellyfish'], [26, 5, 'shell'], [27, 5, 'diamond'], [28, 5, 'octopus'], [29, 5, 'wreck'],
];

const campaign = (id: number) => ({
  mode: 'campaign' as const, level: levelById(id), lives: 5, features: { boosts: false }, octopi: 'base' as const,
});

describe('LEVELS', () => {
  it('has 30 contiguous rows, 5 reefs of 6, bosses on every sixth', () => {
    expect(LEVELS.map((l) => l.id)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    for (const l of LEVELS) {
      expect(l.reef).toBe(Math.floor((l.id - 1) / 6) + 1);
      expect(l.index).toBe(((l.id - 1) % 6) + 1);
      const indexOffset = l.boss ? 0 : l.index - 1;
      expect(l.speedOffset).toBe(3 * (l.reef - 1) + indexOffset);
      expect(l.fireOffset).toBe(8 * (l.reef - 1) + 3 * indexOffset);
      if (l.index === 6) expect(l).toMatchObject({ waves: 0, boss: l.reef });
      else expect(l.waves).toBeGreaterThan(0);
    }
  });

  it('matches the waves and formation of the spec table row for row', () => {
    for (const [id, waves, formation] of TABLE) {
      expect({ id, waves: levelById(id).waves, formation: levelById(id).formation }).toEqual({ id, waves, formation });
    }
    expect(TABLE).toHaveLength(25); // every non-boss row
  });

  it('never decreases wave count within a reef', () => {
    for (let r = 1; r <= 5; r++) {
      const w = LEVELS.filter((l) => l.reef === r && l.index < 6).map((l) => l.waves);
      for (let i = 1; i < w.length; i++) expect(w[i]).toBeGreaterThanOrEqual(w[i - 1]!);
    }
  });

  it("lists the reef's kinds in tier order: the first `reef` of normal, armored, swift, heavy, elder", () => {
    expect(REEF_KINDS).toEqual(['normal', 'armored', 'swift', 'heavy', 'elder']);
    for (const l of LEVELS) expect(l.kinds).toEqual(REEF_KINDS.slice(0, l.reef));
  });

  it('every non-boss level spawns inside the field', () => {
    for (const l of LEVELS.filter((l) => !l.boss)) {
      const s = createGame(levelSeed('run', l.id), campaign(l.id));
      for (const c of s.crabs) expect(c.x - CRAB.size / 2 >= 0 && c.x + CRAB.size / 2 <= FIELD_W).toBe(true);
    }
  });

  it('chains a distinct silhouette per wave, headline first, neighbours never alike', () => {
    for (const l of LEVELS.filter((l) => !l.boss)) {
      expect(l.formations).toHaveLength(l.waves);
      expect(l.formations[0]).toBe(l.formation);
      expect(new Set(l.formations).size).toBe(l.waves);
      for (let k = 1; k < l.formations.length; k++) expect(l.formations[k]).not.toBe(l.formations[k - 1]);
    }
  });

  it('chains only silhouettes a wave may take, never the reform target', () => {
    for (const l of LEVELS) {
      for (const f of l.formations) expect({ id: l.id, chainable: FORMATIONS.includes(f) }).toEqual({ id: l.id, chainable: true });
      expect({ id: l.id, target: l.formations.includes(REFORM_TARGET) }).toEqual({ id: l.id, target: false });
    }
  });

  it("spawns each wave's own silhouette, with that silhouette's crab count", () => {
    for (const l of LEVELS.filter((l) => !l.boss)) {
      const s = createGame(levelSeed('run', l.id), campaign(l.id));
      for (let wave = 1; wave <= l.waves; wave++) {
        startLevelWave(s, wave);
        const expected = formationPositions(l.formations[wave - 1]!).length;
        expect({ id: l.id, wave, count: s.crabs.length }).toEqual({ id: l.id, wave, count: expected });
      }
    }
  });

  it('clears a level after its last wave and stops stepping', () => {
    const l = levelById(1);
    const s = createGame('x', campaign(1));
    s.wave = l.waves; // force the last wave, regardless of the table's actual wave count
    s.crabs = [];
    step(s, INITIAL_INPUT);
    expect(s.cleared).toBe(true);
    expect(s.events.at(-1)).toMatchObject({ type: 'level_cleared' });
    const tick = s.tick;
    step(s, INITIAL_INPUT);
    expect(s.tick).toBe(tick);
  });

  it('advances waves inside a level', () => {
    const s = createGame('x', campaign(4)); // 3 waves
    expect(s.wave).toBe(1);
    s.crabs = [];
    step(s, INITIAL_INPUT);
    expect(s.wave).toBe(2);
    expect(s.cleared).toBe(false);
  });
});

describe('kindForTier', () => {
  /**
   * Expected kind index per tier 0..4, one row per pool size n = 1..5 (spec §2, amended
   * 2026-09-17). The n = 4 row ends 3, 3: reef 4 fields red crabs on both of its top tiers.
   */
  const EXPECTED: ReadonlyArray<readonly number[]> = [
    [0, 0, 0, 0, 0],
    [0, 0, 1, 1, 1],
    [0, 1, 1, 2, 2],
    [0, 1, 2, 3, 3],
    [0, 1, 2, 3, 4],
  ];

  it('spreads the pool over the tiers by the spec table, for every pool size', () => {
    for (let n = 1; n <= 5; n++) {
      const pool = REEF_KINDS.slice(0, n);
      const got = [0, 1, 2, 3, 4].map((t) => pool.indexOf(kindForTier(pool, t)));
      expect({ n, got }).toEqual({ n, got: EXPECTED[n - 1] });
    }
  });

  it('gives reef 5 one kind per tier and reef 1 nothing but green', () => {
    const k5 = REEF_KINDS.slice(0, 5);
    expect([0, 1, 2, 3, 4].map((t) => kindForTier(k5, t))).toEqual(REEF_KINDS);
    expect([0, 1, 2, 3, 4].map((t) => kindForTier(['normal'], t))).toEqual(Array<CrabType>(5).fill('normal'));
  });
});

describe('dailyPool', () => {
  it('widens by one kind per wave and stops at all five', () => {
    expect(dailyPool(1)).toEqual(['normal']);
    expect(dailyPool(2)).toEqual(['normal', 'armored']);
    expect(dailyPool(3)).toEqual(['normal', 'armored', 'swift']);
    expect(dailyPool(4)).toEqual(['normal', 'armored', 'swift', 'heavy']);
    expect(dailyPool(5)).toEqual(REEF_KINDS);
    expect(dailyPool(9)).toEqual(REEF_KINDS);
  });
});
