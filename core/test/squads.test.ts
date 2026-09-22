import { describe, expect, it } from 'vitest';
import {
  BOSS, CRAB, CRAB_TYPES, DROP, FIELD_W, INITIAL_INPUT, OCTOPI, PRACTICE_RUN, REEF_KINDS, SQUAD_BAND,
  SQUAD_GAP_X, SQUAD_ROW_GAP, SQUAD_TEMPLATES, createGame, damageBoss, fireChance, halvedWhileBoss,
  hitCrabs, idiv, insideField, isHeralded, levelById, marchSquads, marchSteps, popSquads, spawnBoss,
  spawnSquad, squadStep, step, updateEnemyShots, updateVeterans,
} from '../src';
import type { GameState } from '../src';

/** A practice run with the wave cleared away and a kind-1 boss on the field. */
function arena(boosts = false): GameState {
  const s = createGame('squads', { ...PRACTICE_RUN, features: { boosts } });
  s.crabs = [];
  spawnBoss(s, 1);
  return s;
}

/** A real campaign boss round (level 6): no wave was ever spawned, so `wave` and `waveTotal` are 0. */
function bossLevel(): GameState {
  return createGame('boss-level', {
    mode: 'campaign', level: levelById(6), lives: 5, features: { boosts: false }, octopi: 'base',
  });
}

const VETERANS = ['warden', 'herald', 'bubbler', 'bombardier', 'patriarch'] as const;

describe('squad templates and spawning', () => {
  it('lays line4 as one row of four, crew as two rows of four, pair as two and guard5 as five', () => {
    expect(SQUAD_TEMPLATES.line4).toEqual(['1111']);
    expect(SQUAD_TEMPLATES.crew).toEqual(['3333', '1111']);
    expect(SQUAD_TEMPLATES.pair).toEqual(['11']);
    expect(SQUAD_TEMPLATES.guard5).toEqual(['01234']);
  });

  it('seats a line4 on one row, centred on the origin, every crab in the squad and in no slot', () => {
    const s = arena();
    const id = spawnSquad(s, 'line4', REEF_KINDS, idiv(FIELD_W, 2), SQUAD_BAND.minY, 1);
    expect(id).toBe(1);
    expect(s.squads).toEqual([{ id: 1, dir: 1 }]);
    expect(s.crabs).toHaveLength(4);
    for (const c of s.crabs) {
      expect(c.squad).toBe(1);
      expect(c.slot).toBe(-1);
      expect(c.y).toBe(SQUAD_BAND.minY);
    }
    const xs = s.crabs.map((c) => c.x);
    expect(xs[1]! - xs[0]!).toBe(SQUAD_GAP_X);
    expect(xs[3]! - xs[2]!).toBe(SQUAD_GAP_X);
    // Centred: the middle of the outer two crabs is the origin.
    expect(idiv(xs[0]! + xs[3]!, 2)).toBe(idiv(FIELD_W, 2));
  });

  it('reads each cell digit as a tier and picks the kind from the roster by the tier rule', () => {
    const s = arena();
    spawnSquad(s, 'guard5', VETERANS, idiv(FIELD_W, 2), SQUAD_BAND.minY, 1);
    expect(s.crabs.map((c) => c.type)).toEqual([...VETERANS]);
  });

  it('gives each squad crab its own row and column inside the squad grid', () => {
    const s = arena();
    spawnSquad(s, 'crew', REEF_KINDS, idiv(FIELD_W, 2), SQUAD_BAND.minY, 1);
    expect(s.crabs).toHaveLength(8);
    const top = s.crabs.slice(0, 4);
    const bottom = s.crabs.slice(4);
    for (const c of top) expect(c.y).toBe(SQUAD_BAND.minY);
    for (const c of bottom) expect(c.y).toBe(SQUAD_BAND.minY + SQUAD_ROW_GAP);
    expect(top.map((c) => c.cell)).toEqual([0, 1, 2, 3]);
    expect(bottom.map((c) => c.cell)).toEqual([8, 9, 10, 11]);
  });

  it('numbers squads from 1 upwards', () => {
    const s = arena();
    expect(spawnSquad(s, 'pair', REEF_KINDS, 2000, SQUAD_BAND.minY, 1)).toBe(1);
    expect(spawnSquad(s, 'pair', REEF_KINDS, 3000, SQUAD_BAND.minY, -1)).toBe(2);
    expect(s.squads.map((q) => q.dir)).toEqual([1, -1]);
  });
});

