import { describe, expect, it } from 'vitest';
import {
  ALL_KINDS, CRAB, FIELD_W, FORMATIONS, INITIAL_INPUT, LEVELS, REEF_KINDS, REEF_ROSTERS, REFORM_TARGET,
  createGame, dailyPool, formationPositions, kindForTier, levelById, levelSeed, startLevelWave, step,
  type CrabType, type Formation,
} from '../src';

/** The level table of spec §2, transcribed here so a table edit has to be deliberate. */
const TABLE: ReadonlyArray<readonly [number, number, Formation]> = [
  [1, 2, 'classic'], [2, 2, 'fish'], [3, 3, 'diamond'], [4, 3, 'jellyfish'], [5, 4, 'wreck'],
  [7, 3, 'classic'], [8, 3, 'shell'], [9, 3, 'fish'], [10, 4, 'ring'], [11, 4, 'octopus'],
  [13, 3, 'diamond'], [14, 4, 'classic'], [15, 4, 'wreck'], [16, 4, 'jellyfish'], [17, 5, 'ring'],
  [19, 4, 'fish'], [20, 4, 'shell'], [21, 4, 'octopus'], [22, 5, 'wreck'], [23, 5, 'classic'],
  [25, 4, 'jellyfish'], [26, 5, 'shell'], [27, 5, 'diamond'], [28, 5, 'octopus'], [29, 5, 'wreck'],
];

/** The reefs 6-10 chain table of spec §4, transcribed here the same way. */
const REEF_TABLE: ReadonlyArray<readonly [number, number, Formation]> = [
  [31, 4, 'wreck'], [32, 5, 'manta'], [33, 5, 'whirlpool'], [34, 5, 'shell'], [35, 5, 'wreck'],
  [37, 4, 'trident'], [38, 5, 'diamond'], [39, 5, 'manta'], [40, 5, 'classic'], [41, 5, 'jellyfish'],
  [43, 4, 'diamond'], [44, 5, 'diamond'], [45, 5, 'anchor'], [46, 5, 'ring'], [47, 5, 'classic'],
  [49, 4, 'fish'], [50, 5, 'shell'], [51, 5, 'shell'], [52, 5, 'crown'], [53, 5, 'octopus'],
  [55, 4, 'anchor'], [56, 5, 'anchor'], [57, 5, 'claws'], [58, 5, 'trident'], [59, 5, 'manta'],
];

const campaign = (id: number) => ({
  mode: 'campaign' as const, level: levelById(id), lives: 5, features: { boosts: false }, octopi: 'base' as const,
});

