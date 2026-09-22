import { describe, expect, it } from 'vitest';
import {
  BOSS, BOSS_HOOKS, BOSS_SHOT, CRYSTAL_COLUMNS, FIELD_W, INITIAL_INPUT, OCTOPI, PRACTICE_RUN,
  SHARD_COUNT, SHATTER_WARNING, bossStats, createGame, damageBoss, hashState, hitObstacle, icos,
  idiv, isin, moveOctopi, spawnBoss, step, updateBoss,
} from '../src';
import type { BossState, GameState } from '../src';

/**
 * The Frost Castellan, boss kind 7 (spec §5.2 row 7). Every number below is the spec's or the task
 * brief's, in ticks at 60 Hz. `sim/bosses/castellan.ts`'s own doc comment explains the four reused
 * `BossState` fields (`windup`, `burst`, `aimTicks`, `aimX`) and the RNG draw order pinned here.
 */

/** A practice arena with the Castellan on it, the practice wave swept away. */
function arena(seed = 'castellan'): GameState {
  const s = createGame(seed, { ...PRACTICE_RUN, features: { boosts: false } });
  s.crabs = [];
  spawnBoss(s, 7);
  return s;
}

/** Parks the timers a test is not driving so nothing but the mechanic under test fires. */
function park(s: GameState): BossState {
  const b = s.boss!;
  b.attackTimer = 1_000_000;
  b.abilityTimer = 1_000_000;
  return b;
}

/** Runs the boss `n` ticks. */
function ticks(s: GameState, n: number): void {
  for (let i = 0; i < n; i++) updateBoss(s);
}

/** An `Rng` stand-in that answers by draw width and records every width it was asked for. */
function scriptedRng(answers: Record<number, number[]>, log: number[] = []): { rng: never; log: number[] } {
  const queues: Record<number, number[]> = {};
  for (const [width, values] of Object.entries(answers)) queues[Number(width)] = [...values];
  const rng = {
    nextInt(n: number): number {
      log.push(n);
      const q = queues[n];
      return q && q.length > 0 ? q.shift()! : 0;
    },
  } as never;
  return { rng, log };
}

/** Drives the boss down through both transitions into phase 3, opening Shatter. Zero fighting ticks elapse in phase 1 or 2, so their attack/ability timers never get a chance to fire in between. */
function toPhaseThree(s: GameState): BossState {
  const b = s.boss!;
  damageBoss(s, b.hp - idiv(b.maxHp * (b.maxPhases - 1), b.maxPhases));
  expect(b.state).toBe('transition');
  ticks(s, BOSS.transitionTicks);
  expect(b.phase).toBe(2);
  damageBoss(s, b.hp - idiv(b.maxHp * (b.maxPhases - 2), b.maxPhases));
  expect(b.state).toBe('transition');
  ticks(s, BOSS.transitionTicks);
  expect(b.phase).toBe(3);
  return b;
}

describe('Frost Castellan (kind 7) — the table row', () => {
  it('takes 800 hp, 3 phases and a 14 000 score base from the boss table', () => {
    expect(bossStats(7)).toEqual({ hp: 800, phases: 3, score: 14000 });
    const s = arena();
    expect(s.boss).toMatchObject({ kind: 7, hp: 800, maxHp: 800, phase: 1, maxPhases: 3 });
  });

  it('pays the table score when it falls', () => {
    const s = arena();
    damageBoss(s, s.boss!.hp);
    expect(s.boss).toBeNull();
    expect(s.score).toBe(14000);
  });
});

describe('Frost Castellan — Crystals timer', () => {
  it('times Crystals at 7 to 15 seconds, at the fight start and after every use', () => {
    const hooks = BOSS_HOOKS[7];
    for (const timer of [hooks.initialAbilityTimer, hooks.nextAbilityTimer]) {
      const low = scriptedRng({ 481: [0] });
      expect(timer(low.rng)).toBe(420);
      expect(low.log).toEqual([481]);
      const high = scriptedRng({ 481: [480] });
      expect(timer(high.rng)).toBe(900);
    }
  });
});