describe('the squad band', () => {
  const BOX_BOTTOM = BOSS.top + BOSS.height; // 3660
  const HALF = idiv(CRAB.size, 2);

  it('runs from half a crab below the boss box down to the spec bound (ruling R12)', () => {
    expect(SQUAD_BAND.minY).toBe(BOX_BOTTOM + HALF); // 3925
    expect(SQUAD_BAND.maxY).toBe(BOX_BOTTOM + 300); // 3960
    expect(SQUAD_BAND.minY).toBeLessThan(SQUAD_BAND.maxY);
  });

  it('leaves water between a crew two rows, rather than one solid block', () => {
    expect(SQUAD_ROW_GAP).toBeGreaterThan(CRAB.size);
  });

  it('draws a crew anchored anywhere in the band below the boss box and above Octopi', () => {
    for (const anchor of [SQUAD_BAND.minY, 3940, SQUAD_BAND.maxY]) {
      const s = arena();
      spawnSquad(s, 'crew', REEF_KINDS, idiv(FIELD_W, 2), anchor, 1);
      const tops = s.crabs.map((c) => c.y - HALF);
      const bottoms = s.crabs.map((c) => c.y + HALF);
      // Not one crab is drawn inside the boss box, and not one reaches Octopi's own water.
      expect({ anchor, inBox: Math.min(...tops) < BOX_BOTTOM }).toEqual({ anchor, inBox: false });
      expect({ anchor, inWater: Math.max(...bottoms) >= OCTOPI.minY }).toEqual({ anchor, inWater: false });
      // And Octopi at its own ceiling still cannot be touched by the bottom row.
      expect(Math.max(...bottoms)).toBeLessThan(OCTOPI.minY - OCTOPI.hitRadius);
    }
  });

  it('clamps an origin above or below the band back into it', () => {
    const s = arena();
    spawnSquad(s, 'pair', REEF_KINDS, 2000, 0, 1);
    expect(s.crabs[0]!.y).toBe(SQUAD_BAND.minY);
    s.crabs = [];
    s.squads = [];
    spawnSquad(s, 'pair', REEF_KINDS, 2000, 9000, 1);
    expect(s.crabs[0]!.y).toBe(SQUAD_BAND.maxY);
  });

  it('slides a squad spawned over an edge back onto the field', () => {
    const s = arena();
    spawnSquad(s, 'guard5', REEF_KINDS, 0, SQUAD_BAND.minY, 1);
    for (const c of s.crabs) expect(insideField(c.x)).toBe(true);
    s.crabs = [];
    s.squads = [];
    spawnSquad(s, 'guard5', REEF_KINDS, FIELD_W, SQUAD_BAND.minY, 1);
    for (const c of s.crabs) expect(insideField(c.x)).toBe(true);
  });
});

describe('squads marching', () => {
  it('marches at the normal crab speed, in march steps, without touching y', () => {
    const s = bossLevel();
    spawnSquad(s, 'line4', REEF_KINDS, idiv(FIELD_W, 2), SQUAD_BAND.minY, 1);
    const before = s.crabs.map((c) => ({ x: c.x, y: c.y }));
    s.tick = 0;
    marchSquads(s);
    const step1 = squadStep(s, 1);
    expect(marchSteps(0)).toBe(1);
    expect(step1).toBeGreaterThan(0);
    for (let i = 0; i < s.crabs.length; i++) {
      expect(s.crabs[i]!.x).toBe(before[i]!.x + step1);
      expect(s.crabs[i]!.y).toBe(before[i]!.y);
    }
  });

  it('turns round at the margin and never steps down', () => {
    const s = bossLevel();
    spawnSquad(s, 'line4', REEF_KINDS, idiv(FIELD_W, 2), SQUAD_BAND.minY, 1);
    const y0 = s.crabs.map((c) => c.y);
    let flips = 0;
    let dir = s.squads[0]!.dir;
    for (let t = 0; t < 3000; t++) {
      s.tick = t;
      marchSquads(s);
      if (s.squads[0]!.dir !== dir) { flips += 1; dir = s.squads[0]!.dir; }
      for (const c of s.crabs) expect(insideField(c.x)).toBe(true);
      expect(s.crabs.map((c) => c.y)).toEqual(y0);
    }
    expect(flips).toBeGreaterThanOrEqual(2);
  });

  it('forgets a squad once its last crab is gone', () => {
    const s = bossLevel();
    spawnSquad(s, 'pair', REEF_KINDS, 2000, SQUAD_BAND.minY, 1);
    s.crabs = [];
    marchSquads(s);
    expect(s.squads).toEqual([]);
  });

  it('marches through step()', () => {
    const s = bossLevel();
    spawnSquad(s, 'line4', REEF_KINDS, idiv(FIELD_W, 2), SQUAD_BAND.minY, 1);
    const x0 = s.crabs[0]!.x;
    const y0 = s.crabs[0]!.y;
    for (let i = 0; i < 30; i++) step(s, INITIAL_INPUT);
    expect(s.crabs[0]!.x).not.toBe(x0);
    expect(s.crabs[0]!.y).toBe(y0);
  });
});

