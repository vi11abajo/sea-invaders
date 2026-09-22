import { describe, expect, it } from 'vitest';
import {
  AIM_STRIDE, BOSS, BOSS_TABLE, FIELD_W, INITIAL_INPUT, LANE_STRIDE, OBSTACLE_INDEX,
  OBSTACLE_STRIDE, OCTOPI, PRACTICE_RUN, REEF_KINDS, SQUAD_BAND, bossStats, createGame, hashState,
  idiv, isTableBoss, moveOctopi, raiseObstacle, snapshot, spawnBoss, spawnSquad, step,
} from '../src';
import type { BossKind, GameState, Rng } from '../src';

function arena(kind: BossKind = 1, lives = PRACTICE_RUN.lives): GameState {
  const s = createGame('boss-table', { ...PRACTICE_RUN, lives, features: { boosts: false } });
  s.crabs = [];
  spawnBoss(s, kind);
  return s;
}

const LEGACY = [1, 2, 3, 4, 5] as const;
const NEW = [6, 7, 8, 9, 10] as const;
/** The bosses of reefs 6-10 whose own task has not run yet, so their hooks still throw. */
const UNWRITTEN = [9, 10] as const;

describe('the boss table', () => {
  it('holds the five new bosses of spec 5', () => {
    expect(BOSS_TABLE).toEqual({
      6: { hp: 700, phases: 2, score: 12000 },
      7: { hp: 800, phases: 3, score: 14000 },
      8: { hp: 900, phases: 3, score: 16000 },
      9: { hp: 1000, phases: 4, score: 18000 },
      10: { hp: 1200, phases: 4, score: 20000 },
    });
  });

  it('names only kinds 6 to 10 as table bosses', () => {
    for (const k of LEGACY) expect(isTableBoss(k)).toBe(false);
    for (const k of NEW) expect(isTableBoss(k)).toBe(true);
  });

  it('keeps the legacy formulas for kinds 1 to 5', () => {
    for (const k of LEGACY) {
      expect(bossStats(k)).toEqual({
        hp: BOSS.baseHp + BOSS.hpStep * (k - 1),
        phases: k,
        score: BOSS.scoreBase * k,
      });
    }
  });

  it('reads the table for kinds 6 to 10', () => {
    for (const k of NEW) expect(bossStats(k)).toEqual(BOSS_TABLE[k]);
  });

  it('refuses to start a fight with a boss whose hooks are not written yet', () => {
    // Kinds 6-8 have their own hooks now (`bosses/templar.ts`, `castellan.ts`, `corsair.ts`, spec
    // §5.2 rows 6-8); 9 and 10 are still stubs, one task each, and a fight with one has to fail
    // loudly rather than run half a boss.
    for (const k of UNWRITTEN) {
      const s = createGame('stub', { ...PRACTICE_RUN, features: { boosts: false } });
      expect(() => spawnBoss(s, k)).toThrow(/not implemented yet/);
    }
  });
});

describe('the new boss state fields', () => {
  it('spawns every boss of the first campaign with them all neutral', () => {
    for (const k of LEGACY) {
      expect(arena(k).boss).toMatchObject({
        shieldUp: 0, windup: 0, gapSlot: 0, aimX: 0, aimTicks: 0, burst: 0, discharged: 0,
      });
      expect(arena(k).boss!.mirror).toEqual([0, 0, 0]);
    }
  });

  it('stays neutral through a fought-out round of the first campaign', () => {
    const s = arena(3);
    for (let t = 0; t < 900; t++) step(s, INITIAL_INPUT);
    if (s.boss) {
      expect(s.boss).toMatchObject({ shieldUp: 0, windup: 0, gapSlot: 0, aimX: 0, aimTicks: 0, burst: 0, discharged: 0 });
      expect(s.boss.mirror).toEqual([0, 0, 0]);
    }
    expect(s.squads).toEqual([]);
    expect(s.obstacles).toEqual([]);
    expect(s.destroyedObstacles).toEqual([]);
    expect(s.lanes).toEqual([]);
    expect(s.aims).toEqual([]);
    expect(s.chillTicks).toBe(0);
  });
});

