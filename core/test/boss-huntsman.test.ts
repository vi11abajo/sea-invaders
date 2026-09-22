import { describe, expect, it } from 'vitest';
import {
  BOOSTS, BOSS, BOSS_HOOKS, FIELD_W, HUNTSMAN_GUARD, HUNTSMAN_GUARD_CAP, INITIAL_INPUT,
  NEEDLE_SPEED, PRACTICE_RUN, SQUAD_BAND, bossStats, clamp, createGame, damageBoss, hashState, idiv,
  isqrt, spawnBoss, spawnSquad, step, updateBoss, updateBoosts,
} from '../src';
import type { BossState, BoostType, GameState } from '../src';

/**
 * Abyssal Huntsman, boss kind 10 (spec §5.2 row 10), the last of the five reefs 6-10 bosses.
 * `sim/bosses/huntsman.ts`'s own doc comment explains the sight line / needle / burst rhythm, the
 * decoy geometry (Void Sovereign's own `castClone` formula, copied rather than imported), the
 * honour guard, the Mirror's three boost classes and the RNG draw order pinned here.
 */

/** A practice arena with the Huntsman on it, the practice wave swept away. */
function arena(seed = 'huntsman'): GameState {
  const s = createGame(seed, { ...PRACTICE_RUN, features: { boosts: false } });
  s.crabs = [];
  spawnBoss(s, 10);
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

describe('Abyssal Huntsman (kind 10) — the table row', () => {
  it('takes 1200 hp, 4 phases and a 20 000 score base from the boss table', () => {
    expect(bossStats(10)).toEqual({ hp: 1200, phases: 4, score: 20000 });
    const s = arena();
    expect(s.boss).toMatchObject({ kind: 10, hp: 1200, maxHp: 1200, phase: 1, maxPhases: 4 });
  });

  it('pays the table score when it falls', () => {
    const s = arena();
    damageBoss(s, s.boss!.hp);
    expect(s.boss).toBeNull();
    expect(s.score).toBe(20000);
  });
});

describe('Abyssal Huntsman — the sight line and the needle', () => {
  it('shows a fixed sight line for 40 ticks then fires a needle exactly along it, even if Octopi moves after', () => {
    const s = arena();
    const b = park(s);
    s.octopi.x = 2000;
    s.octopi.y = 6000;
    b.attackTimer = 1;
    updateBoss(s); // attack fires this call; this same call's own `tick` already ticks it down once
    expect(s.events).toContainEqual({ tick: s.tick, type: 'boss_aim' });
    expect(s.aims).toHaveLength(6);
    expect(s.aims[4]).toBe(0); // the real line, not a decoy (phase 1: no decoys anyway)
    expect(s.aims[2]).toBe(2000);
    expect(s.aims[3]).toBe(6000);
    expect(s.aims[5]).toBe(39);
    expect(b.aimX).toBe(2000);
    expect(b.aimTicks).toBe(39);
    const fromX = s.aims[0]!;
    const fromY = s.aims[1]!;

    s.octopi.x = 4500; // Octopi moves well away after the aim is fixed
    s.octopi.y = 9500;
    ticks(s, 38); // 39 -> 1
    expect(s.aims[5]).toBe(1);
    expect(s.enemyShots.filter((e) => e.kind === 'needle')).toHaveLength(0);

    ticks(s, 1); // the 40th tick since the attack: the needle flies
    expect(s.aims).toEqual([]); // the group is dropped the instant it fires
    const needle = s.enemyShots.find((e) => e.kind === 'needle');
    expect(needle).toBeDefined();
    expect(needle).toMatchObject({ x: fromX, y: fromY }); // flies from the muzzle, not from Octopi's new spot
    const dx = 2000 - fromX;
    const dy = 6000 - fromY;
    const len = isqrt(dx * dx + dy * dy);
    expect(needle!.vx).toBe(idiv(dx * NEEDLE_SPEED, len)); // aimed at the ORIGINAL (2000, 6000)
    expect(needle!.vy).toBe(idiv(dy * NEEDLE_SPEED, len));
    expect(b.burst).toBe(0); // phase 1: one needle, no re-aim
    expect(s.events.filter((e) => e.type === 'boss_aim')).toHaveLength(1); // one line, one boss_aim (ruling R51)
  });

  it('flies the needle at ×1.25 while the control mirror is up', () => {
    const s = arena();
    const b = park(s);
    s.octopi.x = 1500;
    s.octopi.y = 7000;
    b.attackTimer = 1;
    updateBoss(s);
    const fromX = s.aims[0]!;
    const fromY = s.aims[1]!;
    const toX = s.aims[2]!;
    const toY = s.aims[3]!;
    b.mirror[2] = 500; // control mirror active for when the needle fires
    ticks(s, 39); // fires on the 40th tick overall
    const needle = s.enemyShots.find((e) => e.kind === 'needle')!;
    const dx = toX - fromX;
    const dy = toY - fromY;
    const len = isqrt(dx * dx + dy * dy);
    const speed = idiv(NEEDLE_SPEED * 1250, 1000);
    expect(needle.vx).toBe(idiv(dx * speed, len));
    expect(needle.vy).toBe(idiv(dy * speed, len));
  });
});

describe('Abyssal Huntsman — the burst from phase 2', () => {
  it('fires three needles twelve ticks apart, each re-aimed to Octopi\'s position at that tick', () => {
    const s = arena();
    const b = park(s);
    b.phase = 2;
    s.octopi.x = 1000;
    s.octopi.y = 5500;
    b.attackTimer = 1;
    updateBoss(s); // starts the burst: b.burst = 3, the 40-tick opener drawn
    expect(b.burst).toBe(3);
    expect(s.events.filter((e) => e.type === 'boss_aim')).toHaveLength(1); // the opener's own line

    ticks(s, 39); // total 40: needle #1 fires, re-aim #1 (12 ticks) drawn to Octopi's current position
    expect(s.enemyShots.filter((e) => e.kind === 'needle')).toHaveLength(1);
    expect(b.burst).toBe(2);
    expect(s.aims).toHaveLength(6);
    expect(s.aims[5]).toBe(12);
    expect(s.aims[2]).toBe(1000);
    expect(s.aims[3]).toBe(5500);
    expect(s.events.filter((e) => e.type === 'boss_aim')).toHaveLength(2); // ruling R51: every line, not just the opener

    s.octopi.x = 3000; // Octopi moves before the second re-aim
    s.octopi.y = 8000;
    ticks(s, 12); // needle #2 fires; re-aim #2 drawn to Octopi's NEW position
    expect(s.enemyShots.filter((e) => e.kind === 'needle')).toHaveLength(2);
    expect(b.burst).toBe(1);
    expect(s.aims[2]).toBe(3000); // followed Octopi to its new spot
    expect(s.aims[3]).toBe(8000);
    expect(s.events.filter((e) => e.type === 'boss_aim')).toHaveLength(3);

    ticks(s, 12); // needle #3 fires; the burst ends, no further re-aim
    expect(s.enemyShots.filter((e) => e.kind === 'needle')).toHaveLength(3);
    expect(b.burst).toBe(0);
    expect(s.aims).toEqual([]);
    expect(s.events.filter((e) => e.type === 'boss_aim')).toHaveLength(3); // exactly 3 for the whole burst, never a 4th
  });
});

describe('Abyssal Huntsman — one hunt at a time (ruling R34)', () => {
  it('does nothing when attack is called while a line is still live: no new line, no redraw of the target, no draw', () => {
    const s = arena();
    const b = park(s);
    s.octopi.x = 1000;
    s.octopi.y = 6000;
    b.attackTimer = 1;
    updateBoss(s);
    const targetBefore = [s.aims[2], s.aims[3]];
    const burstBefore = b.burst;
    const aimsLenBefore = s.aims.length;

    s.octopi.x = 4000; // Octopi moves
    s.octopi.y = 9000;
    const rng = scriptedRng({});
    s.rngBoss = rng.rng;
    b.attackTimer = 1; // force attack() to be called again this very next tick
    updateBoss(s);

    expect([s.aims[2], s.aims[3]]).toEqual(targetBefore); // no re-aim happened
    expect(b.burst).toBe(burstBefore); // untouched by the extra call
    expect(s.aims.length).toBe(aimsLenBefore); // no extra group pushed
    expect(rng.log).toEqual([BOSS.attackJitter]); // attack drew nothing; only the shared redraw
  });
});

describe('Abyssal Huntsman — decoys from phase 3', () => {
  it('shows two parallel decoy lines, flags the real one, and only the real needle ever fires', () => {
    const s = arena();
    const b = park(s);
    b.phase = 3;
    s.octopi.x = 2000;
    s.octopi.y = 6500;
    b.attackTimer = 1;
    updateBoss(s);
    expect(s.aims).toHaveLength(18); // 3 groups (real + 2 decoys) * 6 ints

    const bx = b.x; // the boss's own x this very tick, after movement, before the next tick moves it again
    const half = idiv(BOSS.width, 2);
    const leftX = Math.max(half, bx - 1200);
    const rightX = Math.min(FIELD_W - half, bx + 1200);
    expect(s.events).toContainEqual({ tick: s.tick, type: 'boss_clone', leftX, rightX });

    const real = s.aims.slice(0, 6);
    const decoyLeft = s.aims.slice(6, 12);
    const decoyRight = s.aims.slice(12, 18);
    expect(real[4]).toBe(0);
    expect(decoyLeft[4]).toBe(1);
    expect(decoyRight[4]).toBe(1);
    expect(decoyLeft[0]).toBe(leftX);
    expect(decoyRight[0]).toBe(rightX);
    expect(decoyLeft[1]).toBe(real[1]); // the same muzzle height
    expect(decoyRight[1]).toBe(real[1]);
    const toX = real[2]!;
    const toY = real[3]!;
    expect(decoyLeft[2]).toBe(clamp(toX + (leftX - bx), 0, FIELD_W));
    expect(decoyRight[2]).toBe(clamp(toX + (rightX - bx), 0, FIELD_W));
    expect(decoyLeft[3]).toBe(toY);
    expect(decoyRight[3]).toBe(toY);
    expect(decoyLeft[5]).toBe(real[5]); // ticks down in lockstep with the real line
    expect(decoyRight[5]).toBe(real[5]);

    ticks(s, 39); // total 40: needle #1 fires; re-aim (again with two decoys, phase 3+) drawn at once
    expect(s.enemyShots.filter((e) => e.kind === 'needle')).toHaveLength(1); // never one per decoy
    expect(s.aims).toHaveLength(18);
    expect(b.burst).toBe(2);

    ticks(s, 12); // needle #2
    ticks(s, 12); // needle #3, burst ends
    expect(s.enemyShots.filter((e) => e.kind === 'needle')).toHaveLength(3); // exactly one per real line
    expect(b.burst).toBe(0);
    expect(s.aims).toEqual([]);
  });
});

describe('Abyssal Huntsman — the honour guard (phase 4)', () => {
  it('is one veteran of each of reef 10\'s five kinds', () => {
    expect(HUNTSMAN_GUARD).toEqual(['elder', 'warden', 'herald', 'bombardier', 'patriarch']);
  });

  it('raises one veteran of each kind in a row of five, entering phase 4', () => {
    const s = arena();
    park(s);
    toPhase(s, 4);
    expect(s.squads).toHaveLength(1);
    const guard = s.squads[0]!;
    expect(guard.alive).toBe(5);
    expect(guard.dir).toBe(1); // a fixed direction, no draw (ruling R50, fix round 1)
    const crabs = s.crabs.filter((c) => c.squad === guard.id);
    expect(crabs).toHaveLength(5);
    expect(crabs.map((c) => c.type).sort()).toEqual([...HUNTSMAN_GUARD].sort());
    for (const c of crabs) expect(c.y).toBe(SQUAD_BAND.maxY);
  });

  it('skips the guard outright once 4 or more squad crabs already live, no retry later', () => {
    const s = arena();
    park(s);
    spawnSquad(s, 'pair', HUNTSMAN_GUARD, 500, SQUAD_BAND.maxY, 1);
    s.squads[0]!.alive = HUNTSMAN_GUARD_CAP; // 4, at the cap
    const squadsBefore = s.squads.length;
    toPhase(s, 4);
    expect(s.squads).toHaveLength(squadsBefore); // skipped outright
    expect(s.boss!.phase).toBe(4); // the phase itself still opened
  });

  it('raises the guard with only 3 squad crabs live, under the cap', () => {
    const s = arena();
    park(s);
    spawnSquad(s, 'pair', HUNTSMAN_GUARD, 500, SQUAD_BAND.maxY, 1);
    s.squads[0]!.alive = HUNTSMAN_GUARD_CAP - 1; // 3, under the cap
    const squadsBefore = s.squads.length;
    toPhase(s, 4);
    expect(s.squads).toHaveLength(squadsBefore + 1);
  });
});

describe('Abyssal Huntsman — Mirror boost classes (spec §5.2)', () => {
  const OFFENCE_BOOSTS: BoostType[] = ['RAPID_FIRE', 'MULTI_SHOT', 'PIERCING_BULLETS', 'AUTO_TARGET', 'SCORE_MULTIPLIER'];
  const DEFENCE_BOOSTS: BoostType[] = ['SHIELD_BARRIER', 'INVINCIBILITY', 'HEALTH_BOOST'];
  const CONTROL_BOOSTS: BoostType[] = ['ICE_FREEZE', 'SPEED_TAMER', 'GRAVITY_WELL', 'WAVE_BLAST', 'POINTS_FREEZE'];
  const NONE_BOOSTS: BoostType[] = ['COIN_SHOWER', 'RANDOM_CHAOS'];

  it('covers exactly the fifteen BoostTypes across the four groups, with no overlap', () => {
    const all = [...OFFENCE_BOOSTS, ...DEFENCE_BOOSTS, ...CONTROL_BOOSTS, ...NONE_BOOSTS];
    expect(all).toHaveLength(15);
    expect(new Set(all).size).toBe(15);
  });

  it('lands durations of 600, 466 and 300 (0/-1 overridden) across the fifteen', () => {
    expect(BOOSTS.RAPID_FIRE.duration).toBe(600);
    expect(BOOSTS.AUTO_TARGET.duration).toBe(466);
    expect(BOOSTS.HEALTH_BOOST.duration).toBe(0); // -> 300 when mirrored (ruling R26)
    expect(BOOSTS.SHIELD_BARRIER.duration).toBe(-1); // -> 300 when mirrored
    expect(BOOSTS.WAVE_BLAST.duration).toBe(0); // -> 300 when mirrored
    expect(BOOSTS.SPEED_TAMER.duration).toBe(-1); // -> 300 when mirrored
  });

  it.each(OFFENCE_BOOSTS.map((t) => [t, BOOSTS[t].duration <= 0 ? 300 : BOOSTS[t].duration] as const))(
    'mirrors %s as offence for %i ticks, halving the running attack timer',
    (type, expectedTicks) => {
      const s = arena();
      const b = park(s);
      b.attackTimer = 100;
      BOSS_HOOKS[10].onBoostPickup!(s, b, type);
      expect(b.mirror).toEqual([expectedTicks, 0, 0]);
      expect(b.attackTimer).toBe(50);
      expect(b.shieldHp).toBe(0);
    },
  );

  it.each(DEFENCE_BOOSTS.map((t) => [t, BOOSTS[t].duration <= 0 ? 300 : BOOSTS[t].duration] as const))(
    'mirrors %s as defence for %i ticks, granting a 40-hp shield',
    (type, expectedTicks) => {
      const s = arena();
      const b = park(s);
      BOSS_HOOKS[10].onBoostPickup!(s, b, type);
      expect(b.mirror).toEqual([0, expectedTicks, 0]);
      expect(b.shieldHp).toBe(40);
      expect(s.events).toContainEqual({ tick: s.tick, type: 'boss_ability', name: 'shield' });
    },
  );

  it.each(CONTROL_BOOSTS.map((t) => [t, BOOSTS[t].duration <= 0 ? 300 : BOOSTS[t].duration] as const))(
    'mirrors %s as control for %i ticks, without touching the attack timer or the shield',
    (type, expectedTicks) => {
      const s = arena();
      const b = park(s);
      b.attackTimer = 100;
      BOSS_HOOKS[10].onBoostPickup!(s, b, type);
      expect(b.mirror).toEqual([0, 0, expectedTicks]);
      expect(b.attackTimer).toBe(100);
      expect(b.shieldHp).toBe(0);
    },
  );

  it.each(NONE_BOOSTS)('mirrors nothing for %s', (type) => {
    const s = arena();
    const b = park(s);
    b.attackTimer = 100;
    BOSS_HOOKS[10].onBoostPickup!(s, b, type);
    expect(b.mirror).toEqual([0, 0, 0]);
    expect(b.attackTimer).toBe(100);
    expect(b.shieldHp).toBe(0);
  });
});

describe('Abyssal Huntsman — the offence mirror halves the attack cadence', () => {
  it('halves the running attack timer at pickup, and halves the next drawn attack delay', () => {
    const s = arena();
    const b = park(s);
    b.attackTimer = 100;
    BOSS_HOOKS[10].onBoostPickup!(s, b, 'RAPID_FIRE');
    expect(b.attackTimer).toBe(50);

    const rng = scriptedRng({ [BOSS.attackJitter]: [0] });
    s.rngBoss = rng.rng;
    b.attackTimer = 1;
    updateBoss(s); // phase 1: attackDelay(1) = idiv(120*5, 5) + 0 = 120
    expect(b.attackTimer).toBe(idiv(120, 2)); // halved by the still-running offence mirror
  });

  it('leaves the delay untouched once the offence mirror has expired', () => {
    const s = arena();
    const b = park(s);
    BOSS_HOOKS[10].onBoostPickup!(s, b, 'RAPID_FIRE'); // 600 ticks
    ticks(s, 600);
    expect(b.mirror[0]).toBe(0);
    const rng = scriptedRng({ [BOSS.attackJitter]: [0] });
    s.rngBoss = rng.rng;
    b.attackTimer = 1;
    updateBoss(s);
    expect(b.attackTimer).toBe(120); // no longer halved
  });
});

describe('Abyssal Huntsman — the defence mirror\'s shield', () => {
  it('absorbs exactly 40 hits with no damage leaking through, then lets damage through again', () => {
    const s = arena();
    const b = park(s);
    BOSS_HOOKS[10].onBoostPickup!(s, b, 'INVINCIBILITY');
    expect(b.shieldHp).toBe(40);
    const hpBefore = b.hp;
    for (let i = 0; i < 40; i++) damageBoss(s, 7); // any amount, absorbed regardless
    expect(b.hp).toBe(hpBefore);
    expect(b.shieldHp).toBe(0);
    expect(s.events.filter((e) => e.type === 'boss_block')).toHaveLength(40);
    damageBoss(s, 7); // the 41st hit gets through
    expect(b.hp).toBe(hpBefore - 7);
  });

  it('drops the shield the instant its own mirror timer runs out, even with hits unused', () => {
    const s = arena();
    const b = park(s);
    BOSS_HOOKS[10].onBoostPickup!(s, b, 'SHIELD_BARRIER'); // duration -1 -> 300 (ruling R26)
    expect(b.mirror[1]).toBe(300);
    expect(b.shieldHp).toBe(40);
    ticks(s, 300);
    expect(b.mirror[1]).toBe(0);
    expect(b.shieldHp).toBe(0);
    const hpBefore = b.hp;
    damageBoss(s, 5);
    expect(b.hp).toBe(hpBefore - 5); // no shield left to absorb it
  });
});

describe('Abyssal Huntsman — a phase transition drops the aim, never the mirror (rulings R33/R26)', () => {
  it('drops the aim and the burst the moment the fight transitions', () => {
    const s = arena();
    const b = park(s);
    b.phase = 2;
    b.attackTimer = 1;
    updateBoss(s); // starts a burst: s.aims populated, b.burst = 3
    expect(s.aims.length).toBeGreaterThan(0);
    expect(b.burst).toBeGreaterThan(0);
    BOSS_HOOKS[10].onTransition!(s, b); // called by `damageBoss` in real play; called directly to isolate it
    expect(s.aims).toEqual([]);
    expect(b.aimTicks).toBe(0);
    expect(b.burst).toBe(0);
  });

  it('keeps the mirror timers counting down through the transition', () => {
    const s = arena();
    const b = park(s);
    BOSS_HOOKS[10].onBoostPickup!(s, b, 'RAPID_FIRE'); // offence, 600 ticks
    b.state = 'transition';
    b.transitionTicks = 50;
    ticks(s, 10);
    expect(b.mirror[0]).toBe(590);
    expect(b.state).toBe('transition'); // the transition itself is untouched
  });
});

describe('Abyssal Huntsman — the Mirror is not a timed ability (ruling R31)', () => {
  it('returns a fixed timer from both slots, with no draw at all', () => {
    const hooks = BOSS_HOOKS[10];
    const rng = scriptedRng({});
    expect(hooks.initialAbilityTimer(rng.rng)).toBe(100_000);
    expect(hooks.nextAbilityTimer(rng.rng)).toBe(100_000);
    expect(rng.log).toEqual([]);
  });

  it('does nothing at all when the ability timer reaches 0', () => {
    const s = arena();
    const b = park(s);
    b.abilityTimer = 0;
    const aimsBefore = [...s.aims];
    const mirrorBefore = [...b.mirror];
    const rng = scriptedRng({});
    s.rngBoss = rng.rng;
    updateBoss(s);
    expect(s.aims).toEqual(aimsBefore);
    expect(b.mirror).toEqual(mirrorBefore);
    expect(b.shieldHp).toBe(0);
    expect(b.abilityTimer).toBe(100_000);
    expect(rng.log).toEqual([]); // attackTimer parked huge; ability itself draws nothing either
  });
});

describe('Abyssal Huntsman — Mirror wiring (sim/boosts.ts, ruling R25)', () => {
  it('mirrors a real pickup consumed through updateBoosts', () => {
    const s = createGame('huntsman-mirror-wiring', { ...PRACTICE_RUN, features: { boosts: true } });
    s.crabs = [];
    spawnBoss(s, 10);
    const b = s.boss!;
    s.drops.push({ x: s.octopi.x, y: s.octopi.y, boost: 'RAPID_FIRE', ttl: 100 });
    updateBoosts(s);
    expect(b.mirror[0]).toBe(600);
    expect(s.boosts.active.some((a) => a.type === 'RAPID_FIRE')).toBe(true); // the player's own pickup still applies
  });

  it('mirrors nothing for a RANDOM_CHAOS pickup, whatever it rolls (the drop\'s OWN type, never the resolved one)', () => {
    const s = createGame('huntsman-chaos-wiring', { ...PRACTICE_RUN, features: { boosts: true } });
    s.crabs = [];
    spawnBoss(s, 10);
    const b = s.boss!;
    // Every draw comes back 0: the chaos roll lands on CHAOS_POOL[0] = RAPID_FIRE, an offence boost —
    // exactly the case that would wrongly set b.mirror[0] if the hook read `result.type` instead of
    // the drop's own `d.boost` (ruling R25).
    s.rngBoosts = scriptedRng({}).rng;
    s.drops.push({ x: s.octopi.x, y: s.octopi.y, boost: 'RANDOM_CHAOS', ttl: 100 });
    updateBoosts(s);
    expect(b.mirror).toEqual([0, 0, 0]);
  });

  it('never calls the hook for a legacy boss (undefined for kinds 1-9)', () => {
    const s = createGame('huntsman-legacy-wiring', { ...PRACTICE_RUN, features: { boosts: true } });
    s.crabs = [];
    spawnBoss(s, 1); // Emerald
    s.drops.push({ x: s.octopi.x, y: s.octopi.y, boost: 'RAPID_FIRE', ttl: 100 });
    expect(() => updateBoosts(s)).not.toThrow();
  });

  it('never mirrors a pickup that is not actually consumed (WAVE_BLAST, no crabs on screen, spec C4)', () => {
    const s = createGame('huntsman-waveblast-not-consumed', { ...PRACTICE_RUN, features: { boosts: true } });
    s.crabs = []; // applyWaveBlast (boostEffects.ts) returns false with no crabs: the pickup is not consumed
    spawnBoss(s, 10);
    const b = s.boss!;
    s.drops.push({ x: s.octopi.x, y: s.octopi.y, boost: 'WAVE_BLAST', ttl: 100 });
    updateBoosts(s);
    expect(b.mirror).toEqual([0, 0, 0]); // the `onBoostPickup` call sits inside `if (result.consumed)`
    expect(s.drops.some((d) => d.boost === 'WAVE_BLAST')).toBe(true); // the drop keeps falling, never consumed
  });
});

describe('Abyssal Huntsman — the Mirror refreshes, never stacks (ruling R26)', () => {
  it('resets the offence mirror\'s duration and halves whatever the attack timer currently is, on a repeat pickup', () => {
    const s = arena();
    const b = park(s);
    BOSS_HOOKS[10].onBoostPickup!(s, b, 'RAPID_FIRE'); // 600 ticks
    ticks(s, 100); // let it count down partway
    expect(b.mirror[0]).toBe(500);
    b.attackTimer = 80; // some unrelated running value by the time the second pickup lands
    BOSS_HOOKS[10].onBoostPickup!(s, b, 'MULTI_SHOT'); // a second offence pickup
    expect(b.mirror[0]).toBe(600); // reset to the fresh full duration, not 500 + 600
    expect(b.attackTimer).toBe(40); // halved again from its CURRENT 80, not from the original 100
  });

  it('refills the defence mirror\'s shield to exactly 40 on a repeat pickup, never adding to what is left', () => {
    const s = arena();
    const b = park(s);
    BOSS_HOOKS[10].onBoostPickup!(s, b, 'INVINCIBILITY');
    expect(b.shieldHp).toBe(40);
    for (let i = 0; i < 15; i++) damageBoss(s, 1); // 15 hits absorbed, 25 left
    expect(b.shieldHp).toBe(25);
    BOSS_HOOKS[10].onBoostPickup!(s, b, 'HEALTH_BOOST'); // a second defence pickup
    expect(b.shieldHp).toBe(40); // refilled to 40, not 25 + 40
    expect(b.mirror[1]).toBe(300); // HEALTH_BOOST's own duration (0 -> 300), refreshed
  });

  it('resets the control mirror\'s duration on a repeat pickup', () => {
    const s = arena();
    const b = park(s);
    BOSS_HOOKS[10].onBoostPickup!(s, b, 'ICE_FREEZE'); // 600 ticks
    ticks(s, 200);
    expect(b.mirror[2]).toBe(400);
    BOSS_HOOKS[10].onBoostPickup!(s, b, 'GRAVITY_WELL'); // a second control pickup
    expect(b.mirror[2]).toBe(600); // reset to the fresh full duration, not 400 + 600
  });
});

describe('Abyssal Huntsman — the RNG draw order', () => {
  it('draws facing then the attack jitter at spawn; the ability timer draws nothing (ruling R31)', () => {
    const s = createGame('huntsman-order', { ...PRACTICE_RUN, features: { boosts: false } });
    s.crabs = [];
    const rng = scriptedRng({});
    s.rngBoss = rng.rng;
    spawnBoss(s, 10);
    expect(rng.log).toEqual([2, BOSS.attackJitter]);
  });

  it('draws nothing for attack or tick; only the shared attack-jitter redraw', () => {
    const s = arena();
    const b = park(s);
    b.attackTimer = 1;
    const rng = scriptedRng({});
    s.rngBoss = rng.rng;
    updateBoss(s);
    expect(rng.log).toEqual([BOSS.attackJitter]);
  });

  it('draws nothing at all on the way to phase 4: the honour guard\'s direction is fixed (ruling R50)', () => {
    const s = arena();
    park(s);
    const rng = scriptedRng({});
    s.rngBoss = rng.rng;
    toPhase(s, 4);
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
