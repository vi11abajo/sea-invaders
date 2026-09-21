import { describe, expect, it } from 'vitest';
import {
  CRAB_SHOTS, CRAB_TYPES, ENEMY_SHOT, FIRE_WEIGHT, PRACTICE_RUN, REEF_KINDS, Rng, TYPE_COLOUR,
  createGame, shotDamage, shotRadius, updateEnemyShots, type Crab, type CrabType,
} from '../src';

function crab(type: CrabType, x = 2812, y = 1500): Crab {
  return {
    x, y, kind: TYPE_COLOUR[type], type, hp: CRAB_TYPES[type].hp,
    slot: -1, shield: type === 'warden' ? 1 : 0, shieldTimer: 0, rallies: 0, rallyTimer: 0, squad: 0,
  };
}

/** A lone crab of `type` centred on Octopi's x, forced to fire (no randomness). */
function fire(type: CrabType) {
  const s = createGame('shots', PRACTICE_RUN);
  s.crabs = [crab(type, s.octopi.x)];
  s.waveTotal = 1;
  s.rngFire = { nextInt: () => 0 } as never; // always fires, picks the first crab
  updateEnemyShots(s);
  return s;
}

describe('CRAB_SHOTS by kind', () => {
  it('gives every kind but heavy the plain crab shot: speed 110, radius 96, damage 1', () => {
    for (const type of ['normal', 'armored', 'swift', 'elder'] as const) {
      const s = fire(type);
      expect(s.enemyShots).toHaveLength(1);
      const b = s.enemyShots[0]!;
      // crab.x === octopi.x, so vx is 0 and vy carries the full speed.
      expect({ type, kind: b.kind, vx: b.vx, vy: b.vy, radius: shotRadius(b), damage: shotDamage(b) })
        .toEqual({ type, kind: 'crab', vx: 0, vy: ENEMY_SHOT.speed, radius: ENEMY_SHOT.radius, damage: 1 });
    }
  });

  it('gives heavy its own shot: speed 140, radius 154, damage 2', () => {
    const s = fire('heavy');
    expect(s.enemyShots).toHaveLength(1);
    const b = s.enemyShots[0]!;
    expect(b.kind).toBe('heavy');
    expect(b.vy).toBe(140);
    expect(shotRadius(b)).toBe(154);
    expect(shotDamage(b)).toBe(2);
  });

  it('fires exactly one shot per firing tick, whatever the kind: no fans, no silent kinds', () => {
    for (const type of REEF_KINDS) expect({ type, shots: fire(type).enemyShots.length }).toEqual({ type, shots: 1 });
    // CRAB_SHOTS covers every crab kind there is, legacy and veteran alike - never a subset.
    expect(Object.keys(CRAB_SHOTS).sort()).toEqual(Object.keys(CRAB_TYPES).sort());
    for (const type of REEF_KINDS) expect(CRAB_SHOTS[type].damage).toBe(type === 'heavy' ? 2 : 1);
  });

  it('counts every shot but heavy as damage 1, a boss shot included', () => {
    expect(shotDamage({ x: 0, y: 0, vx: 0, vy: 0, kind: 'meteor', data: 0 })).toBe(1);
    expect(shotDamage({ x: 0, y: 0, vx: 0, vy: 0, kind: 'large', data: 0 })).toBe(1);
    expect(shotDamage({ x: 0, y: 0, vx: 0, vy: 0, kind: 'crab', data: 0 })).toBe(1);
  });
});

describe('CRAB_SHOTS for the veterans (spec §2)', () => {
  it('gives warden, herald and patriarch the plain crab shot, unchanged from the legacy kinds', () => {
    for (const type of ['warden', 'herald', 'patriarch'] as const) {
      expect(CRAB_SHOTS[type]).toEqual({ kind: 'crab', speed: 110, damage: 1 });
    }
  });

  it('gives bubbler a bubble shot and bombardier a charge shot, each just flying straight and aimed for now', () => {
    expect(CRAB_SHOTS.bubbler).toEqual({ kind: 'bubble', speed: 60, damage: 1 });
    expect(CRAB_SHOTS.bombardier).toEqual({ kind: 'charge', speed: 100, damage: 2 });

    // Fired the same way a legacy crab shot is (aimed at Octopi, dead ahead here so vx is 0):
    // their own zigzag/bursting motion is a later task's work.
    const bubble = fire('bubbler').enemyShots[0]!;
    expect({ kind: bubble.kind, vx: bubble.vx, vy: bubble.vy }).toEqual({ kind: 'bubble', vx: 0, vy: 60 });
    const charge = fire('bombardier').enemyShots[0]!;
    expect({ kind: charge.kind, vx: charge.vx, vy: charge.vy }).toEqual({ kind: 'charge', vx: 0, vy: 100 });
  });
});

describe('the weighted shooter', () => {
  it('weights yellow and violet at twice green, and red at half, legacy and veteran alike', () => {
    expect(FIRE_WEIGHT).toEqual({
      normal: 2, armored: 2, swift: 4, heavy: 1, elder: 4,
      warden: 2, herald: 2, bubbler: 3, bombardier: 1, patriarch: 4,
    });
  });

  /** One crab of every kind, each on its own x so the shot that lands names its shooter. */
  function firingSquad() {
    const s = createGame('weights', PRACTICE_RUN);
    s.crabs = REEF_KINDS.map((type, i) => crab(type, 1000 + i * 800));
    s.waveTotal = s.crabs.length;
    return s;
  }

  it('picks the shooter by weight with exactly one draw per firing tick', () => {
    const s = firingSquad();
    const byX = new Map(s.crabs.map((c) => [c.x, c.type]));
    const rng = new Rng('weighted-shooter');
    let draws = 0;
    s.rngFire = {
      nextInt: (n: number) => {
        if (n === 1000) return 0; // this tick fires
        draws += 1;
        return rng.nextInt(n);
      },
    } as never;

    const total = REEF_KINDS.reduce((sum, type) => sum + FIRE_WEIGHT[type], 0);
    expect(total).toBe(13);
    const ticks = 2000 * total;
    const counts: Record<string, number> = { normal: 0, armored: 0, swift: 0, heavy: 0, elder: 0 };
    for (let i = 0; i < ticks; i++) {
      s.enemyShots = [];
      updateEnemyShots(s);
      expect(s.enemyShots).toHaveLength(1);
      counts[byX.get(s.enemyShots[0]!.x)!] += 1;
    }

    expect(draws).toBe(ticks); // exactly one shooter draw per firing tick
    // Every kind within 10% of its share of the total weight.
    for (const type of REEF_KINDS) {
      const expected = (ticks * FIRE_WEIGHT[type]) / total;
      expect({ type, within: Math.abs(counts[type]! - expected) <= expected / 10 }).toEqual({ type, within: true });
    }
    expect(counts.swift! / counts.normal!).toBeGreaterThan(1.8);
    expect(counts.elder! / counts.normal!).toBeGreaterThan(1.8);
    expect(counts.heavy! / counts.normal!).toBeLessThan(0.6);
  });

  it('draws nothing beyond the fire roll on a tick that does not fire', () => {
    const s = firingSquad();
    let draws = 0;
    s.rngFire = {
      nextInt: (n: number) => {
        draws += 1;
        return n === 1000 ? 999 : 0; // 999 is above any fire chance: no shot this tick
      },
    } as never;
    updateEnemyShots(s);
    expect(s.enemyShots).toHaveLength(0);
    expect(draws).toBe(1);
  });
});
