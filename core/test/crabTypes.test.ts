import { describe, expect, it } from 'vitest';
import {
  CRAB_TYPES, PRACTICE_RUN, REEF_KINDS, TYPE_COLOUR, TYPE_INDEX, createGame, crabSpeed, hashState, hitCrabs,
  hitOctopi, kindForTier, levelById, marchCrabs, marchSteps, spawnFormation, spawnWave, type Crab, type CrabType,
} from '../src';

/**
 * A crab of `type` at its spawn hp and colour, the way `spawnCrab` (game.ts) builds one: every
 * veteran field neutral except a warden's shield, which starts up (spec §2's rune shield).
 */
function crab(type: CrabType, x = 2812, y = 1500): Crab {
  return {
    x, y, kind: TYPE_COLOUR[type], type, hp: CRAB_TYPES[type].hp,
    slot: -1, shield: type === 'warden' ? 1 : 0, shieldTimer: 0, rallies: 0, rallyTimer: 0, squad: 0,
  };
}

/** A practice game holding a single crab of `type`. */
function game(type: CrabType) {
  const s = createGame('t', PRACTICE_RUN);
  s.crabs = [crab(type)];
  s.waveTotal = 1;
  return s;
}

/** Fires one point-blank player shot into `s.crabs[0]`. */
function shoot(s: ReturnType<typeof game>): void {
  const c = s.crabs[0]!;
  s.shots.push({ x: c.x, y: c.y, vx: 0, vy: 0, kind: 'straight', data: 0 });
  hitCrabs(s);
}

describe('crab kinds', () => {
  it('holds the hp and points of the spec table, legacy kinds and veterans alike', () => {
    expect(CRAB_TYPES).toEqual({
      normal: { hp: 1, points: 10 },
      armored: { hp: 2, points: 25 },
      swift: { hp: 1, points: 15 },
      heavy: { hp: 1, points: 20 },
      elder: { hp: 3, points: 40 },
      warden: { hp: 2, points: 35 },
      herald: { hp: 3, points: 50 },
      bubbler: { hp: 2, points: 45 },
      bombardier: { hp: 2, points: 60 },
      patriarch: { hp: 5, points: 100 },
    });
  });

  it('keeps the legacy indices/colours 0..4 and appends the veterans at 5..9', () => {
    expect(TYPE_INDEX).toEqual({
      normal: 0, armored: 1, swift: 2, heavy: 3, elder: 4,
      warden: 5, herald: 6, bubbler: 7, bombardier: 8, patriarch: 9,
    });
    expect(TYPE_COLOUR).toEqual({
      normal: 0, armored: 1, swift: 4, heavy: 3, elder: 2,
      warden: 5, herald: 6, bubbler: 7, bombardier: 8, patriarch: 9,
    });
  });

  it('armored takes two hits and scores 25', () => {
    const s = game('armored');
    const c = s.crabs[0]!;
    shoot(s);
    expect(s.crabs).toHaveLength(1);
    expect(c.hp).toBe(1);
    shoot(s);
    expect(s.crabs).toHaveLength(0);
    expect(s.score).toBe(CRAB_TYPES.armored.points * s.wave);
  });

  it('elder takes three hits and scores 40', () => {
    const s = game('elder');
    const c = s.crabs[0]!;
    shoot(s);
    expect(c.hp).toBe(2);
    shoot(s);
    expect(c.hp).toBe(1);
    expect(s.crabs).toHaveLength(1);
    shoot(s);
    expect(s.crabs).toHaveLength(0);
    expect(s.score).toBe(CRAB_TYPES.elder.points * s.wave);
  });

  it('marches every kind at the shared formation step: swift has no extra step any more', () => {
    const steps = REEF_KINDS.map((type) => {
      const s = game(type);
      s.dir = 1;
      const x0 = s.crabs[0]!.x;
      const v = crabSpeed(s);
      marchCrabs(s);
      return { type, moved: s.crabs[0]!.x - x0, v };
    });
    for (const { type, moved, v } of steps) expect({ type, moved }).toEqual({ type, moved: v });
    expect(new Set(steps.map((x) => x.moved)).size).toBe(1);
  });

  it('never lets a crab leave its row: no dives, whatever the kind or the tick', () => {
    const s = game('elder');
    s.dir = 1;
    const x0 = s.crabs[0]!.x;
    const y0 = s.crabs[0]!.y;
    const v = crabSpeed(s);
    let marched = 0;
    for (let i = 0; i < 400; i++) { // well past the 360-tick dive interval the elder used to have
      s.tick += 1;
      marched += marchSteps(s.tick);
      marchCrabs(s);
    }
    expect(s.crabs[0]!.y).toBe(y0); // never dropped out of formation, never hit a wall
    expect(s.crabs[0]!.x).toBe(x0 + marched * v);
  });

  it('carries no dive state on a crab, only hp and the veteran fields spec §7 adds', () => {
    const s = createGame('t', PRACTICE_RUN);
    expect(Object.keys(s.crabs[0]!)).toEqual(['x', 'y', 'kind', 'type', 'hp', 'slot', 'shield', 'shieldTimer', 'rallies', 'rallyTimer', 'squad']);
  });

  it('spawns every legacy-kind crab with the veteran fields at their neutral values', () => {
    const s = createGame('t', PRACTICE_RUN);
    spawnWave(s, 5); // the widest daily/practice pool: all five legacy kinds can come up
    expect(s.crabs.length).toBeGreaterThan(0);
    for (const c of s.crabs) {
      expect(c).toMatchObject({ slot: -1, shield: 0, shieldTimer: 0, rallies: 0, rallyTimer: 0, squad: 0 });
    }
    const l = levelById(25); // reef 5: all five legacy kinds, one per tier
    spawnFormation(s, { formation: l.formation, kinds: l.kinds });
    // A campaign wave takes its formation slot (spec §3); every other veteran field stays neutral.
    s.crabs.forEach((c, i) => {
      expect(c).toMatchObject({ slot: i, shield: 0, shieldTimer: 0, rallies: 0, rallyTimer: 0, squad: 0 });
    });
  });

  it('gives a spawned warden its shield up; every other veteran field stays neutral', () => {
    const s = createGame('t', PRACTICE_RUN);
    spawnFormation(s, { formation: 'classic', kinds: ['warden'] });
    expect(s.crabs.length).toBeGreaterThan(0);
    s.crabs.forEach((c, i) => {
      expect(c).toMatchObject({ type: 'warden', slot: i, shield: 1, shieldTimer: 0, rallies: 0, rallyTimer: 0, squad: 0 });
    });
  });

  it('costs a life when a crab touches Octopi, whatever its kind', () => {
    for (const type of REEF_KINDS) {
      const s = game(type);
      s.crabs[0]!.x = s.octopi.x;
      s.crabs[0]!.y = s.octopi.y;
      hitOctopi(s);
      expect({ type, lives: s.octopi.lives, left: s.crabs.length }).toEqual({ type, lives: 2, left: 0 });
    }
  });
});

