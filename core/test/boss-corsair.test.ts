import { describe, expect, it } from 'vitest';
import {
  AXE_FALL_TICKS, AXE_TARGETS, AXE_TARGET_COUNT, BOSS, BOSS_HOOKS, CORSAIR_CREW_CAP, CORSAIR_ROSTER,
  CORSAIR_SPIKES_TICKS, CORSAIR_SPIKES_WINDUP, DROP, FIELD_W, INITIAL_INPUT, MARCH_MARGIN, PRACTICE_RUN,
  SQUAD_BAND, SQUAD_ROW_GAP, activateBoost, bossStats, createGame, damageBoss, hashState, idiv,
  muzzle, spawnBoss, spawnSquad, squadStep, step, updateBoss,
} from '../src';
import type { BossState, GameState } from '../src';

/** The `vx` `castAxe` gives a throw turning over `targetX` from `fromX` (`sim/boss.ts`'s own formula). */
function axeVx(fromX: number, targetX: number): number {
  return idiv(targetX - fromX, AXE_FALL_TICKS);
}

/**
 * Gold Corsair, boss kind 8. Every number below is in ticks at 60 Hz.
 * `sim/bosses/corsair.ts`'s own doc comment explains the reused `BossState`
 * fields (`windup`, `effectTicks`, `burst`), the crew cap's exact rule, the `onHit` extension
 * and the RNG draw order pinned here.
 */