describe('the cold snap', () => {
  it('scales Octopi maximum step by two thirds on both axes while it runs', () => {
    const slow = idiv(OCTOPI.maxStep * 2, 3);
    const s = arena();
    s.octopi.x = 1000;
    s.octopi.y = OCTOPI.minY + 1000;
    s.chillTicks = 3;
    moveOctopi(s, { x: FIELD_W, y: OCTOPI.maxY });
    expect(s.octopi.x).toBe(1000 + slow);
    expect(s.octopi.y).toBe(OCTOPI.minY + 1000 + slow);
    expect(s.chillTicks).toBe(2);
  });

  it('lets Octopi move at full speed again once it runs out', () => {
    const s = arena();
    s.octopi.x = 1000;
    s.chillTicks = 1;
    moveOctopi(s, { x: FIELD_W, y: s.octopi.y });
    expect(s.chillTicks).toBe(0);
    const x = s.octopi.x;
    moveOctopi(s, { x: FIELD_W, y: s.octopi.y });
    expect(s.octopi.x).toBe(x + OCTOPI.maxStep);
    expect(s.chillTicks).toBe(0); // never below zero
  });

  it('counts down once per tick inside step', () => {
    const s = arena();
    s.chillTicks = 10;
    for (let t = 0; t < 4; t++) step(s, INITIAL_INPUT);
    expect(s.chillTicks).toBe(6);
  });
});

describe('the view frame', () => {
  it('carries the new arrays empty and the new boss flags at zero on a legacy fight', () => {
    const f = snapshot(arena());
    expect(f.obstacles).toEqual([]);
    expect(f.lanes).toEqual([]);
    expect(f.aim).toEqual([]);
    expect(f.chill).toBe(0);
    expect(f.boss).toMatchObject({ shieldUp: 0, reflecting: 0, discharged: 0, gapSlot: 0 });
  });

  it('packs each obstacle into its stride', () => {
    const s = arena();
    raiseObstacle(s, 'crystal', 2000, 3600, 500, 700, 12);
    const f = snapshot(s);
    expect(OBSTACLE_STRIDE).toBe(6);
    expect(f.obstacles).toEqual([2000, 3600, 500, 700, 12, OBSTACLE_INDEX.crystal]);
  });

  it('copies the lanes, the sight lines and the cold snap straight through', () => {
    const s = arena();
    s.lanes = [2, 45, 5, 30];
    s.aims = [1000, 2000, 3000, 0, 40];
    s.chillTicks = 77;
    const f = snapshot(s);
    expect(LANE_STRIDE).toBe(2);
    expect(AIM_STRIDE).toBe(5);
    expect(f.lanes).toEqual([2, 45, 5, 30]);
    expect(f.aim).toEqual([1000, 2000, 3000, 0, 40]);
    expect(f.chill).toBe(77);
    expect(f.lanes).not.toBe(s.lanes); // a copy, safe to hand to the UI thread
  });

  it('keeps every old field in place', () => {
    const f = snapshot(arena());
    expect(Object.keys(f).slice(0, 14)).toEqual([
      'tick', 'octopi', 'lives', 'crabs', 'shots', 'enemyShots', 'boss', 'drops', 'boosts',
      'shield', 'well', 'arrival', 'scoreDecayPct',
      'obstacles',
    ]);
  });
});

