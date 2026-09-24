import { describe, expect, it } from 'vitest';
import {
  BOSS, BOSS_HOOKS, BOSS_SHOT, FIELD_W, FIREWALL_SLOTS, INITIAL_INPUT, PRACTICE_RUN, SQUAD_BAND,
  SQUAD_GAP_X, TEMPLAR_GAP_MIN_DISTANCE, TEMPLAR_GAP_SLOTS, TEMPLAR_GUARD,
  TEMPLAR_SECOND_WALL_DELAY, TEMPLAR_SHIELD_DOWN, TEMPLAR_WINDUP, bossStats, createGame, damageBoss,
  firewallX, hashState, hitCrabs, idiv, kindForTier, muzzle, popSquads, snapshot, spawnBoss, step,
  updateBoss,
} from '../src';
import type { BossState, Bullet, GameState } from '../src';

/**
 * The Verdant Templar, boss kind 6. Every number below is in ticks at 60 Hz.
 *
 * The swing's rhythm and Bulwark work as described below — see
 * `sim/bosses/templar.ts`'s own doc comment for the cycle's four beats. The RNG draw order of one
 * cycle, which these tests pin (`rngBoss` only — the boss never touches another stream):
 *
 * 1. `nextInt(TEMPLAR_GAP_SLOTS)` — the doorway of the wall to come, drawn by `attack` at the very
 *    start of the wind-up so the renderer can telegraph it for all 45 ticks.
 * 2. `nextInt(BOSS.attackJitter)` — `attackDelay`'s jitter, drawn by `updateBoss` itself right
 *    after the attack hook returns. Its *value* no longer drives anything (`tick` overwrites the
 *    timer before this swing can run long enough to matter) but the draw itself still happens,
 *    unconditionally, for every boss kind.
 * 3. (phase 2 only) `nextInt(TEMPLAR_GAP_SLOTS)` — the doorway of the staggered second wall, drawn
 *    once when the first wall falls, 45 ticks after draw 1.
 * 4. `nextInt(BOSS.attackJitter)` — the *real* jitter for the next rest, drawn by `tick` the instant
 *    the shield comes back up (a draw that did not exist in the previous cadence, and it is
 *    what actually times the pause before the next wind-up).
 *
 * Off that cadence sit only the two shared timers: `secondaryDelay`'s `nextInt(73)` every time the
 * zigzag timer runs out and `nextAbilityTimer`'s `nextInt(241)` every time Bulwark does.
 */

/** The first three doorways of seed `templar`, measured once and pinned like a golden. */
const SEEDED_GAPS = [7, 6, 1];

/** A practice arena with the Templar on it: the practice wave is swept away, his warden line is not. */
function arena(seed = 'templar'): GameState {
  const s = createGame(seed, { ...PRACTICE_RUN, features: { boosts: false } });
  s.crabs = [];
  spawnBoss(s, 6);
  return s;
}

/** The same arena with the warden line swept away too, for the tests that watch the boss alone. */
function soloArena(seed = 'templar'): GameState {
  const s = arena(seed);
  s.crabs = [];
  s.squads = [];
  return s;
}

/**
 * A solo arena whose spawn-time draws (facing, `attackDelay(1)`, `secondaryDelay`,
 * `initialAbilityTimer`) come off a scripted `rng` instead of the seed, so a whole cycle's timing
 * can be pinned exactly.
 */
function scriptedArena(rng: GameState['rngBoss']): GameState {
  const s = createGame('templar-cycle', { ...PRACTICE_RUN, features: { boosts: false } });
  s.crabs = [];
  s.rngBoss = rng;
  spawnBoss(s, 6);
  s.crabs = [];
  s.squads = [];
  return s;
}

/** Parks the timers a test is not driving so nothing but the swing under test happens. */
function park(s: GameState): BossState {
  const b = s.boss!;
  b.attackTimer = 1_000_000;
  b.secondaryTimer = 1_000_000;
  b.abilityTimer = 1_000_000;
  return b;
}

/** Runs the boss `n` ticks. */
function ticks(s: GameState, n: number): void {
  for (let i = 0; i < n; i++) updateBoss(s);
}