/** A practice arena with the Corsair on it, the practice wave swept away. */
function arena(seed = 'corsair'): GameState {
  const s = createGame(seed, { ...PRACTICE_RUN, features: { boosts: false } });
  s.crabs = [];
  spawnBoss(s, 8);
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

/** Drives the boss down through both transitions into phase 3. Zero fighting ticks elapse in phase 1 or 2, so their timers never get a chance to fire in between. */
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

describe('Gold Corsair (kind 8) — the table row', () => {
  it('takes 900 hp, 3 phases and a 16 000 score base from the boss table', () => {
    expect(bossStats(8)).toEqual({ hp: 900, phases: 3, score: 16000 });
    const s = arena();
    expect(s.boss).toMatchObject({ kind: 8, hp: 900, maxHp: 900, phase: 1, maxPhases: 3 });
  });

  it('pays the table score when it falls', () => {
    const s = arena();
    damageBoss(s, s.boss!.hp);
    expect(s.boss).toBeNull();
    expect(s.score).toBe(16000);
  });
});

describe('Gold Corsair — Boarding timer', () => {
  it('times Boarding at 7 to 15 seconds, at the fight start and after every use', () => {
    const hooks = BOSS_HOOKS[8];
    for (const timer of [hooks.initialAbilityTimer, hooks.nextAbilityTimer]) {
      const low = scriptedRng({ 481: [0] });
      expect(timer(low.rng)).toBe(420);
      expect(low.log).toEqual([481]);
      const high = scriptedRng({ 481: [480] });
      expect(timer(high.rng)).toBe(900);
    }
  });
});

describe('Gold Corsair — Boarding (the ability)', () => {
  it('sends a crew of four heralds over four heavy crabs in from a corner, marching towards the centre', () => {
    const s = arena();
    const b = park(s);
    s.rngBoss = scriptedRng({ 2: [0] }).rng; // side 0: left
    b.abilityTimer = 1;
    updateBoss(s);
    expect(s.crabs).toHaveLength(8);
    expect(s.squads).toEqual([{ id: 1, dir: 1, bossKind: 8, alive: 8 }]); // left entry marches right, towards the centre
    const top = s.crabs.slice(0, 4);
    const bottom = s.crabs.slice(4);
    expect(top.map((c) => c.type)).toEqual(['herald', 'herald', 'herald', 'herald']);
    expect(bottom.map((c) => c.type)).toEqual(['heavy', 'heavy', 'heavy', 'heavy']);
    for (const c of top) expect(c.y).toBe(SQUAD_BAND.maxY); // the crew's anchor row
    for (const c of bottom) expect(c.y).toBe(SQUAD_BAND.maxY + SQUAD_ROW_GAP); // the row below it
    // The outer (leftmost) column sits exactly on the march margin.
    expect(Math.min(...s.crabs.map((c) => c.x))).toBe(MARCH_MARGIN);
  });

  it('enters from the right at the opposite margin, marching left towards the centre', () => {
    const s = arena();
    const b = park(s);
    s.rngBoss = scriptedRng({ 2: [1] }).rng; // side 1: right
    b.abilityTimer = 1;
    updateBoss(s);
    expect(s.squads).toEqual([{ id: 1, dir: -1, bossKind: 8, alive: 8 }]);
    expect(Math.max(...s.crabs.map((c) => c.x))).toBe(FIELD_W - MARCH_MARGIN);
  });

  it('uses the reef-8 roster in tier order', () => {
    expect(CORSAIR_ROSTER).toEqual(['armored', 'heavy', 'warden', 'herald', 'bubbler']);
  });

  it('re-arms without spawning once 8 squad crabs already live, but still draws the side', () => {
    const s = arena();
    const b = park(s);
    spawnSquad(s, 'crew', CORSAIR_ROSTER, idiv(FIELD_W, 2), SQUAD_BAND.maxY, 1); // 8 squad crabs already up
    expect(s.crabs).toHaveLength(8);
    const rng = scriptedRng({ 2: [0] });
    s.rngBoss = rng.rng;
    b.abilityTimer = 1;
    updateBoss(s);
    expect(s.crabs).toHaveLength(8); // no second crew appeared
    expect(s.squads).toHaveLength(1);
    // The draw still happened (fixed draw count), followed by the unconditional ability-timer redraw.
    expect(rng.log).toEqual([2, 481]);
  });

  it('lets a second crew stand alongside a thinned-out first one, below the 8-crab threshold', () => {
    const s = arena();
    const b = park(s);
    spawnSquad(s, 'crew', CORSAIR_ROSTER, idiv(FIELD_W, 2), SQUAD_BAND.maxY, 1); // 8 crabs
    s.crabs = s.crabs.slice(0, 3); // thin it to 3, well under the cap
    s.rngBoss = scriptedRng({ 2: [1] }).rng;
    b.abilityTimer = 1;
    updateBoss(s);
    expect(s.crabs.length).toBe(3 + 8); // the old remnant plus a fresh crew
    expect(s.squads).toHaveLength(2);
  });
});

describe('Gold Corsair — loot', () => {
  it('drops a guaranteed boost where the last crab of a wiped crew died, event crew_looted', () => {
    const s = createGame('corsair-loot', { ...PRACTICE_RUN, features: { boosts: true } });
    s.crabs = [];
    spawnBoss(s, 8);
    spawnSquad(s, 'crew', ['armored'], idiv(FIELD_W, 2), SQUAD_BAND.maxY, 1);
    expect(s.crabs).toHaveLength(8);
    // Only the last crab of the crew is left standing (backstory: the other 7 already died earlier —
    // `alive` is set to match, since it is now the wipe detector, not a scan
    // of `s.crabs`). Killing this one through a real player shot is the whole-crew wipe.
    const last = s.crabs[7]!;
    last.hp = 1;
    s.crabs = [last];
    s.squads[0]!.alive = 1;
    // The shot is placed one tick's march ahead of the crab's own current spot: `step()` marches the
    // squad (`marchCrabs`/`marchSquads`) before it collides shots (`hitCrabs`), so the crab is not
    // where it started by the time it actually dies this same tick.
    const marched = last.x + squadStep(s, s.squads[0]!.dir);
    s.shots.push({ x: marched, y: last.y, vx: 0, vy: -240, kind: 'straight', data: 0 });
    const before = s.drops.length;
    step(s, INITIAL_INPUT);
    expect(s.crabs).toEqual([]);
    expect(s.drops.length).toBe(before + 1);
    const drop = s.drops[s.drops.length - 1]!;
    // `last` is the same object `marchSquads` mutated in place before `killCrab` ever ran, so its own
    // x/y already reflect where it actually died — the position the loot drop is spec'd to land on.
    // `y` is one `DROP.fall` further down than that: `updateBoosts` (later in this same `step()`)
    // advances every drop's own fall once per tick, including one `spawnDrop` just pushed.
    expect(drop.x).toBe(last.x);
    expect(drop.y).toBe(last.y + DROP.fall);
    expect(s.events).toContainEqual({ tick: s.tick, type: 'crew_looted' });
  });

  it('drops nothing for a crew still standing when the boss dies (popSquads, not a wipe)', () => {
    const s = createGame('corsair-no-loot', { ...PRACTICE_RUN, features: { boosts: true } });
    s.crabs = [];
    spawnBoss(s, 8);
    spawnSquad(s, 'crew', CORSAIR_ROSTER, idiv(FIELD_W, 2), SQUAD_BAND.maxY, 1);
    expect(s.crabs).toHaveLength(8);
    s.boss!.hp = 1; // one shot kills the boss outright
    s.shots.push({ x: s.boss!.x, y: s.boss!.y, vx: 0, vy: -240, kind: 'straight', data: 0 });
    const before = s.drops.length;
    step(s, INITIAL_INPUT); // damageBoss marks the boss dead; popSquads (step.ts, end of this tick) removes the crew
    expect(s.boss).toBeNull();
    expect(s.squads).toEqual([]);
    // Not `s.crabs` itself: this is a practice round, and `nextWave` (also called from this same
    // `step()`, once `s.crabs.length === 0 && s.boss === null`) immediately spawns a fresh, ordinary
    // wave — pre-existing practice-mode behaviour, unrelated to this fix. No *squad* crab survives.
    expect(s.crabs.some((c) => c.squad > 0)).toBe(false);
    expect(s.drops.length).toBe(before); // no loot: the whole crew went with its boss, not a wipe
    expect(s.events.filter((e) => e.type === 'crew_looted')).toHaveLength(0);
    expect(s.events.filter((e) => e.type === 'squad_popped')).toHaveLength(1);
  });

  it('does not loot a wave crab, or a squad crab of a different boss', () => {
    const s = createGame('corsair-not-mine', { ...PRACTICE_RUN, features: { boosts: true } });
    s.crabs = [];
    spawnBoss(s, 1); // Emerald, not the Corsair
    spawnSquad(s, 'crew', ['armored'], idiv(FIELD_W, 2), SQUAD_BAND.maxY, 1);
    s.crabs = [s.crabs[7]!];
    s.squads[0]!.alive = 1; // matches the truncation above
    const c = s.crabs[0]!;
    c.hp = 1;
    s.shots.push({ x: c.x, y: c.y, vx: 0, vy: -240, kind: 'straight', data: 0 });
    step(s, INITIAL_INPUT);
    expect(s.crabs).toEqual([]);
    expect(s.events.filter((e) => e.type === 'crew_looted')).toHaveLength(0);
  });

  describe('the alive count, not a live scan of s.crabs', () => {
    it('a crew finished off by WAVE_BLAST in one batch still loots exactly once', () => {
      const s = createGame('corsair-waveblast', { ...PRACTICE_RUN, features: { boosts: true } });
      s.crabs = [];
      spawnBoss(s, 8);
      // A one-row squad, both crabs sharing one y, so WAVE_BLAST's own bottom-row band takes both in
      // the very same call — the exact scenario an earlier version got wrong: `applyWaveBlast`
      // (`sim/boostEffects.ts`) computes its whole kill list against the *original* `s.crabs` and
      // only removes the dead in one batch afterwards, so a live scan for "any survivor left" would
      // always find the crew's own still-present, doomed-but-not-yet-removed crab-mate and never
      // detect the wipe at all. Counting `alive` down needs no `s.crabs` snapshot to agree with.
      spawnSquad(s, 'pair', ['armored'], idiv(FIELD_W, 2), SQUAD_BAND.minY, 1);
      expect(s.crabs).toHaveLength(2);
      expect(s.squads[0]!.alive).toBe(2);
      const before = s.drops.length;
      activateBoost(s, 'WAVE_BLAST');
      expect(s.crabs).toEqual([]);
      expect(s.squads[0]!.alive).toBe(0);
      expect(s.drops.length).toBe(before + 1);
      expect(s.events.filter((e) => e.type === 'crew_looted')).toHaveLength(1);
    });

    it('a crew whose last crab and the boss both die in the same tick still loots, boss-killing shot first', () => {
      const s = createGame('corsair-same-tick', { ...PRACTICE_RUN, features: { boosts: true } });
      s.crabs = [];
      spawnBoss(s, 8);
      spawnSquad(s, 'crew', ['armored'], idiv(FIELD_W, 2), SQUAD_BAND.maxY, 1);
      const last = s.crabs[7]!;
      last.hp = 1;
      s.crabs = [last]; // backstory: the other 7 already died; alive matches, as above
      s.squads[0]!.alive = 1;
      s.boss!.hp = 1; // the one shot below kills the boss outright
      // The boss-killing shot sits FIRST in `s.shots`: `hitCrabs` (`sim/collide.ts`) iterates that
      // array in order, so with the *old* synchronous `popSquads` inside `damageBoss` this order
      // would have removed `last` from `s.crabs` before the loop ever reached the crab-killing shot
      // below — losing the loot to nothing but shot order.
      // `popSquads` no longer runs until the end of the tick (`step.ts`), so `last` is
      // still there when its own shot's turn comes.
      s.shots.push({ x: s.boss!.x, y: s.boss!.y, vx: 0, vy: -240, kind: 'straight', data: 0 });
      const marched = last.x + squadStep(s, s.squads[0]!.dir);
      s.shots.push({ x: marched, y: last.y, vx: 0, vy: -240, kind: 'straight', data: 0 });
      const before = s.drops.length;
      step(s, INITIAL_INPUT);
      expect(s.boss).toBeNull();
      expect(s.squads).toEqual([]); // popped at the end of this same tick, after the loot already fired
      // Not `s.crabs` itself: this is a practice round, and `nextWave` spawns a fresh, ordinary wave
      // the instant both crabs and boss are gone — pre-existing practice-mode behaviour, unrelated to
      // this fix. No *squad* crab survives.
      expect(s.crabs.some((c) => c.squad > 0)).toBe(false);
      expect(s.drops.length).toBe(before + 1);
      expect(s.events).toContainEqual({ tick: s.tick, type: 'crew_looted' });
    });
  });
});

describe('Gold Corsair — axe throw', () => {
  it('spreads AXE_TARGETS evenly inside the march margins, first at the margin, last near the far one', () => {
    expect(AXE_TARGETS).toHaveLength(AXE_TARGET_COUNT);
    expect(AXE_TARGETS[0]).toBe(MARCH_MARGIN);
    expect(AXE_TARGETS[AXE_TARGET_COUNT - 1]!).toBeGreaterThan(FIELD_W - MARCH_MARGIN - 5);
    expect(AXE_TARGETS[AXE_TARGET_COUNT - 1]!).toBeLessThanOrEqual(FIELD_W - MARCH_MARGIN);
    const gaps = AXE_TARGETS.slice(1).map((x, i) => x - AXE_TARGETS[i]!);
    for (const g of gaps) expect(g).toBe(gaps[0]);
  });

  it('throws one axe at a drawn target in phase 1', () => {
    const s = arena();
    const b = park(s);
    s.rngBoss = scriptedRng({ 5: [2] }).rng;
    b.attackTimer = 1;
    updateBoss(s);
    const axes = s.enemyShots.filter((e) => e.kind === 'axe');
    expect(axes).toHaveLength(1);
    expect(axes[0]!.x).toBe(muzzle(b).x);
    expect(axes[0]!.y).toBe(muzzle(b).y);
  });

  it('throws two axes from phase 2 on, the second at (first + 2) mod 5, no extra draw', () => {
    const s = arena();
    const b = park(s);
    b.phase = 2;
    const rng = scriptedRng({ 5: [3] });
    s.rngBoss = rng.rng;
    b.attackTimer = 1;
    updateBoss(s);
    const axes = s.enemyShots.filter((e) => e.kind === 'axe');
    expect(axes).toHaveLength(2);
    const m = muzzle(b);
    expect(axes[0]!.vx).toBe(axeVx(m.x, AXE_TARGETS[3]!)); // the drawn index
    expect(axes[1]!.vx).toBe(axeVx(m.x, AXE_TARGETS[(3 + 2) % AXE_TARGET_COUNT]!)); // (3+2) mod 5 = 0
    expect(rng.log).toEqual([5, BOSS.attackJitter]); // one target draw only
  });

  it('keeps throwing two axes in phase 3', () => {
    const s = arena();
    const b = park(s);
    b.phase = 3;
    b.attackTimer = 1;
    updateBoss(s);
    expect(s.enemyShots.filter((e) => e.kind === 'axe')).toHaveLength(2);
  });
});

describe('Gold Corsair — Spikes (phase 3)', () => {
  it('alternates: odd ability firings send a crew, even firings raise Spikes', () => {
    const s = arena();
    const b = toPhaseThree(s);
    park(s);

    // Firing 1 (odd): a crew.
    s.crabs = [];
    s.squads = [];
    b.abilityTimer = 1;
    updateBoss(s);
    expect(s.crabs.length).toBeGreaterThan(0);
    expect(b.windup).toBe(0);

    // Firing 2 (even): Spikes.
    b.abilityTimer = 1;
    updateBoss(s);
    // `ability` sets `windup` fresh, but this same `updateBoss` call's own `tick` hook (which always
    // runs after `ability`) already spends the first one of them — the same one-tick-elapsed-already
    // reading `boss-templar.test.ts` pins for the Verdant Templar's own wind-up.
    expect(b.windup).toBe(CORSAIR_SPIKES_WINDUP - 1);
    expect(s.events).toContainEqual({ tick: s.tick, type: 'boss_windup' });

    // Let the flash burn out on its own tick clock: exactly `b.windup` more ticks lands on the one
    // that opens the reflect window fresh, with no tick of it yet spent.
    ticks(s, b.windup);
    expect(b.windup).toBe(0);
    expect(b.effectTicks).toBe(CORSAIR_SPIKES_TICKS);

    // Firing 3 (odd again): back to a crew.
    s.crabs = [];
    s.squads = [];
    b.abilityTimer = 1;
    updateBoss(s);
    expect(s.crabs.length).toBeGreaterThan(0);
  });

  it('draws nothing for a Spikes firing', () => {
    const s = arena();
    const b = toPhaseThree(s);
    park(s);
    b.burst = 1; // the next firing is Spikes
    const rng = scriptedRng({});
    s.rngBoss = rng.rng;
    b.abilityTimer = 1;
    updateBoss(s);
    expect(rng.log).toEqual([481]); // only the unconditional ability-timer redraw
  });

  it('reflects a player hit for no damage, casting a straight shot from the impact x', () => {
    const s = arena();
    const b = toPhaseThree(s);
    park(s);
    b.burst = 1;
    b.abilityTimer = 1;
    updateBoss(s); // raises Spikes' flash (this call's own `tick` already spends the flash's first tick)
    ticks(s, b.windup); // exactly enough more ticks to open the reflect window fresh
    expect(b.effectTicks).toBe(CORSAIR_SPIKES_TICKS);

    const hpBefore = b.hp;
    const impactX = b.x - 500;
    s.shots = [{ x: impactX, y: b.y, vx: 0, vy: -240, kind: 'straight', data: 0 }];
    step(s, INITIAL_INPUT);
    expect(b.hp).toBe(hpBefore); // no damage
    expect(s.shots).toEqual([]); // the shot is gone
    const reflected = s.enemyShots.filter((e) => e.kind === 'straight' && e.vy > 0);
    expect(reflected).toHaveLength(1);
    expect(reflected[0]).toMatchObject({ x: impactX, y: muzzle(b).y });
    expect(s.events).toContainEqual({ tick: s.tick, type: 'boss_reflect' });
  });

  it('reflects a piercing shot too, rather than letting it pass through', () => {
    const s = arena();
    const b = toPhaseThree(s);
    park(s);
    b.burst = 1;
    b.abilityTimer = 1;
    updateBoss(s);
    ticks(s, CORSAIR_SPIKES_WINDUP);
    const hpBefore = b.hp;
    s.shots = [{ x: b.x, y: b.y, vx: 0, vy: -240, kind: 'straight', data: 1 }]; // data & 1: piercing
    step(s, INITIAL_INPUT);
    expect(b.hp).toBe(hpBefore);
    expect(s.shots).toEqual([]); // consumed, not passed through
  });

  it('resumes normal damage once the reflect window runs out', () => {
    const s = arena();
    const b = toPhaseThree(s);
    park(s);
    b.burst = 1;
    b.abilityTimer = 1;
    updateBoss(s);
    ticks(s, CORSAIR_SPIKES_WINDUP + CORSAIR_SPIKES_TICKS); // flash, then the whole window
    expect(b.effectTicks).toBe(0);
    const hpBefore = b.hp;
    s.shots = [{ x: b.x, y: b.y, vx: 0, vy: -240, kind: 'straight', data: 0 }];
    step(s, INITIAL_INPUT);
    expect(b.hp).toBe(hpBefore - 1);
  });
});

describe('Gold Corsair — the RNG draw order', () => {
  it('draws direction, the attack jitter, then the initial ability timer at spawn, in that order', () => {
    const s = createGame('corsair-order', { ...PRACTICE_RUN, features: { boosts: false } });
    s.crabs = [];
    const rng = scriptedRng({});
    s.rngBoss = rng.rng;
    spawnBoss(s, 8);
    expect(rng.log).toEqual([2, BOSS.attackJitter, 481]);
  });

  it('draws the attack target, the attack jitter, the ability side, then the ability redraw', () => {
    const s = arena();
    const b = park(s);
    b.attackTimer = 1;
    b.abilityTimer = 1;
    const rng = scriptedRng({});
    s.rngBoss = rng.rng;
    updateBoss(s);
    expect(rng.log).toEqual([AXE_TARGET_COUNT, BOSS.attackJitter, 2, 481]);
  });

  it('is deterministic over 900 ticks', () => {
    const a = arena();
    const b = arena();
    for (let i = 0; i < 900; i++) {
      step(a, INITIAL_INPUT);
      step(b, INITIAL_INPUT);
    }
    expect(hashState(a)).toBe(hashState(b));
  });
});

describe('Gold Corsair — the crew cap constant', () => {
  it('is one crew\'s own size', () => {
    expect(CORSAIR_CREW_CAP).toBe(8);
  });
});