describe('the state hash', () => {
  const mutated = (mutate: (s: GameState) => void): boolean => {
    const before = hashState(arena());
    const s = arena();
    mutate(s);
    return hashState(s) !== before;
  };

  it('covers every piece of new state', () => {
    expect(mutated((s) => spawnSquad(s, 'pair', REEF_KINDS, 2000, SQUAD_BAND.minY, 1))).toBe(true);
    expect(mutated((s) => raiseObstacle(s, 'crystal', 2000, 3600, 500, 700, 12))).toBe(true);
    expect(mutated((s) => { s.lanes = [1, 20]; })).toBe(true);
    expect(mutated((s) => { s.aims = [1, 2, 3, 0, 40]; })).toBe(true);
    expect(mutated((s) => { s.chillTicks = 5; })).toBe(true);
    expect(mutated((s) => { s.boss!.shieldUp = 1; })).toBe(true);
    expect(mutated((s) => { s.boss!.windup = 45; })).toBe(true);
    expect(mutated((s) => { s.boss!.gapSlot = 4; })).toBe(true);
    expect(mutated((s) => { s.boss!.aimX = 900; })).toBe(true);
    expect(mutated((s) => { s.boss!.aimTicks = 40; })).toBe(true);
    expect(mutated((s) => { s.boss!.burst = 3; })).toBe(true);
    expect(mutated((s) => { s.boss!.mirror = [0, 300, 0]; })).toBe(true);
    expect(mutated((s) => { s.boss!.discharged = 180; })).toBe(true);
    // Fix round 1, controller ruling R18: a state with one pending destroyed-obstacle entry hashes
    // differently from one without, even though the field is usually empty.
    expect(mutated((s) => { s.destroyedObstacles = [{ x: 2000, y: 3600 }]; })).toBe(true);
  });

  it("covers a squad's own alive count, not just its id and dir (fix round 1, controller ruling R22)", () => {
    const withSquad = (): GameState => {
      const s = arena();
      spawnSquad(s, 'pair', REEF_KINDS, 2000, SQUAD_BAND.minY, 1);
      return s;
    };
    const before = hashState(withSquad());
    const s = withSquad();
    s.squads[0]!.alive -= 1; // everything else about the two states is identical
    expect(hashState(s)).not.toBe(before);
  });
});

/** Counts every draw each of the four generators makes from here on. */
function countDraws(s: GameState): Record<string, number> {
  const counts: Record<string, number> = { waves: 0, fire: 0, boss: 0, boosts: 0 };
  const wrap = (rng: Rng, key: string): void => {
    const inner = rng.nextInt.bind(rng);
    rng.nextInt = (n: number): number => {
      counts[key] = (counts[key] ?? 0) + 1;
      return inner(n);
    };
  };
  wrap(s.rngWaves, 'waves');
  wrap(s.rngFire, 'fire');
  wrap(s.rngBoss, 'boss');
  wrap(s.rngBoosts, 'boosts');
  return counts;
}

describe('the new per-tick work costs a legacy fight nothing', () => {
  it('draws exactly the same numbers with an empty arena as with obstacles, lanes and a cold snap', () => {
    const plain = arena(1, 99);
    const plainCounts = countDraws(plain);
    for (let t = 0; t < 600; t++) step(plain, INITIAL_INPUT);

    const loaded = arena(1, 99);
    const loadedCounts = countDraws(loaded);
    raiseObstacle(loaded, 'crystal', 2000, 3600, 500, 700, 12);
    loaded.lanes = [2, 600];
    loaded.aims = [1000, 2000, 3000, 0, 600];
    loaded.chillTicks = 600;
    for (let t = 0; t < 600; t++) step(loaded, INITIAL_INPUT);

    expect(loadedCounts).toEqual(plainCounts);
    expect(plainCounts['waves']).toBe(0);
    expect(plainCounts['fire']).toBe(0);
    expect(plainCounts['boosts']).toBe(0);
    expect(plainCounts['boss']).toBeGreaterThan(0);
    // The boss's own timers, and nothing else: pinned so a stray draw in the new systems shows up.
    expect(plainCounts['boss']).toBe(BOSS_DRAWS_600);
  });

  it('leaves the boss itself on exactly the same course', () => {
    const plain = arena(1, 99);
    for (let t = 0; t < 600; t++) step(plain, INITIAL_INPUT);
    const loaded = arena(1, 99);
    loaded.lanes = [2, 600];
    loaded.aims = [1000, 2000, 3000, 0, 600];
    for (let t = 0; t < 600; t++) step(loaded, INITIAL_INPUT);
    expect(loaded.boss).toEqual(plain.boss);
  });
});

/**
 * Draws a 600-tick Emerald fight makes from `rngBoss`: its attack, secondary and ability timers
 * rolling over, and nothing else. Pinned so that a stray draw in any of the new systems — squads,
 * arena objects, lanes, the cold snap, the sight lines — shows up as a failure here.
 */
const BOSS_DRAWS_600 = 12;