describe('Frost Castellan — Crystals (the ability)', () => {
  it('raises 3 crystals in phase 1, box 500x700, hp 12, y 3600, on distinct columns', () => {
    const s = arena();
    const b = park(s);
    b.abilityTimer = 1;
    updateBoss(s);
    expect(s.obstacles).toHaveLength(3);
    for (const o of s.obstacles) {
      expect(o).toMatchObject({ w: 500, h: 700, hp: 12, y: 3600, kind: 'crystal' });
      expect(CRYSTAL_COLUMNS).toContain(o.x);
    }
    expect(new Set(s.obstacles.map((o) => o.x)).size).toBe(3);
    expect(s.events).toContainEqual({ tick: s.tick, type: 'crystal_raised' });
  });

  it('raises 4 crystals from phase 2 on', () => {
    const s = arena();
    const b = park(s);
    b.phase = 2;
    b.abilityTimer = 1;
    updateBoss(s);
    expect(s.obstacles).toHaveLength(4);
    expect(new Set(s.obstacles.map((o) => o.x)).size).toBe(4);
  });

  it('caps the field at 6 crystals, still drawing the fixed count every time', () => {
    const s = arena();
    const b = park(s);
    b.phase = 2; // 4 crystals per raise
    s.rngBoss = scriptedRng({ 6: [0, 1, 2, 3] }).rng;
    b.abilityTimer = 1;
    updateBoss(s);
    expect(s.obstacles).toHaveLength(4);

    const second = scriptedRng({ 6: [0, 1, 2, 3] });
    s.rngBoss = second.rng;
    b.abilityTimer = 1;
    updateBoss(s);
    expect(s.obstacles).toHaveLength(6);
    expect(new Set(s.obstacles.map((o) => o.x))).toEqual(new Set(CRYSTAL_COLUMNS));
    // The fixed count of nextInt(6) draws — 4, even though only 2 of the 4 found room — followed by
    // the unconditional nextAbilityTimer redraw every `ability()` firing gets from `updateBoss`.
    expect(second.log).toEqual([6, 6, 6, 6, 481]);
  });

  it('walks a taken column forward one at a time, drawing once per crystal', () => {
    const s = arena();
    const b = park(s);
    const rng = scriptedRng({ 6: [2, 2, 2] }); // the same column drawn three times running
    s.rngBoss = rng.rng;
    b.abilityTimer = 1;
    updateBoss(s);
    expect(s.obstacles.map((o) => o.x)).toEqual([CRYSTAL_COLUMNS[2], CRYSTAL_COLUMNS[3], CRYSTAL_COLUMNS[4]]);
    expect(rng.log).toEqual([6, 6, 6, 481]); // the ability redraw follows the three column draws
  });

  it('wraps the walk from column 5 back to column 0', () => {
    const s = arena();
    const b = park(s);
    s.rngBoss = scriptedRng({ 6: [5, 5, 5] }).rng;
    b.abilityTimer = 1;
    updateBoss(s);
    expect(s.obstacles.map((o) => o.x)).toEqual([CRYSTAL_COLUMNS[5], CRYSTAL_COLUMNS[0], CRYSTAL_COLUMNS[1]]);
  });

  it('leaves crystals that already exist standing, raising only the new ones', () => {
    const s = arena();
    const b = park(s);
    s.rngBoss = scriptedRng({ 6: [0] }).rng;
    b.abilityTimer = 1;
    updateBoss(s);
    const first = { ...s.obstacles[0]! }; // a copy, not a live reference: a real proof, not a tautology
    s.rngBoss = scriptedRng({ 6: [1] }).rng;
    b.abilityTimer = 1;
    updateBoss(s);
    expect(s.obstacles[0]).toEqual(first); // untouched by the second raise
  });
});

