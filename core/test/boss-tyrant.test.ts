import { describe, expect, it } from 'vitest';
import {
  BOLT_SPEED, BOLT_SPREAD, BOSS, BOSS_HOOKS, FIELD_W, INITIAL_INPUT, LANE_COUNT, PRACTICE_RUN,
  SQUAD_BAND, TYRANT_DISCHARGE_TICKS, TYRANT_ESCORT, TYRANT_ESCORT_CAP, bossStats, createGame,
  damageBoss, hashState, icos, idiv, isin, laneOf, muzzle, spawnBoss, spawnSquad, step, updateBoss,
} from '../src';
import type { BossState, GameState } from '../src';

/**
 * Storm Tyrant, boss kind 9. Every number below is in ticks at 60 Hz.
 * `sim/bosses/tyrant.ts`'s own doc comment explains the lane math, the fixed draw
 * count and walk-forward distinctness rule, why the lanes/discharge countdown lives in a new
 * `tickThroughTransition` hook instead of the ordinary `tick`, the kind-gated `dischargeMult`
 * (`sim/boss.ts`, the same idiom as `rageMult`), the escort roster and the RNG draw order pinned here.
 *
 * One illustration of the warning formula ("2 lanes / 75 ticks in phase 1, 3 / 55 in
 * phase 2, 3 / 45 in phase 3, 4 / 35 in phase 4") does not match the formula it is illustrating —
 * `75 − 10·phase` gives 65, not 75, for phase 1 (`75 − 10·1 = 65`); every later value (55/45/35) does
 * match. The formula itself is correct wherever else it appears, so it is treated as
 * authoritative and the phase-1 illustration as a slip; `65` is what this file
 * pins for phase 1.
 */