describe('spawnFormation', () => {
  it('draws exactly one direction draw and no colours', () => {
    const s = createGame('t', PRACTICE_RUN);
    let calls = 0;
    const real = s.rngWaves.nextInt.bind(s.rngWaves);
    s.rngWaves.nextInt = ((n: number) => {
      calls += 1;
      return real(n);
    }) as never;
    spawnFormation(s, { formation: 'jellyfish', kinds: REEF_KINDS });
    expect(calls).toBe(1);
    expect([1, -1]).toContain(s.dir);
  });

  it("turns each cell's tier into the reef pool's kind, with that kind's colour and hp", () => {
    // Reef 5 gives tier and kind one for one. Level 25 is `jellyfish`, a template that uses all
    // five tiers, so every kind of the pool appears in the wave.
    const l = levelById(25); // reef 5, jellyfish: one kind per tier, all five tiers used
    const s = createGame('t', PRACTICE_RUN);
    spawnFormation(s, { formation: l.formation, kinds: l.kinds });
    expect(s.waveTotal).toBe(s.crabs.length);
    for (const c of s.crabs) {
      expect(c.kind).toBe(TYPE_COLOUR[c.type]);
      expect(c.hp).toBe(CRAB_TYPES[c.type].hp);
    }
    expect(new Set(s.crabs.map((c) => c.type))).toEqual(new Set(REEF_KINDS));
  });

  it('fills a reef-2 formation with the first two kinds only', () => {
    const l = levelById(7); // reef 2
    const s = createGame('t', PRACTICE_RUN);
    spawnFormation(s, { formation: l.formation, kinds: l.kinds });
    expect(new Set(s.crabs.map((c) => c.type))).toEqual(new Set(['normal', 'armored']));
    expect(kindForTier(l.kinds, 0)).toBe('normal');
    expect(kindForTier(l.kinds, 4)).toBe('armored');
  });
});

describe('hashState', () => {
  it('is sensitive to every veteran field appended after hp (spec §7 ruling)', () => {
    const base = () => createGame('hash-veteran', PRACTICE_RUN);
    const s0 = base();
    const same = base();
    expect(hashState(s0)).toBe(hashState(same)); // same seed, same state: same hash

    for (const field of ['slot', 'shield', 'shieldTimer', 'rallies', 'rallyTimer', 'squad'] as const) {
      const s = base();
      const before = hashState(s);
      if (field === 'shield') s.crabs[0]!.shield = 1;
      else s.crabs[0]![field] = 1;
      expect({ field, changed: hashState(s) !== before }).toEqual({ field, changed: true });
    }
  });
});