describe('LEVELS', () => {
  it('has 60 contiguous rows, 10 reefs of 6, bosses on every sixth', () => {
    expect(LEVELS.map((l) => l.id)).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
    for (const l of LEVELS) {
      expect(l.reef).toBe(Math.floor((l.id - 1) / 6) + 1);
      expect(l.index).toBe(((l.id - 1) % 6) + 1);
      const indexOffset = l.boss ? 0 : l.index - 1;
      // Controller ruling R36: reefs 1-5 keep the first campaign's own offset formula, reefs 6-10
      // use the second campaign's.
      if (l.reef <= 5) {
        expect(l.speedOffset).toBe(3 * (l.reef - 1) + indexOffset);
        expect(l.fireOffset).toBe(8 * (l.reef - 1) + 3 * indexOffset);
      } else {
        expect(l.speedOffset).toBe(14 + 2 * (l.reef - 6) + indexOffset);
        expect(l.fireOffset).toBe(40 + 5 * (l.reef - 6) + 2 * indexOffset);
      }
      if (l.index === 6) expect(l).toMatchObject({ waves: 0, boss: l.reef });
      else expect(l.waves).toBeGreaterThan(0);
    }
  });

  it('gives no boss level a wave, so a boss round is only ever a boss and its squads', () => {
    // `marchCrabs` hands the whole tick to `marchSquads` as soon as a squad stands, on the strength
    // of a boss round never carrying a wave (spec §5.1). Were a boss level ever given waves, wave
    // crabs and squad crabs would share `s.crabs`, the wave would stop marching and its invasion
    // check would stop running — a silent hang rather than a crash. This pins the premise as data:
    // the day someone gives a boss level a wave, this fails instead of the game.
    const bossLevels = LEVELS.filter((l) => l.boss !== undefined);
    expect(bossLevels.length).toBeGreaterThan(0);
    for (const l of bossLevels) expect({ id: l.id, waves: l.waves }).toEqual({ id: l.id, waves: 0 });
  });

  it('matches the waves and formation of the spec table row for row', () => {
    for (const [id, waves, formation] of TABLE) {
      expect({ id, waves: levelById(id).waves, formation: levelById(id).formation }).toEqual({ id, waves, formation });
    }
    expect(TABLE).toHaveLength(25); // every non-boss row of the first campaign
  });

  it('matches the waves and formation of the reefs 6-10 chain table row for row', () => {
    for (const [id, waves, formation] of REEF_TABLE) {
      expect({ id, waves: levelById(id).waves, formation: levelById(id).formation }).toEqual({ id, waves, formation });
    }
    expect(REEF_TABLE).toHaveLength(25); // every non-boss row of reefs 6-10
  });

  it('never decreases wave count within a reef', () => {
    for (let r = 1; r <= 10; r++) {
      const w = LEVELS.filter((l) => l.reef === r && l.index < 6).map((l) => l.waves);
      for (let i = 1; i < w.length; i++) expect(w[i]).toBeGreaterThanOrEqual(w[i - 1]!);
    }
  });

  it("lists reefs 1-5's kinds in tier order: the first `reef` of normal, armored, swift, heavy, elder", () => {
    expect(REEF_KINDS).toEqual(['normal', 'armored', 'swift', 'heavy', 'elder']);
    for (const l of LEVELS.filter((l) => l.reef <= 5)) expect(l.kinds).toEqual(REEF_KINDS.slice(0, l.reef));
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

describe('REEF_ROSTERS', () => {
  it('matches the tier table of spec §4, tier 0 (bottom) through tier 4 (top)', () => {
    expect(REEF_ROSTERS[6]).toEqual(['normal', 'armored', 'heavy', 'elder', 'warden']);
    expect(REEF_ROSTERS[7]).toEqual(['armored', 'swift', 'elder', 'warden', 'herald']);
    expect(REEF_ROSTERS[8]).toEqual(['armored', 'heavy', 'warden', 'herald', 'bubbler']);
    expect(REEF_ROSTERS[9]).toEqual(['swift', 'elder', 'warden', 'bubbler', 'bombardier']);
    expect(REEF_ROSTERS[10]).toEqual(['elder', 'warden', 'herald', 'bombardier', 'patriarch']);
  });

  it('every reef 6-10 level fields its own reef roster as `kinds`', () => {
    for (const l of LEVELS.filter((l) => l.reef >= 6)) {
      expect(l.kinds).toEqual(REEF_ROSTERS[l.reef as 6 | 7 | 8 | 9 | 10]);
    }
  });
});

describe('the intro-level rule (spec §4)', () => {
  const introIds = [31, 37, 43, 49, 55];
  /** The previous reef's roster for each reef 6-10's first level: reef 5's own pool for reef 6, then each reef's own roster for the next. */
  const prevFor: Readonly<Record<number, readonly CrabType[]>> = {
    31: REEF_KINDS, 37: REEF_ROSTERS[6], 43: REEF_ROSTERS[7], 49: REEF_ROSTERS[8], 55: REEF_ROSTERS[9],
  };

  it("waves 1 and 3 carry the previous reef's roster, waves 2 and 4 the reef's own", () => {
    for (const id of introIds) {
      const l = levelById(id);
      const own = REEF_ROSTERS[l.reef as 6 | 7 | 8 | 9 | 10];
      const prev = prevFor[id]!;
      expect(l.rosters).toEqual([prev, own, prev, own]);
    }
  });

  it('every other reef 6-10 row leaves `rosters` undefined, so every wave falls back to `kinds`', () => {
    for (const l of LEVELS.filter((l) => l.reef >= 6 && !introIds.includes(l.id))) {
      expect(l.rosters).toBeUndefined();
    }
  });

  it("level 31's wave 1 fields no veteran and wave 2 fields a warden (R42)", () => {
    const VETERANS: readonly CrabType[] = ['warden', 'herald', 'bubbler', 'bombardier', 'patriarch'];
    const s = createGame(levelSeed('golden', 31), campaign(31));
    expect(s.wave).toBe(1);
    expect(s.crabs.some((c) => VETERANS.includes(c.type))).toBe(false);
    s.crabs = []; // force the wave clear, as the other tests in this file do
    step(s, INITIAL_INPUT);
    expect(s.wave).toBe(2);
    expect(s.crabs.some((c) => c.type === 'warden')).toBe(true);
  });
});

describe('boss rows 36/42/48/54/60', () => {
  it('carry the roster of their own reef, no waves, and the matching boss kind', () => {
    const table: ReadonlyArray<readonly [number, 6 | 7 | 8 | 9 | 10]> = [
      [36, 6], [42, 7], [48, 8], [54, 9], [60, 10],
    ];
    for (const [id, kind] of table) {
      const l = levelById(id);
      expect(l).toMatchObject({ waves: 0, boss: kind, kinds: REEF_ROSTERS[kind] });
    }
  });

  it('spawns the boss of its own kind the instant the level starts (R42)', () => {
    const s = createGame(levelSeed('golden', 60), campaign(60));
    expect(s.boss?.kind).toBe(10);
  });
});

/** The nine new silhouettes reefs 6-10 add, minus `spearhead` (never a chain entry): spec §4. */
const NEW_SHAPES: readonly Formation[] = ['trident', 'anchor', 'turtle', 'crown', 'starfish', 'whirlpool', 'claws', 'manta'];

/** The three living silhouettes among the new shapes (spec §3). */
const LIVING_SHAPES: readonly Formation[] = ['whirlpool', 'claws', 'manta'];

describe('reefs 6-10 chain rules (spec §4, test not generation)', () => {
  const reefLevels = LEVELS.filter((l) => l.reef >= 6 && !l.boss);

  it('lists at least two of the new shapes per level', () => {
    for (const l of reefLevels) {
      const count = l.formations.filter((f) => NEW_SHAPES.includes(f)).length;
      expect(count, `level ${l.id}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('never opens a reef with a living formation, and carries at least one from wave 3 on', () => {
    for (const l of reefLevels) {
      const livingIdx = l.formations
        .map((f, i) => (LIVING_SHAPES.includes(f) ? i : -1))
        .filter((i) => i >= 0);
      if (l.index === 1) expect(livingIdx, `level ${l.id}`).toHaveLength(0);
      if (l.index >= 3) expect(livingIdx.length, `level ${l.id}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('caps living formations at one per level on reefs 6-7 and two, never adjacent, on reefs 8-10', () => {
    for (const l of reefLevels) {
      const livingIdx = l.formations
        .map((f, i) => (LIVING_SHAPES.includes(f) ? i : -1))
        .filter((i) => i >= 0);
      const cap = l.reef <= 7 ? 1 : 2;
      expect(livingIdx.length, `level ${l.id}`).toBeLessThanOrEqual(cap);
      for (let k = 1; k < livingIdx.length; k++) {
        expect(livingIdx[k]! - livingIdx[k - 1]!, `level ${l.id}`).toBeGreaterThan(1);
      }
    }
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

  it('gives a reefs 6-10 roster one kind per tier too (five kinds, the identity row)', () => {
    expect([0, 1, 2, 3, 4].map((t) => kindForTier(REEF_ROSTERS[8], t))).toEqual(REEF_ROSTERS[8]);
  });
});

describe('dailyPool', () => {
  it('widens by one kind per wave and stops at all five legacy kinds (unchanged through wave 5)', () => {
    expect(dailyPool(1)).toEqual(['normal']);
    expect(dailyPool(2)).toEqual(['normal', 'armored']);
    expect(dailyPool(3)).toEqual(['normal', 'armored', 'swift']);
    expect(dailyPool(4)).toEqual(['normal', 'armored', 'swift', 'heavy']);
    expect(dailyPool(5)).toEqual(REEF_KINDS);
  });

  it('keeps growing one veteran per wave from 6 to 10, then stops at all ten kinds (spec §6)', () => {
    expect(dailyPool(6)).toEqual([...REEF_KINDS, 'warden']);
    expect(dailyPool(7)).toEqual([...REEF_KINDS, 'warden', 'herald']);
    expect(dailyPool(8)).toEqual([...REEF_KINDS, 'warden', 'herald', 'bubbler']);
    expect(dailyPool(9)).toEqual([...REEF_KINDS, 'warden', 'herald', 'bubbler', 'bombardier']);
    expect(dailyPool(10)).toEqual(ALL_KINDS);
    expect(dailyPool(20)).toEqual(ALL_KINDS);
  });
});