describe('squad fire', () => {
  it('halves the fire chance while a boss lives and leaves it alone otherwise', () => {
    const s = arena();
    expect(halvedWhileBoss(s, 18)).toBe(9);
    s.boss = null;
    expect(halvedWhileBoss(s, 18)).toBe(18);
  });

  it('fires at half the wave chance during a boss fight', () => {
    const chance = fireChance(1); // practice wave 1
    const half = idiv(chance, 2);
    const roll = (s: GameState, r: number) => {
      s.rngFire = { nextInt: (n: number) => (n === 1000 ? r : 0) } as never;
      s.enemyShots = [];
      updateEnemyShots(s);
      return s.enemyShots.length;
    };
    const withBoss = arena();
    spawnSquad(withBoss, 'line4', REEF_KINDS, idiv(FIELD_W, 2), SQUAD_BAND.minY, 1);
    expect(roll(withBoss, half)).toBe(0); // the halved chance is already spent
    expect(roll(withBoss, half - 1)).toBe(1);
    const noBoss = arena();
    spawnSquad(noBoss, 'line4', REEF_KINDS, idiv(FIELD_W, 2), SQUAD_BAND.minY, 1);
    noBoss.boss = null;
    expect(roll(noBoss, half)).toBe(1); // no boss: the full chance stands
    expect(roll(noBoss, chance)).toBe(0);
  });
});

describe('squad crabs and the veteran skills', () => {
  it('heralds a neighbour inside the squad grid', () => {
    const s = arena();
    spawnSquad(s, 'crew', ['herald', 'normal', 'normal'], idiv(FIELD_W, 2), SQUAD_BAND.minY, 1);
    // A 3-kind roster paints tier 3 and tier 1 from the tier table; force the shapes by hand.
    s.crabs[0]!.type = 'herald';
    s.crabs[1]!.type = 'normal';
    s.crabs[7]!.type = 'normal';
    expect(isHeralded(s, s.crabs[1]!)).toBe(true); // cell 1 is beside cell 0
    expect(isHeralded(s, s.crabs[7]!)).toBe(false); // cell 11 is three columns away
  });

  it('never heralds across two squads', () => {
    const s = arena();
    spawnSquad(s, 'pair', ['herald'], 2000, SQUAD_BAND.minY, 1);
    spawnSquad(s, 'pair', ['normal'], 4000, SQUAD_BAND.minY, 1);
    expect(s.crabs[0]!.type).toBe('herald');
    expect(isHeralded(s, s.crabs[2]!)).toBe(false);
  });

  it('does not let a patriarch of a squad rally', () => {
    const s = arena();
    spawnSquad(s, 'pair', ['patriarch'], 2000, SQUAD_BAND.minY, 1);
    for (let t = 0; t < 1200; t++) { s.tick = t; updateVeterans(s); }
    expect(s.events.filter((e) => e.type === 'crab_rallied')).toHaveLength(0);
    expect(s.crabs).toHaveLength(2);
  });
});

describe('squad crabs dying', () => {
  it('scores a shot squad crab by the normal rule', () => {
    const s = arena();
    spawnSquad(s, 'pair', ['armored'], 2000, SQUAD_BAND.minY, 1);
    const c = s.crabs[0]!;
    c.hp = 1;
    s.shots.push({ x: c.x, y: c.y, vx: 0, vy: -240, kind: 'straight', data: 0 });
    hitCrabs(s);
    expect(s.crabs).toHaveLength(1);
    expect(s.kills).toBe(1);
    expect(s.score).toBe(CRAB_TYPES.armored.points * s.wave);
  });

  it('still scores on a boss level, where the round never had a wave number', () => {
    const s = bossLevel();
    expect(s.wave).toBe(0);
    spawnSquad(s, 'pair', ['armored'], 2000, SQUAD_BAND.minY, 1);
    const c = s.crabs[0]!;
    c.hp = 1;
    s.shots.push({ x: c.x, y: c.y, vx: 0, vy: -240, kind: 'straight', data: 0 });
    hitCrabs(s);
    expect(s.score).toBe(CRAB_TYPES.armored.points);
  });

  it('rolls a boost drop for a shot squad crab like any other crab', () => {
    const s = arena(true);
    spawnSquad(s, 'pair', ['normal'], 2000, SQUAD_BAND.minY, 1);
    s.rngBoosts = { nextInt: () => 0 } as never; // first roll < DROP.chance
    expect(DROP.chance).toBeGreaterThan(0);
    const c = s.crabs[0]!;
    s.shots.push({ x: c.x, y: c.y, vx: 0, vy: -240, kind: 'straight', data: 0 });
    hitCrabs(s);
    expect(s.drops).toHaveLength(1);
  });

  it('pops every surviving squad crab without score when the boss dies, one event per squad', () => {
    const plain = arena();
    damageBoss(plain, plain.boss!.maxHp);
    const withSquads = arena();
    spawnSquad(withSquads, 'line4', REEF_KINDS, 1500, SQUAD_BAND.minY, 1);
    spawnSquad(withSquads, 'pair', REEF_KINDS, 4000, SQUAD_BAND.minY, -1);
    damageBoss(withSquads, withSquads.boss!.maxHp);
    expect(withSquads.boss).toBeNull();
    expect(withSquads.crabs).toEqual([]);
    expect(withSquads.squads).toEqual([]);
    expect(withSquads.kills).toBe(0);
    expect(withSquads.score).toBe(plain.score); // the boss's own score only
    expect(withSquads.events.filter((e) => e.type === 'squad_popped')).toHaveLength(2);
  });

  it('pops nothing and raises nothing when a boss of the first campaign dies alone', () => {
    const s = arena();
    popSquads(s);
    expect(s.events.filter((e) => e.type === 'squad_popped')).toHaveLength(0);
  });
});