describe('Frost Castellan — a crystal blocks fire from both sides', () => {
  it('eats a player shot and an enemy shot whose centre enters its box, only the player costing it hp', () => {
    const s = arena();
    const b = park(s);
    b.abilityTimer = 1;
    updateBoss(s);
    const crystal = s.obstacles[0]!;
    s.shots.push({ x: crystal.x, y: crystal.y, vx: 0, vy: -240, kind: 'straight', data: 0 });
    s.enemyShots.push({ x: crystal.x, y: crystal.y, vx: 0, vy: 110, kind: 'straight', data: 0 });
    hitObstacle(s);
    expect(s.shots).toEqual([]);
    expect(s.enemyShots).toEqual([]);
    expect(s.obstacles[0]!.hp).toBe(11);
  });
});

describe('Frost Castellan — a player-destroyed crystal bursts', () => {
  it('takes 12 player hits, then bursts into 6 shards at 0.9x speed on the boss\'s next tick', () => {
    const s = arena();
    const b = park(s);
    b.abilityTimer = 1;
    updateBoss(s);
    const { x, y } = s.obstacles[0]!;
    for (let i = 0; i < 12; i++) s.shots.push({ x, y, vx: 0, vy: -240, kind: 'straight', data: 0 });
    hitObstacle(s);
    expect(s.obstacles.some((o) => o.x === x && o.y === y)).toBe(false);
    expect(s.enemyShots).toHaveLength(0); // the boss has not looked yet
    updateBoss(s);
    expect(s.enemyShots).toHaveLength(SHARD_COUNT);
    for (let i = 0; i < SHARD_COUNT; i++) {
      const deg = idiv(i * 360, SHARD_COUNT);
      expect(s.enemyShots[i]).toMatchObject({
        x, y, kind: 'shard',
        vx: idiv(BOSS_SHOT.speed * icos(deg) * 900, 1_000_000),
        vy: idiv(BOSS_SHOT.speed * isin(deg) * 900, 1_000_000),
      });
    }
  });

  it('never bursts the same crystal twice', () => {
    const s = arena();
    const b = park(s);
    b.abilityTimer = 1;
    updateBoss(s);
    const { x, y } = s.obstacles[0]!;
    for (let i = 0; i < 12; i++) s.shots.push({ x, y, vx: 0, vy: -240, kind: 'straight', data: 0 });
    hitObstacle(s);
    updateBoss(s);
    expect(s.enemyShots).toHaveLength(SHARD_COUNT);
    updateBoss(s);
    updateBoss(s);
    expect(s.enemyShots).toHaveLength(SHARD_COUNT); // no repeat burst
  });

  it('catches a crystal destroyed during a phase transition, when this hook does not run', () => {
    const s = arena();
    const b = park(s);
    b.abilityTimer = 1;
    updateBoss(s);
    const { x, y } = s.obstacles[0]!;
    for (let i = 0; i < 12; i++) s.shots.push({ x, y, vx: 0, vy: -240, kind: 'straight', data: 0 });
    // Force a transition (phase 1 -> 2) on this very tick, then destroy the crystal mid-transition:
    // `hitObstacle` runs every tick regardless of the boss's state, but `hooks.tick` does not.
    b.state = 'transition';
    b.transitionTicks = 5;
    hitObstacle(s);
    expect(s.obstacles.some((o) => o.x === x && o.y === y)).toBe(false); // this one crystal is gone
    for (let i = 0; i < 5; i++) updateBoss(s); // the transition itself: hooks.tick never runs here
    expect(s.enemyShots).toHaveLength(0);
    updateBoss(s); // the transition ends, phase 2 begins, and this tick's hooks.tick finally looks
    expect(s.enemyShots.filter((e) => e.kind === 'shard')).toHaveLength(SHARD_COUNT);
  });
});