/** A practice arena with the Tyrant on it, the practice wave swept away. */
function arena(seed = 'tyrant'): GameState {
  const s = createGame(seed, { ...PRACTICE_RUN, features: { boosts: false } });
  s.crabs = [];
  spawnBoss(s, 9);
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

/** Forces a lane to strike on the very next `updateBoss` call. */
function forceStrike(s: GameState, lane: number): void {
  s.lanes = [lane, 1];
  updateBoss(s);
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

/** Drives the boss down to the start of `phase` through as many transitions as it takes. */
function toPhase(s: GameState, phase: number): BossState {
  const b = s.boss!;
  while (b.phase < phase) {
    damageBoss(s, b.hp - idiv(b.maxHp * (b.maxPhases - b.phase), b.maxPhases));
    expect(b.state).toBe('transition');
    ticks(s, BOSS.transitionTicks);
  }
  expect(b.phase).toBe(phase);
  return b;
}

describe('Storm Tyrant (kind 9) — the table row', () => {
  it('takes 1000 hp, 4 phases and an 18 000 score base from the boss table', () => {
    expect(bossStats(9)).toEqual({ hp: 1000, phases: 4, score: 18000 });
    const s = arena();
    expect(s.boss).toMatchObject({ kind: 9, hp: 1000, maxHp: 1000, phase: 1, maxPhases: 4 });
  });

  it('pays the table score when it falls', () => {
    const s = arena();
    damageBoss(s, s.boss!.hp);
    expect(s.boss).toBeNull();
    expect(s.score).toBe(18000);
  });
});

describe('Storm Tyrant — lanes (laneOf)', () => {
  it('splits the field into 6 equal lanes, closed on the left, open on the right', () => {
    expect(LANE_COUNT).toBe(6);
    for (let i = 0; i < LANE_COUNT; i++) {
      const lo = idiv(FIELD_W * i, LANE_COUNT);
      const hi = idiv(FIELD_W * (i + 1), LANE_COUNT);
      expect(laneOf(lo)).toBe(i); // the left edge belongs to this lane
      expect(laneOf(hi - 1)).toBe(i); // just short of the right edge, still this lane
      if (i < LANE_COUNT - 1) expect(laneOf(hi)).toBe(i + 1); // the shared boundary belongs to the next lane
    }
  });

  it('is total: an x at or past the field edge still resolves to the last lane', () => {
    expect(laneOf(0)).toBe(0);
    expect(laneOf(FIELD_W)).toBe(LANE_COUNT - 1);
    expect(laneOf(FIELD_W + 1000)).toBe(LANE_COUNT - 1);
  });
});

describe('Storm Tyrant — Stormlanes timer', () => {
  it('times Stormlanes at 6 to 10 seconds, at the fight start and after every firing', () => {
    const hooks = BOSS_HOOKS[9];
    for (const timer of [hooks.initialAbilityTimer, hooks.nextAbilityTimer]) {
      const low = scriptedRng({ 241: [0] });
      expect(timer(low.rng)).toBe(360);
      expect(low.log).toEqual([241]);
      const high = scriptedRng({ 241: [240] });
      expect(timer(high.rng)).toBe(600);
    }
  });
});

describe('Storm Tyrant — Stormlanes (the ability)', () => {
  it.each([
    [1, 2, 65],
    [2, 3, 55],
    [3, 3, 45],
    [4, 4, 35],
  ])('phase %i warns %i distinct lanes for %i ticks, one lane_warning', (phase, n, warning) => {
    const s = arena();
    const b = park(s);
    b.phase = phase;
    s.rngBoss = scriptedRng({}).rng; // every draw comes back 0; only the count and warning matter here
    b.abilityTimer = 1;
    updateBoss(s);
    expect(s.lanes.length).toBe(n * 2);
    for (let i = 1; i < s.lanes.length; i += 2) expect(s.lanes[i]).toBe(warning);
    const lanes = new Set<number>();
    for (let i = 0; i < s.lanes.length; i += 2) lanes.add(s.lanes[i]!);
    expect(lanes.size).toBe(n); // distinct
    expect(s.events.filter((e) => e.type === 'lane_warning')).toHaveLength(1); // one per firing, not per lane
  });

  it('walks a colliding draw forward to the next free lane, no extra draw (the Frost Castellan\'s own columns rule)', () => {
    const s = arena();
    const b = park(s);
    b.phase = 4; // 4 lanes this firing
    const rng = scriptedRng({ [LANE_COUNT]: [3, 3, 3, 5] });
    s.rngBoss = rng.rng;
    b.abilityTimer = 1;
    updateBoss(s);
    // draw 3 -> lane 3 (free); draw 3 -> taken, walk to 4; draw 3 -> taken, walk 4 (taken) -> 5;
    // draw 5 -> taken, walk to 0.
    const lanes: number[] = [];
    for (let i = 0; i < s.lanes.length; i += 2) lanes.push(s.lanes[i]!);
    expect(lanes.slice().sort((x, y) => x - y)).toEqual([0, 3, 4, 5]);
    expect(rng.log.filter((w) => w === LANE_COUNT)).toHaveLength(4); // exactly one draw per lane, fixed count
  });

  it('treats a lane s.lanes still carries as occupied too (defensive; provably unreachable in real play)', () => {
    const s = arena();
    const b = park(s);
    s.lanes = [2, 10]; // a lingering entry from an earlier firing
    b.phase = 1; // 2 lanes drawn
    s.rngBoss = scriptedRng({ [LANE_COUNT]: [2, 2] }).rng;
    b.abilityTimer = 1;
    updateBoss(s);
    const lanes: number[] = [];
    for (let i = 0; i < s.lanes.length; i += 2) lanes.push(s.lanes[i]!);
    expect(lanes.filter((l) => l === 2)).toHaveLength(1); // the old entry, never doubled up on
    expect(lanes).toEqual(expect.arrayContaining([2, 3, 4]));
    // The old entry's own countdown still ticks this very call — `tickThroughTransition` always runs
    // before `ability`, on every tick including this firing's own — so 10 becomes 9, not 10.
    expect(s.lanes[s.lanes.indexOf(2) + 1]).toBe(9);
  });
});

describe('Storm Tyrant — a lane strike', () => {
  it('costs Octopi one life, only when its centre is in the struck lane', () => {
    const s = arena();
    park(s);
    s.octopi.x = 500;
    const lane = laneOf(500);
    const before = s.octopi.lives;
    forceStrike(s, (lane + 1) % LANE_COUNT); // a different lane
    expect(s.octopi.lives).toBe(before);
    forceStrike(s, lane);
    expect(s.octopi.lives).toBe(before - 1);
    expect(s.events).toContainEqual({ tick: s.tick, type: 'lane_strike' });
  });

  it('lets SHIELD_BARRIER absorb the hit instead of a life', () => {
    const s = arena();
    park(s);
    s.octopi.x = 500;
    s.boosts.shield = 1;
    const before = s.octopi.lives;
    forceStrike(s, laneOf(500));
    expect(s.octopi.lives).toBe(before);
    expect(s.boosts.shield).toBe(0);
  });

  it('lets INVINCIBILITY ignore the hit outright, no shield spent', () => {
    const s = arena();
    park(s);
    s.octopi.x = 500;
    s.boosts.active.push({ type: 'INVINCIBILITY', ticksLeft: 100 });
    s.boosts.shield = 1;
    const before = s.octopi.lives;
    forceStrike(s, laneOf(500));
    expect(s.octopi.lives).toBe(before);
    expect(s.boosts.shield).toBe(1); // never touched
  });

  it('never hits Octopi while its own post-hit invulnerability window is still running', () => {
    const s = arena();
    park(s);
    s.octopi.x = 500;
    s.octopi.invuln = 10;
    const before = s.octopi.lives;
    forceStrike(s, laneOf(500));
    expect(s.octopi.lives).toBe(before);
  });

  it('removes every bubble and orb whose centre is in the lane, leaves everything else', () => {
    const s = arena();
    park(s);
    const lane = laneOf(500);
    const otherLaneX = idiv(FIELD_W, 2); // the field centre sits in a different lane than x=500
    expect(laneOf(otherLaneX)).not.toBe(lane);
    s.enemyShots = [
      { x: 500, y: 2000, vx: 0, vy: 60, kind: 'bubble', data: 0 }, // in the lane, removed
      { x: 500, y: 2500, vx: 0, vy: 30, kind: 'orb', data: 0 }, // in the lane, removed
      { x: otherLaneX, y: 2000, vx: 0, vy: 60, kind: 'bubble', data: 0 }, // a different lane, kept
      { x: 500, y: 2000, vx: 0, vy: 110, kind: 'straight', data: 0 }, // in the lane, but not a bubble/orb, kept
    ];
    forceStrike(s, lane);
    expect(s.enemyShots).toHaveLength(2);
    expect(s.enemyShots.some((e) => e.kind === 'bubble' && e.x === otherLaneX)).toBe(true);
    expect(s.enemyShots.some((e) => e.kind === 'straight')).toBe(true);
  });

  it('kills only the squad crabs whose centre is in the struck lane, scored through killCrab', () => {
    const s = arena();
    park(s);
    spawnSquad(s, 'pair', TYRANT_ESCORT, idiv(FIELD_W, 2), SQUAD_BAND.maxY, 1);
    expect(s.crabs).toHaveLength(2);
    const [left, right] = s.crabs;
    expect(laneOf(left!.x)).not.toBe(laneOf(right!.x)); // the pair straddles a lane boundary at the centre
    const killsBefore = s.kills;
    const scoreBefore = s.score;
    forceStrike(s, laneOf(left!.x));
    expect(s.crabs).toHaveLength(1);
    expect(s.crabs[0]!.x).toBe(right!.x);
    expect(s.kills).toBe(killsBefore + 1);
    expect(s.score).toBeGreaterThan(scoreBefore); // squad crabs score normally
    expect(s.squads[0]!.alive).toBe(1);
  });

  it('kills every squad crab in the lane when more than one shares it', () => {
    const s = arena();
    park(s);
    spawnSquad(s, 'pair', TYRANT_ESCORT, 2300, SQUAD_BAND.maxY, 1); // both crabs land inside one lane
    expect(s.crabs).toHaveLength(2);
    const lane = laneOf(s.crabs[0]!.x);
    expect(s.crabs.every((c) => laneOf(c.x) === lane)).toBe(true);
    forceStrike(s, lane);
    expect(s.crabs).toHaveLength(0);
    expect(s.squads[0]!.alive).toBe(0);
  });

  it('can strike more than one lane in the same tick: one lane_strike each, one boss_discharged total', () => {
    const s = arena();
    const b = park(s);
    s.lanes = [1, 1, 4, 1];
    updateBoss(s);
    expect(s.lanes).toEqual([]);
    expect(s.events.filter((e) => e.type === 'lane_strike')).toHaveLength(2);
    expect(s.events.filter((e) => e.type === 'boss_discharged')).toHaveLength(1);
    expect(b.discharged).toBe(TYRANT_DISCHARGE_TICKS);
  });
});

describe('Storm Tyrant — lanes survive a phase transition', () => {
  it('keeps counting down, and can strike, while state is transition', () => {
    const s = arena();
    const b = park(s);
    s.lanes = [2, 3];
    b.state = 'transition';
    b.transitionTicks = 10;
    const attackTimerBefore = b.attackTimer;
    ticks(s, 2);
    expect(s.lanes).toEqual([2, 1]); // counted down twice despite the transition
    ticks(s, 1);
    expect(s.lanes).toEqual([]); // struck on the 3rd tick
    expect(s.events).toContainEqual({ tick: s.tick, type: 'lane_strike' });
    expect(b.state).toBe('transition'); // the transition itself runs on its own, untouched
    expect(b.transitionTicks).toBe(7);
    expect(b.attackTimer).toBe(attackTimerBefore); // every other per-tick hook stays frozen
  });
});

describe('Storm Tyrant — discharge', () => {
  it('discharges for 180 ticks after a strike, doubling damage taken', () => {
    const s = arena();
    const b = park(s);
    forceStrike(s, 3); // a lane nobody stands in; only the discharge matters here
    expect(b.discharged).toBe(TYRANT_DISCHARGE_TICKS);
    expect(s.events).toContainEqual({ tick: s.tick, type: 'boss_discharged' });
    const hpBefore = b.hp;
    damageBoss(s, 10);
    expect(b.hp).toBe(hpBefore - 20);
  });

  it('is not decremented on the very tick it is set', () => {
    const s = arena();
    const b = park(s);
    forceStrike(s, 3);
    expect(b.discharged).toBe(TYRANT_DISCHARGE_TICKS); // not 179
  });

  it('counts back down to 0 and stops doubling damage', () => {
    const s = arena();
    const b = park(s);
    forceStrike(s, 3);
    ticks(s, TYRANT_DISCHARGE_TICKS);
    expect(b.discharged).toBe(0);
    const hpBefore = b.hp;
    damageBoss(s, 10);
    expect(b.hp).toBe(hpBefore - 10);
  });

  it('refreshes to 180 rather than stacking when a new strike lands while already discharged', () => {
    const s = arena();
    const b = park(s);
    forceStrike(s, 3);
    ticks(s, 50);
    expect(b.discharged).toBe(TYRANT_DISCHARGE_TICKS - 50);
    forceStrike(s, 4); // a fresh strike, a different lane
    expect(b.discharged).toBe(TYRANT_DISCHARGE_TICKS); // refreshed, not 180 + 129
  });

  it('never affects a boss of the first campaign, whatever b.discharged holds', () => {
    const s = createGame('tyrant-legacy-discharge', { ...PRACTICE_RUN, features: { boosts: false } });
    s.crabs = [];
    spawnBoss(s, 1); // Emerald
    s.boss!.discharged = 999; // hypothetically corrupted; dischargeMult is gated on kind, not just this
    const hpBefore = s.boss!.hp;
    damageBoss(s, 10);
    expect(s.boss!.hp).toBe(hpBefore - 10);
  });
});

describe('Storm Tyrant — attack', () => {
  it('forks a bolt pair every attack, no draw', () => {
    const s = arena();
    const b = park(s);
    const rng = scriptedRng({});
    s.rngBoss = rng.rng;
    b.attackTimer = 1;
    updateBoss(s);
    const bolts = s.enemyShots.filter((e) => e.kind === 'bolt');
    expect(bolts).toHaveLength(2);
    const m = muzzle(b);
    for (const bolt of bolts) {
      expect(bolt.x).toBe(m.x);
      expect(bolt.y).toBe(m.y);
    }
    expect(bolts[0]!.vx).toBe(-bolts[1]!.vx); // mirror-symmetric either side of straight down
    expect(bolts[0]!.vy).toBe(bolts[1]!.vy);
    expect(bolts[0]!.vy).toBeGreaterThan(0);
    expect(bolts[0]!.vx).toBe(idiv(BOLT_SPEED * isin(-BOLT_SPREAD), 1000));
    expect(bolts[0]!.vy).toBe(idiv(BOLT_SPEED * icos(-BOLT_SPREAD), 1000));
    expect(rng.log).toEqual([BOSS.attackJitter]); // only the unconditional redraw
  });

  it('adds no orb in phase 1', () => {
    const s = arena();
    const b = park(s);
    b.attackTimer = 1;
    updateBoss(s);
    expect(s.enemyShots.filter((e) => e.kind === 'orb')).toHaveLength(0);
  });

  it('adds one orb every other attack from phase 2, gated on none already alive, no extra draw', () => {
    const s = arena();
    const b = park(s);
    b.phase = 2;
    const rng = scriptedRng({});
    s.rngBoss = rng.rng;
    b.attackTimer = 1;
    updateBoss(s); // 1st phase-2 attack: burst 0->1, casts
    expect(s.enemyShots.filter((e) => e.kind === 'orb')).toHaveLength(1);
    b.attackTimer = 1;
    updateBoss(s); // 2nd: burst 1->0, no attempt
    expect(s.enemyShots.filter((e) => e.kind === 'orb')).toHaveLength(1);
    b.attackTimer = 1;
    updateBoss(s); // 3rd: burst 0->1, but one is already alive — gated
    expect(s.enemyShots.filter((e) => e.kind === 'orb')).toHaveLength(1);
    expect(rng.log).toEqual([BOSS.attackJitter, BOSS.attackJitter, BOSS.attackJitter]); // never a draw for the orb
  });

  it('casts a fresh orb once the old one is gone, on the next candidate attack', () => {
    const s = arena();
    const b = park(s);
    b.phase = 2;
    b.attackTimer = 1;
    updateBoss(s);
    s.enemyShots = s.enemyShots.filter((e) => e.kind !== 'orb'); // consumed
    b.attackTimer = 1;
    updateBoss(s); // burst -> 0, off beat
    expect(s.enemyShots.filter((e) => e.kind === 'orb')).toHaveLength(0);
    b.attackTimer = 1;
    updateBoss(s); // burst -> 1, none alive, casts
    expect(s.enemyShots.filter((e) => e.kind === 'orb')).toHaveLength(1);
  });

  it('keeps adding orbs the same way in phases 3 and 4', () => {
    for (const phase of [3, 4]) {
      const s = arena();
      const b = park(s);
      b.phase = phase;
      b.attackTimer = 1;
      updateBoss(s);
      expect(s.enemyShots.filter((e) => e.kind === 'orb')).toHaveLength(1);
    }
  });
});

describe('Storm Tyrant — escort', () => {
  it('sends a pair of bombardiers at the start of phase 2, marching right', () => {
    const s = arena();
    park(s);
    toPhase(s, 2);
    expect(s.squads).toHaveLength(1);
    expect(s.squads[0]).toMatchObject({ dir: 1, bossKind: 9, alive: 2 });
    const escort = s.crabs.filter((c) => c.squad === s.squads[0]!.id);
    expect(escort).toHaveLength(2);
    expect(escort.every((c) => c.type === 'bombardier')).toBe(true);
    for (const c of escort) expect(c.y).toBe(SQUAD_BAND.maxY);
  });

  it('sends a second pair at the start of phase 4, marching left', () => {
    const s = arena();
    park(s);
    toPhase(s, 4);
    const last = s.squads[s.squads.length - 1]!;
    expect(last).toMatchObject({ dir: -1, bossKind: 9, alive: 2 });
    const escort = s.crabs.filter((c) => c.squad === last.id);
    expect(escort.every((c) => c.type === 'bombardier')).toBe(true);
  });

  it('is all-bombardier regardless of which tier the pair template resolves', () => {
    expect(TYRANT_ESCORT).toEqual(['bombardier', 'bombardier', 'bombardier', 'bombardier', 'bombardier']);
  });

  describe('the escort cap', () => {
    it('spawns no pair at a phase start with 4 squad crabs already live', () => {
      const s = arena();
      park(s);
      spawnSquad(s, 'pair', TYRANT_ESCORT, 500, SQUAD_BAND.maxY, 1);
      s.squads[0]!.alive = TYRANT_ESCORT_CAP; // 4, at the cap
      const squadsBefore = s.squads.length;
      toPhase(s, 2);
      expect(s.squads).toHaveLength(squadsBefore); // skipped outright, no retry later
      expect(s.boss!.phase).toBe(2); // the phase itself still opened
    });

    it('spawns the pair at a phase start with only 3 squad crabs live', () => {
      const s = arena();
      park(s);
      spawnSquad(s, 'pair', TYRANT_ESCORT, 500, SQUAD_BAND.maxY, 1);
      s.squads[0]!.alive = TYRANT_ESCORT_CAP - 1; // 3, under the cap
      const squadsBefore = s.squads.length;
      toPhase(s, 2);
      expect(s.squads).toHaveLength(squadsBefore + 1); // the phase-2 pair spawned
    });

    it('sums Squad.alive across every squad, not just one', () => {
      const s = arena();
      park(s);
      spawnSquad(s, 'pair', TYRANT_ESCORT, 500, SQUAD_BAND.maxY, 1);
      spawnSquad(s, 'pair', TYRANT_ESCORT, 1500, SQUAD_BAND.maxY, 1);
      s.squads[0]!.alive = 2;
      s.squads[1]!.alive = 2; // 4 total, split across two squads
      const squadsBefore = s.squads.length;
      toPhase(s, 2);
      expect(s.squads).toHaveLength(squadsBefore); // still at the cap, still skipped
    });
  });
});

describe('Storm Tyrant — the RNG draw order', () => {
  it('draws facing, the attack jitter, then the initial ability timer at spawn, in that order', () => {
    const s = createGame('tyrant-order', { ...PRACTICE_RUN, features: { boosts: false } });
    s.crabs = [];
    const rng = scriptedRng({});
    s.rngBoss = rng.rng;
    spawnBoss(s, 9);
    expect(rng.log).toEqual([2, BOSS.attackJitter, 241]);
  });

  it('draws the attack jitter, then the lane draws and the ability redraw, when both fire the same tick', () => {
    const s = arena();
    const b = park(s);
    b.attackTimer = 1;
    b.abilityTimer = 1; // phase 1: 2 lane draws
    const rng = scriptedRng({});
    s.rngBoss = rng.rng;
    updateBoss(s);
    expect(rng.log).toEqual([BOSS.attackJitter, LANE_COUNT, LANE_COUNT, 241]);
  });

  it('draws nothing at all from tickThroughTransition, strike or no strike', () => {
    const s = arena();
    park(s);
    s.lanes = [2, 1]; // due to strike this very call
    const rng = scriptedRng({});
    s.rngBoss = rng.rng;
    updateBoss(s);
    expect(s.lanes).toEqual([]); // it did strike
    expect(rng.log).toEqual([]);
  });

  it('is deterministic over 2000 ticks', () => {
    const a = arena();
    const b = arena();
    for (let i = 0; i < 2000; i++) {
      step(a, INITIAL_INPUT);
      step(b, INITIAL_INPUT);
    }
    expect(hashState(a)).toBe(hashState(b));
  });
});

describe('Storm Tyrant — a full sequence through step()', () => {
  it('warns a lane Octopi stands in, strikes it after the warning runs out, discharges the boss, and doubles the next hit it takes', () => {
    const s = createGame('tyrant-flow', { ...PRACTICE_RUN, features: { boosts: false } });
    s.crabs = [];
    spawnBoss(s, 9);
    const b = s.boss!;
    b.attackTimer = 1_000_000; // isolate Stormlanes from the bolt/orb attack
    s.octopi.x = 500;
    const lane = laneOf(500);
    const input = { x: s.octopi.x, y: s.octopi.y }; // Octopi never drifts away from its own lane
    s.rngBoss = scriptedRng({}).rng; // every lane draw comes back 0; the collision walks the 2nd to lane 1
    b.abilityTimer = 1;
    const livesBefore = s.octopi.lives;

    step(s, input); // fires Stormlanes
    expect(s.lanes).toEqual([0, 65, 1, 65]);
    expect(lane).toBe(0); // x = 500 is inside lane 0, the one Octopi is warned in
    expect(s.events).toContainEqual({ tick: s.tick, type: 'lane_warning' });

    for (let i = 0; i < 64; i++) step(s, input); // 64 more ticks of countdown: 1 tick still left
    expect(s.octopi.lives).toBe(livesBefore);

    step(s, input); // the 65th countdown tick: both lanes strike
    expect(s.octopi.lives).toBe(livesBefore - 1);
    expect(s.lanes).toEqual([]);
    expect(s.events).toContainEqual({ tick: s.tick, type: 'lane_strike' });
    expect(s.events).toContainEqual({ tick: s.tick, type: 'boss_discharged' });
    expect(b.discharged).toBe(TYRANT_DISCHARGE_TICKS);

    const hpBeforeBoss = b.hp;
    s.shots.push({ x: b.x, y: b.y, vx: 0, vy: -240, kind: 'straight', data: 0 });
    step(s, input); // a player shot lands on the boss box while it is discharged
    expect(b.hp).toBe(hpBeforeBoss - 2); // doubled
  });
});