/** Announces a swing on this very tick: the wind-up starts and `boss_windup` is raised. */
function announce(s: GameState): void {
  s.boss!.attackTimer = 1;
  updateBoss(s);
}

/** The slots of the firewall standing in `s` that carry no shot, ascending — the doorway. */
function doorway(s: GameState): number[] {
  const free: number[] = [];
  for (let i = 0; i < FIREWALL_SLOTS; i++) {
    if (!s.enemyShots.some((b) => b.kind === 'firewall' && b.x === firewallX(i))) free.push(i);
  }
  return free;
}

/** The firewall shots standing in `s`. */
function wall(s: GameState): Bullet[] {
  return s.enemyShots.filter((b) => b.kind === 'firewall');
}

/**
 * Drives the boss into phase 2 through a real hp threshold and its 120-tick transition. The guard is
 * opened by hand first: with the shield up not one point of damage lands, which is the whole boss.
 */
function toPhaseTwo(s: GameState): BossState {
  const b = s.boss!;
  b.shieldUp = 0;
  damageBoss(s, b.hp - idiv(b.maxHp, 2)); // hp <= maxHp * (maxPhases - phase) / maxPhases
  expect(b.state).toBe('transition');
  ticks(s, BOSS.transitionTicks);
  expect(b.phase).toBe(2);
  return b;
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

describe('Verdant Templar (kind 6) — the table row', () => {
  it('takes 700 hp, 2 phases and a 12 000 score base from the boss table', () => {
    expect(bossStats(6)).toEqual({ hp: 700, phases: 2, score: 12000 });
    const s = soloArena();
    expect(s.boss).toMatchObject({ kind: 6, hp: 700, maxHp: 700, phase: 1, maxPhases: 2 });
  });
});

describe('Verdant Templar — the shell shield', () => {
  it('stands with the shield up the moment the fight starts', () => {
    const s = soloArena();
    expect(s.boss!.shieldUp).toBe(1);
  });

  it('eats a player hit with `boss_block` and no hp lost while the shield is up', () => {
    const s = soloArena();
    const b = s.boss!;
    damageBoss(s, 1);
    expect(b.hp).toBe(700);
    expect(s.events).toContainEqual({ tick: s.tick, type: 'boss_block' });
  });

  it('packs the shield and the doorway into the frame for the renderer', () => {
    const s = soloArena();
    park(s);
    expect(snapshot(s).boss).toMatchObject({ shieldUp: 1, gapSlot: s.boss!.gapSlot });
    announce(s);
    ticks(s, TEMPLAR_WINDUP - 1);
    expect(snapshot(s).boss).toMatchObject({ shieldUp: 0, gapSlot: s.boss!.gapSlot });
  });
});

describe('Verdant Templar — the sword swing', () => {
  it('opens every attack with a 45-tick wind-up, a `boss_windup` event and a drawn doorway', () => {
    const s = soloArena();
    const b = park(s);
    announce(s);
    expect(s.events).toContainEqual({ tick: s.tick, type: 'boss_windup' });
    expect(b.windup).toBe(TEMPLAR_WINDUP - 1); // this very tick was the wind-up's first
    expect(b.gapSlot).toBeGreaterThanOrEqual(0);
    expect(b.gapSlot).toBeLessThanOrEqual(TEMPLAR_GAP_SLOTS - 1);
    expect(b.shieldUp).toBe(1); // the shield only drops when the wind-up runs out
    expect(wall(s)).toHaveLength(0);
  });

  it('holds the drawn doorway still for the whole wind-up, so the renderer can telegraph it', () => {
    const s = soloArena();
    const b = park(s);
    announce(s);
    const gap = b.gapSlot;
    for (let i = 0; i < TEMPLAR_WINDUP - 1; i++) {
      updateBoss(s);
      expect(b.gapSlot).toBe(gap);
    }
    expect(doorway(s)).toEqual([gap, gap + 1]);
  });

  it('lays the wall at the boss muzzle on the 45th tick of the wind-up, never before', () => {
    const s = soloArena();
    const b = park(s);
    announce(s);
    ticks(s, TEMPLAR_WINDUP - 2);
    expect(wall(s)).toHaveLength(0);
    const y = muzzle(b).y;
    updateBoss(s);
    const shots = wall(s);
    expect(shots).toHaveLength(FIREWALL_SLOTS - 2);
    for (const shot of shots) expect(shot).toMatchObject({ y, vx: 0, vy: BOSS_SHOT.speed });
    expect(doorway(s)).toEqual([b.gapSlot, b.gapSlot + 1]);
  });

  it('lays exactly one wall in phase 1', () => {
    const s = soloArena();
    park(s);
    announce(s);
    ticks(s, TEMPLAR_WINDUP - 1 + TEMPLAR_SECOND_WALL_DELAY + 10);
    expect(wall(s)).toHaveLength(FIREWALL_SLOTS - 2);
    expect(s.boss!.pending).toEqual([]);
  });

  it('drops the shield for exactly 120 ticks from the end of the wind-up', () => {
    const s = soloArena();
    const b = park(s);
    announce(s);
    ticks(s, TEMPLAR_WINDUP - 1);
    expect(b.shieldUp).toBe(0);
    ticks(s, TEMPLAR_SHIELD_DOWN - 1);
    expect(b.shieldUp).toBe(0);
    updateBoss(s);
    expect(b.shieldUp).toBe(1);
  });

  it('keeps windup and the shield-down window independent even if a new one is forced early', () => {
    // Holding the shared `attackTimer` through the whole of a swing means
    // natural cadence can no longer start a wind-up before the old shield-down window has run out
    // (see "the cycle" below for the natural-cadence pin). `announce()` forces one anyway, straight
    // through that hold — this only checks that `windup` and `effectTicks` still don't interfere
    // with each other if something ever does force an overlap by hand.
    const s = soloArena();
    const b = park(s);
    announce(s);
    ticks(s, TEMPLAR_WINDUP - 1); // the first wall falls, the shield drops
    ticks(s, TEMPLAR_SHIELD_DOWN - 10); // 10 ticks of the window left
    expect(b.shieldUp).toBe(0);
    announce(s); // a second wind-up starts while the shield is still down
    ticks(s, 9);
    expect({ shieldUp: b.shieldUp, windingUp: b.windup > 0 }).toEqual({ shieldUp: 1, windingUp: true });
    ticks(s, b.windup);
    expect(b.shieldUp).toBe(0);
    expect(wall(s)).toHaveLength(2 * (FIREWALL_SLOTS - 2));
  });

  it('takes damage only while the shield is down', () => {
    const s = soloArena();
    const b = park(s);
    announce(s);
    ticks(s, TEMPLAR_WINDUP - 1);
    damageBoss(s, 1);
    expect(b.hp).toBe(699);
    ticks(s, TEMPLAR_SHIELD_DOWN);
    expect(b.shieldUp).toBe(1);
    damageBoss(s, 1);
    expect(b.hp).toBe(699);
    expect(s.events.filter((e) => e.type === 'boss_block')).toHaveLength(1);
  });
});

describe('Verdant Templar — the cycle', () => {
  it('rests for the drawn attackDelay, winds up 45 ticks, stays down 120, then rests again on a fresh draw', () => {
    // Three width-61 draws happen before the second rest is over: the real draw for rest 1 (drawn
    // by `spawnBoss`), the shared reset's "wasted" draw the instant the first wind-up begins (its
    // value is thrown away — see the file's own doc comment, draw 2 of the cycle), and the real
    // draw for rest 2 the instant the shield returns. Jitter 0, 0, 30: rest 1 is 120 (jitter 0),
    // the wasted draw is irrelevant, rest 2 is 150 (jitter 30) — a different length, so it can only
    // be a fresh draw, not a leftover of rest 1's.
    const { rng } = scriptedRng({ [BOSS.attackJitter]: [0, 0, 30] });
    const s = scriptedArena(rng);
    const b = s.boss!;
    expect(b.phase).toBe(1);

    const REST_1 = BOSS.attackBase; // + jitter 0
    ticks(s, REST_1 - 1);
    expect({ shieldUp: b.shieldUp, windup: b.windup }).toEqual({ shieldUp: 1, windup: 0 });
    updateBoss(s); // attackTimer reaches 0: the wind-up begins, on schedule
    expect(s.events).toContainEqual({ tick: s.tick, type: 'boss_windup' });
    expect(b).toMatchObject({ shieldUp: 1, windup: TEMPLAR_WINDUP - 1 });

    ticks(s, TEMPLAR_WINDUP - 2);
    expect(b.shieldUp).toBe(1);
    expect(wall(s)).toHaveLength(0);
    updateBoss(s); // the 45th tick of the wind-up: the wall falls, the shield drops
    expect(b.shieldUp).toBe(0);
    expect(wall(s)).toHaveLength(FIREWALL_SLOTS - 2);

    ticks(s, TEMPLAR_SHIELD_DOWN - 1);
    expect(b.shieldUp).toBe(0);
    updateBoss(s); // the 120th tick down: the shield returns, and a fresh attackDelay is drawn
    expect(b).toMatchObject({ shieldUp: 1, windup: 0 });

    const REST_2 = BOSS.attackBase + 30; // the second scripted jitter — proves the draw is fresh
    ticks(s, REST_2 - 1);
    expect({ shieldUp: b.shieldUp, windup: b.windup }).toEqual({ shieldUp: 1, windup: 0 });
    updateBoss(s); // the second wind-up begins exactly on its own schedule — no overlap crept in
    expect(b).toMatchObject({ shieldUp: 1, windup: TEMPLAR_WINDUP - 1 });
  });

  it('keeps the shield up at least 45% of a long run in both phases', () => {
    // Every individual cycle already clears 45%: phase 1's rest is 120-180 ticks against a 165-tick
    // wind-up + down, phase 2's is 96-156 — worst case (120+45)/(120+45+120) = 57.9% and
    // (96+45)/(96+45+120) = 54.0%. The long run (the real seeded `rngBoss`, natural cadence, no
    // forcing) is the belt-and-braces measurement.
    for (const phase of [1, 2] as const) {
      const s = soloArena(`templar-uptime-${phase}`);
      s.boss!.phase = phase;
      let up = 0;
      const N = 6000;
      for (let i = 0; i < N; i++) {
        s.enemyShots = [];
        updateBoss(s);
        if (s.boss!.shieldUp === 1) up++;
      }
      expect(up / N).toBeGreaterThanOrEqual(0.45);
    }
  });

  it('casts a zigzag pair only when the shield was up at the start of that tick, and one appears within a few thousand ticks of phase 2', () => {
    const s = soloArena('templar-zigzag');
    s.boss!.phase = 2;
    let firstZigzagTick = -1;
    const N = 6000;
    for (let i = 0; i < N; i++) {
      const wasUp = s.boss!.shieldUp === 1;
      s.enemyShots = [];
      updateBoss(s);
      if (s.enemyShots.some((x) => x.kind === 'zigzag')) {
        expect(wasUp).toBe(true);
        if (firstZigzagTick < 0) firstZigzagTick = i;
      }
    }
    expect(firstZigzagTick).toBeGreaterThanOrEqual(0);
  });
});

describe('Verdant Templar — phase 2', () => {
  it('follows the first wall with a second one 30 ticks later, its doorway 3 slots away or more', () => {
    const s = soloArena();
    const b = toPhaseTwo(s);
    park(s);
    s.enemyShots = [];
    announce(s);
    ticks(s, TEMPLAR_WINDUP - 1);
    const first = b.gapSlot;
    expect(doorway(s)).toEqual([first, first + 1]);
    ticks(s, TEMPLAR_SECOND_WALL_DELAY - 1);
    expect(wall(s)).toHaveLength(FIREWALL_SLOTS - 2); // still only the first wall
    updateBoss(s);
    expect(wall(s)).toHaveLength(2 * (FIREWALL_SLOTS - 2));
    const second = wall(s).slice(FIREWALL_SLOTS - 2);
    const free: number[] = [];
    for (let i = 0; i < FIREWALL_SLOTS; i++) if (!second.some((x) => x.x === firewallX(i))) free.push(i);
    expect(free[1]! - free[0]!).toBe(1); // still a two-slot doorway
    expect(Math.abs(free[0]! - first)).toBeGreaterThanOrEqual(TEMPLAR_GAP_MIN_DISTANCE);
  });

  it('keeps the second doorway 3 slots clear of the first for every draw the boss can make', () => {
    for (let first = 0; first < TEMPLAR_GAP_SLOTS; first++) {
      for (let draw = 0; draw < TEMPLAR_GAP_SLOTS; draw++) {
        const s = soloArena();
        const b = park(s);
        b.phase = 2;
        s.rngBoss = scriptedRng({ [TEMPLAR_GAP_SLOTS]: [first, draw] }).rng;
        s.enemyShots = [];
        announce(s);
        ticks(s, TEMPLAR_WINDUP - 1 + TEMPLAR_SECOND_WALL_DELAY);
        const second = wall(s).slice(FIREWALL_SLOTS - 2);
        const free: number[] = [];
        for (let i = 0; i < FIREWALL_SLOTS; i++) if (!second.some((x) => x.x === firewallX(i))) free.push(i);
        expect({ first, draw, shots: second.length, width: free[1]! - free[0]! })
          .toEqual({ first, draw, shots: FIREWALL_SLOTS - 2, width: 1 });
        expect({ first, draw, distance: Math.abs(free[0]! - first) >= TEMPLAR_GAP_MIN_DISTANCE })
          .toEqual({ first, draw, distance: true });
      }
    }
  });

  it('throws zigzag pairs between swings while the shield is up', () => {
    const s = soloArena();
    const b = toPhaseTwo(s);
    park(s);
    s.enemyShots = [];
    const m = muzzle(b);
    b.secondaryTimer = 1;
    updateBoss(s);
    const zig = s.enemyShots.filter((x) => x.kind === 'zigzag');
    expect(zig).toHaveLength(2);
    expect(zig[0]!.vx).toBe(-zig[1]!.vx);
    expect(zig.map((x) => x.y)).toEqual([m.y, m.y]);
    expect(b.shieldUp).toBe(1); // a zigzag pair never opens the shield
  });

  it('throws no zigzag while the shield is down', () => {
    const s = soloArena();
    const b = toPhaseTwo(s);
    park(s);
    announce(s);
    ticks(s, TEMPLAR_WINDUP - 1);
    expect(b.shieldUp).toBe(0);
    s.enemyShots = [];
    b.secondaryTimer = 1;
    updateBoss(s);
    expect(s.enemyShots.filter((x) => x.kind === 'zigzag')).toHaveLength(0);
  });

  it('throws no zigzag at all in phase 1', () => {
    const s = soloArena();
    const b = park(s);
    expect(b.phase).toBe(1);
    b.secondaryTimer = 1;
    updateBoss(s);
    expect(s.enemyShots.filter((x) => x.kind === 'zigzag')).toHaveLength(0);
  });

  it('puts the shield back up and drops a queued wall the moment the fight turns to phase 2', () => {
    const s = soloArena();
    const b = park(s);
    announce(s);
    ticks(s, TEMPLAR_WINDUP - 1);
    expect(b.shieldUp).toBe(0);
    b.pending = [10, 10]; // a staggered wall still queued, cancelled by the turn
    damageBoss(s, b.hp - idiv(b.maxHp, 2));
    expect(b.state).toBe('transition');
    expect(b).toMatchObject({ shieldUp: 1, windup: 0, pending: [] });
    ticks(s, BOSS.transitionTicks);
    expect(b).toMatchObject({ phase: 2, state: 'fighting', shieldUp: 1, windup: 0 });
  });
});

describe('Verdant Templar — the warden line', () => {
  it('raises a line of four wardens at the fight start, centred below the boss box', () => {
    const s = arena();
    expect(s.squads).toEqual([{ id: 1, dir: 1, bossKind: 6, alive: 4 }]);
    expect(s.crabs).toHaveLength(4);
    for (const c of s.crabs) {
      expect(c.type).toBe('warden');
      expect(c.squad).toBe(1);
      expect(c.y).toBe(SQUAD_BAND.maxY);
    }
    const xs = s.crabs.map((c) => c.x);
    expect(xs[1]! - xs[0]!).toBe(SQUAD_GAP_X);
    expect(idiv(xs[0]! + xs[3]!, 2)).toBe(idiv(FIELD_W, 2));
  });

  it('fields a roster whose tier 1 — the whole of `line4` — is the warden', () => {
    expect(TEMPLAR_GUARD).toEqual(['warden', 'warden', 'warden', 'warden', 'warden']);
    expect(kindForTier(TEMPLAR_GUARD, 1)).toBe('warden');
  });

  it('raises a second line at the start of phase 2, even with the first one still standing', () => {
    const s = arena();
    toPhaseTwo(s);
    expect(s.squads.map((q) => q.id)).toEqual([1, 2]);
    expect(s.crabs).toHaveLength(8);
    for (const c of s.crabs) expect(c.type).toBe('warden');
  });

  it('lets a piercing shot through the line and into the boss while the shield is down', () => {
    const s = arena();
    const b = park(s);
    announce(s);
    ticks(s, TEMPLAR_WINDUP - 1);
    expect(b.shieldUp).toBe(0);
    const guard = s.crabs[0]!;
    s.shots = [{ x: guard.x, y: guard.y, vx: 0, vy: -240, kind: 'straight', data: 1 }];
    hitCrabs(s);
    expect(s.shots).toHaveLength(1); // the rune shield does not stop a piercing shot
    expect(guard.hp).toBe(1);
    s.shots[0]!.x = b.x;
    s.shots[0]!.y = b.y;
    hitCrabs(s);
    expect(b.hp).toBe(699);
  });

  it('still blocks a piercing shot while the shield is up', () => {
    const s = arena();
    const b = park(s);
    s.shots = [{ x: b.x, y: b.y, vx: 0, vy: -240, kind: 'straight', data: 1 }];
    hitCrabs(s);
    expect(b.hp).toBe(700);
    expect(s.events).toContainEqual({ tick: s.tick, type: 'boss_block' });
  });
});

describe('Verdant Templar — Bulwark refills the wall', () => {
  it('raises a second line4 of four wardens when fewer than four squad crabs stand and the shield is up', () => {
    const s = arena(); // the fight-start line4: squad 1, four wardens
    const b = park(s);
    s.crabs = s.crabs.slice(0, 3); // thin the escort to three
    b.abilityTimer = 1;
    updateBoss(s);
    expect(s.events).toContainEqual({ tick: s.tick, type: 'boss_ability', name: 'shield' });
    expect(s.squads.map((q) => q.id)).toEqual([1, 2]);
    const refilled = s.crabs.filter((c) => c.squad === 2);
    expect(refilled).toHaveLength(4);
    for (const c of refilled) expect(c.type).toBe('warden');
  });

  it('does nothing while the shield is down, even with the escort wiped out', () => {
    const s = arena();
    const b = park(s);
    announce(s);
    ticks(s, TEMPLAR_WINDUP - 1);
    expect(b.shieldUp).toBe(0);
    s.crabs = [];
    s.squads = [];
    b.abilityTimer = 1;
    updateBoss(s);
    expect(s.events.filter((e) => e.type === 'boss_ability')).toHaveLength(0);
    expect(s.squads).toEqual([]);
  });

  it('does nothing when four or more squad crabs already stand, even with the shield up', () => {
    const s = arena(); // already four wardens standing
    const b = park(s);
    b.abilityTimer = 1;
    updateBoss(s);
    expect(s.events).toContainEqual({ tick: s.tick, type: 'boss_ability', name: 'shield' });
    expect(s.squads.map((q) => q.id)).toEqual([1]); // no refill
    expect(s.crabs).toHaveLength(4);
  });
});

describe('Verdant Templar — Bulwark and the RNG', () => {
  it('times Bulwark at 8 to 12 seconds, at the fight start and after every use', () => {
    const hooks = BOSS_HOOKS[6];
    for (const timer of [hooks.initialAbilityTimer, hooks.nextAbilityTimer]) {
      const low = scriptedRng({ 241: [0] });
      expect(timer(low.rng)).toBe(480);
      expect(low.log).toEqual([241]);
      const high = scriptedRng({ 241: [240] });
      expect(timer(high.rng)).toBe(720);
    }
  });

  it('plants the shield on the Bulwark timer, and stays out of a swing that is resolving', () => {
    const up = soloArena();
    const b = park(up);
    b.abilityTimer = 1;
    updateBoss(up);
    expect(up.events).toContainEqual({ tick: up.tick, type: 'boss_ability', name: 'shield' });
    expect(b.shieldUp).toBe(1);

    const down = soloArena();
    const d = park(down);
    announce(down);
    ticks(down, TEMPLAR_WINDUP - 1);
    expect(d.shieldUp).toBe(0);
    d.abilityTimer = 1;
    updateBoss(down);
    expect(d.shieldUp).toBe(0); // Bulwark never cuts the player's window short
    expect(down.events.filter((e) => e.type === 'boss_ability')).toHaveLength(0);
  });

  it('pays the table score and takes its escort with it when it falls', () => {
    const s = arena();
    const b = s.boss!;
    b.shieldUp = 0;
    damageBoss(s, b.hp);
    expect(s.boss).toBeNull();
    expect(s.score).toBe(bossStats(6).score); // no decay: the fight lasted no ticks at all
    // The pop is no longer synchronous inside `damageBoss` — it runs once
    // at the end of the tick, from `step.ts`; a direct `damageBoss` call with no `step()` around it
    // needs its own explicit `popSquads` to see the escort actually cleared.
    expect(s.crabs).not.toEqual([]);
    popSquads(s);
    expect(s.crabs).toEqual([]);
    expect(s.squads).toEqual([]);
    expect(s.events.filter((e) => e.type === 'squad_popped')).toHaveLength(1);
  });

  it('draws the doorway then the attack delay on a phase-1 swing, and one more doorway in phase 2', () => {
    const one = soloArena();
    park(one);
    const first = scriptedRng({});
    one.rngBoss = first.rng;
    announce(one);
    ticks(one, TEMPLAR_WINDUP - 1 + TEMPLAR_SECOND_WALL_DELAY);
    expect(first.log).toEqual([TEMPLAR_GAP_SLOTS, BOSS.attackJitter]);

    const two = soloArena();
    const b = park(two);
    b.phase = 2;
    const second = scriptedRng({});
    two.rngBoss = second.rng;
    announce(two);
    expect(second.log).toEqual([TEMPLAR_GAP_SLOTS, BOSS.attackJitter]);
    ticks(two, TEMPLAR_WINDUP - 1);
    expect(second.log).toEqual([TEMPLAR_GAP_SLOTS, BOSS.attackJitter, TEMPLAR_GAP_SLOTS]);
    ticks(two, TEMPLAR_SECOND_WALL_DELAY);
    expect(second.log).toEqual([TEMPLAR_GAP_SLOTS, BOSS.attackJitter, TEMPLAR_GAP_SLOTS]);
  });

  it('draws its doorways off `rngBoss`, so one seed always fights the same fight', () => {
    const gaps = (seed: string): number[] => {
      const s = soloArena(seed);
      const b = s.boss!;
      const seen: number[] = [];
      for (let i = 0; i < 3; i++) {
        announce(s);
        seen.push(b.gapSlot);
        ticks(s, TEMPLAR_WINDUP - 1);
      }
      return seen;
    };
    expect(gaps('templar')).toEqual(gaps('templar'));
    expect(gaps('templar')).toEqual(SEEDED_GAPS);
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

describe('Verdant Templar — the shared constants', () => {
  it('draws its doorway from the slots `castFirewall` accepts, one short of the wall', () => {
    expect(TEMPLAR_GAP_SLOTS).toBe(FIREWALL_SLOTS - 1);
  });
});