describe('Frost Castellan — phase 1 attack', () => {
  it('throws Azure\'s own seven-shot fan', () => {
    const s = arena();
    const b = park(s);
    b.attackTimer = 1;
    updateBoss(s);
    expect(s.enemyShots).toHaveLength(7);
    for (const shot of s.enemyShots) expect(shot.kind).toBe('wave');
    expect(s.enemyShots[0]!.vx).toBe(-s.enemyShots[6]!.vx);
    expect(s.enemyShots[1]!.vx).toBe(-s.enemyShots[5]!.vx);
    expect(s.enemyShots[2]!.vx).toBe(-s.enemyShots[4]!.vx);
    expect(s.enemyShots[3]!.vx).toBe(0);
  });
});

describe('Frost Castellan — phase 2', () => {
  it('adds a large shot on every second attack, starting with the first', () => {
    const s = arena();
    const b = park(s);
    b.phase = 2;
    b.attackTimer = 1;
    updateBoss(s);
    expect(s.enemyShots.filter((e) => e.kind === 'wave')).toHaveLength(7);
    expect(s.enemyShots.filter((e) => e.kind === 'large')).toHaveLength(1);

    s.enemyShots = [];
    b.attackTimer = 1;
    updateBoss(s);
    expect(s.enemyShots.filter((e) => e.kind === 'wave')).toHaveLength(7);
    expect(s.enemyShots.filter((e) => e.kind === 'large')).toHaveLength(0);

    s.enemyShots = [];
    b.attackTimer = 1;
    updateBoss(s);
    expect(s.enemyShots.filter((e) => e.kind === 'large')).toHaveLength(1);
  });

  it('never adds the large shot in phase 1 or phase 3', () => {
    const s = arena();
    const b = park(s);
    b.attackTimer = 1;
    updateBoss(s);
    expect(s.enemyShots.filter((e) => e.kind === 'large')).toHaveLength(0);
    s.enemyShots = [];
    b.phase = 3;
    b.attackTimer = 1;
    updateBoss(s);
    expect(s.enemyShots.filter((e) => e.kind === 'large')).toHaveLength(0);
  });
});

describe('Frost Castellan — Shatter (phase 3 opener)', () => {
  it('opens phase 3 with crystal_shatter and a 120-tick warning', () => {
    const s = arena();
    const b = toPhaseThree(s);
    expect(SHATTER_WARNING).toBe(120);
    expect(s.events).toContainEqual({ tick: s.tick, type: 'crystal_shatter' });
    expect(b.windup).toBe(SHATTER_WARNING);
  });

  it('bursts every crystal on the field left to right after the warning, and clears it', () => {
    const s = arena();
    const b = toPhaseThree(s);
    park(s);
    s.obstacles = [
      { x: CRYSTAL_COLUMNS[4]!, y: 3600, w: 500, h: 700, hp: 12, kind: 'crystal' },
      { x: CRYSTAL_COLUMNS[1]!, y: 3600, w: 500, h: 700, hp: 12, kind: 'crystal' },
      { x: CRYSTAL_COLUMNS[3]!, y: 3600, w: 500, h: 700, hp: 12, kind: 'crystal' },
    ];
    s.enemyShots = [];
    ticks(s, SHATTER_WARNING - 1);
    expect(s.obstacles).toHaveLength(3);
    expect(b.windup).toBe(1);
    updateBoss(s);
    expect(b.windup).toBe(0);
    expect(s.obstacles).toEqual([]);
    const shards = s.enemyShots.filter((e) => e.kind === 'shard');
    expect(shards).toHaveLength(3 * SHARD_COUNT);
    const order: number[] = [];
    for (let i = 0; i < shards.length; i += SHARD_COUNT) order.push(shards[i]!.x);
    expect(order).toEqual([CRYSTAL_COLUMNS[1], CRYSTAL_COLUMNS[3], CRYSTAL_COLUMNS[4]]);
  });

  it('runs its warning even with no crystal on the field, and bursts nothing', () => {
    const s = arena();
    const b = toPhaseThree(s);
    park(s);
    s.obstacles = [];
    s.enemyShots = [];
    ticks(s, SHATTER_WARNING);
    expect(b.windup).toBe(0);
    expect(s.obstacles).toEqual([]);
    expect(s.enemyShots).toEqual([]);
  });
});

describe('Frost Castellan — cold snap', () => {
  it('sets chillTicks to 180 when its own timer fires', () => {
    const s = arena();
    const b = park(s);
    b.aimTicks = 1;
    updateBoss(s);
    expect(s.chillTicks).toBe(180);
    expect(s.events).toContainEqual({ tick: s.tick, type: 'cold_snap' });
  });

  it('redraws its own 8-14 second timer, never the shared secondary cadence', () => {
    const s = arena();
    const b = park(s);
    b.aimTicks = 1;
    updateBoss(s);
    expect(b.aimTicks).toBeGreaterThanOrEqual(480);
    expect(b.aimTicks).toBeLessThanOrEqual(840);
    // The shared `secondary` mechanism never runs for this boss at all (it defines no `secondary`
    // hook), so `secondaryTimer` is never even drawn — spawnBoss leaves it at 0.
    expect(b.secondaryTimer).toBe(0);
  });

  it('slows Octopi to two thirds through a real step once it fires', () => {
    const s = arena();
    const b = park(s);
    b.aimTicks = 1;
    updateBoss(s);
    expect(s.chillTicks).toBe(180);
    const slow = idiv(OCTOPI.maxStep * 2, 3);
    s.octopi.x = 1000;
    moveOctopi(s, { x: FIELD_W, y: s.octopi.y });
    expect(s.octopi.x).toBe(1000 + slow);
  });
});

describe('Frost Castellan — the RNG draw order', () => {
  it('draws direction, the attack jitter, the ability timer, then the cold snap timer at spawn, in that order', () => {
    const s = createGame('castellan-order', { ...PRACTICE_RUN, features: { boosts: false } });
    s.crabs = [];
    const rng = scriptedRng({});
    s.rngBoss = rng.rng;
    spawnBoss(s, 7);
    expect(rng.log).toEqual([2, BOSS.attackJitter, 481, 361]);
  });

  it('draws the attack jitter, then the crystal columns and the ability redraw, then the cold snap redraw', () => {
    const s = arena();
    const b = park(s);
    b.attackTimer = 1;
    b.abilityTimer = 1;
    b.aimTicks = 1;
    const rng = scriptedRng({});
    s.rngBoss = rng.rng;
    updateBoss(s);
    expect(rng.log).toEqual([BOSS.attackJitter, 6, 6, 6, 481, 361]);
  });

  it('fights the same fight from the same seed', () => {
    const columns = (seed: string): number[] => {
      const s = arena(seed);
      const b = park(s);
      b.abilityTimer = 1;
      updateBoss(s);
      return s.obstacles.map((o) => o.x);
    };
    expect(columns('castellan')).toEqual(columns('castellan'));
  });

  it('is deterministic over 600 ticks', () => {
    const a = arena();
    const b = arena();
    for (let i = 0; i < 600; i++) {
      step(a, INITIAL_INPUT);
      step(b, INITIAL_INPUT);
    }
    expect(hashState(a)).toBe(hashState(b));
  });
});

describe('Frost Castellan — the shared constants', () => {
  it('spreads six columns evenly inside the march margins', () => {
    expect(CRYSTAL_COLUMNS).toHaveLength(6);
    for (const x of CRYSTAL_COLUMNS) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(FIELD_W);
    }
    const gaps = CRYSTAL_COLUMNS.slice(1).map((x, i) => x - CRYSTAL_COLUMNS[i]!);
    for (const g of gaps) expect(g).toBe(gaps[0]);
  });
});
