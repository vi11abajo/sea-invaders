import { describe, expect, it } from 'vitest';
import {
  ARRIVAL, BUBBLE_CAP, BUBBLE_FLIP, BUBBLE_RADIUS, BUBBLE_VX, BUBBLE_VY, CHARGE_BURST_GAP,
  CHARGE_RADIUS, CRAB, CRAB_TYPES, DAILY_RUN, INITIAL_INPUT, PRACTICE_RUN, RAGE_TICKS, RALLY_CAP,
  RALLY_EVERY, RALLY_STAGGER, REEF_KINDS, REVIVED_TICKS, SHIELD_REGROW_TICKS, SHOT, TYPE_COLOUR,
  armRallies, createGame, crabSpeed, freeSlots, hashState, heraldedSpeed, hitCrabs, hitOctopi,
  insideField, isHeralded, marchCrabs, popBubbles, raged, shotDamage, shotRadius, snapshot, step,
  updateEnemyShots, updateVeterans,
  type Bullet, type BulletKind, type Crab, type CrabType, type Formation, type FormationState,
  type GameState, type LevelSpec,
} from '../src';

/**
 * The five veteran skills of spec §2: the warden's rune shield, the herald's aura, the bubbler's
 * bubbles, the bombardier's bursting charge and the patriarch's rally and rage.
 *
 * No level in the game fields a veteran yet, so every wave here is hand-built: a one-wave campaign level
 * whose kind pool is chosen by tier, or a legacy wave whose crabs are retyped by hand. Motion is
 * driven through `updateVeterans`/`marchCrabs` directly rather than `step`, so nothing but the test
 * ever kills a crab.
 */

/** A crab of `type` the way `spawnCrab` builds one: every veteran field neutral but a warden's shield. */
function crab(type: CrabType, x = 2812, y = 1500, slot = -1): Crab {
  return {
    x, y, kind: TYPE_COLOUR[type], type, hp: CRAB_TYPES[type].hp, slot,
    shield: type === 'warden' ? 1 : 0, shieldTimer: 0, rallies: 0, rallyTimer: 0, squad: 0, revived: 0,
  };
}

function bullet(kind: BulletKind, x = 0, y = 0, data = 0): Bullet {
  return { x, y, vx: 0, vy: 0, kind, data };
}

/** A one-wave campaign level of `formation` whose tiers 0..4 field `kinds`. */
function levelOf(formation: Formation, kinds: CrabType[]): LevelSpec {
  return {
    id: 1, reef: 6, index: 1, waves: 1, formation, formations: [formation],
    kinds, speedOffset: 0, fireOffset: 0,
  };
}

/** A one-wave campaign run of `formation` fielding `kinds`, its arrival descent already played out. */
function landed(formation: Formation, kinds: CrabType[], seed = 'vet'): GameState {
  const s = createGame(`${seed}-${formation}`, {
    mode: 'campaign', level: levelOf(formation, kinds), lives: 5, features: { boosts: false }, octopi: 'base',
  });
  for (let i = 0; i < ARRIVAL.ticks; i++) {
    s.tick += 1;
    marchCrabs(s);
    s.arrival -= 1; // `step` decrements after the march; mirrored here so the descent lands exactly
  }
  return s;
}

/** The tier pool used wherever a wave needs one patriarch on top and an hp-3 kind on tier 1. */
const PATRIARCH_POOL: CrabType[] = ['normal', 'elder', 'swift', 'armored', 'patriarch'];

const form = (s: GameState): FormationState => s.formation!;
const at = (s: GameState, slot: number): Crab => s.crabs.find((c) => c.slot === slot)!;
const onSlot = (s: GameState, c: Crab) => ({ x: c.x - form(s).ox, y: c.y - form(s).oy });
const count = (s: GameState, type: string) => s.events.filter((e) => e.type === type).length;

/** Runs the veteran tick alone: timers, rallies and rage, with nothing moving. */
function tickVeterans(s: GameState, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    s.tick += 1;
    updateVeterans(s);
  }
}

/** Runs the veteran tick and the march, in `step`'s own order. */
function advance(s: GameState, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    s.tick += 1;
    updateVeterans(s);
    marchCrabs(s);
  }
}

/** Fires one point-blank player shot into `c`; `data & 1` makes it piercing. */
function shoot(s: GameState, c: Crab, data = 0): void {
  s.shots.push({ x: c.x, y: c.y, vx: 0, vy: -240, kind: 'straight', data });
  hitCrabs(s);
}

/** Silences both sides' fire, so a `step`-driven test is about the tick wiring and nothing else. */
function quiet(s: GameState): void {
  s.octopi.cooldown = 1000000; // Octopi holds its fire
  s.rngFire = { nextInt: (n: number) => (n === 1000 ? 999 : 0) } as never; // and so do the crabs
}

/** How far the wave's origin has stepped down, in whole `CRAB.stepDown`s, since `oy`. */
const stepDowns = (s: GameState, oy: number) => (form(s).oy - oy) / CRAB.stepDown;

describe('the warden raises a rune shield', () => {
  /** A practice game holding one warden, shield up. */
  function warden(): GameState {
    const s = createGame('warden', PRACTICE_RUN);
    s.crabs = [crab('warden')];
    s.waveTotal = 1;
    return s;
  }

  it('absorbs one non-piercing hit outright: no damage, the shot is gone, the shield breaks', () => {
    const s = warden();
    const c = s.crabs[0]!;
    shoot(s, c);
    expect({ hp: c.hp, shield: c.shield, timer: c.shieldTimer, shots: s.shots.length })
      .toEqual({ hp: CRAB_TYPES.warden.hp, shield: 0, timer: SHIELD_REGROW_TICKS, shots: 0 });
    expect(count(s, 'crab_shield_break')).toBe(1);
    expect(s.crabs).toHaveLength(1);
  });

  it('regrows the shield exactly SHIELD_REGROW_TICKS ticks after it broke', () => {
    const s = warden();
    const c = s.crabs[0]!;
    shoot(s, c);
    tickVeterans(s, SHIELD_REGROW_TICKS - 1);
    expect({ shield: c.shield, timer: c.shieldTimer, up: count(s, 'crab_shield_up') })
      .toEqual({ shield: 0, timer: 1, up: 0 });
    tickVeterans(s, 1);
    expect({ shield: c.shield, timer: c.shieldTimer, up: count(s, 'crab_shield_up') })
      .toEqual({ shield: 1, timer: 0, up: 1 });
  });

  it('takes damage normally while the shield is down, and shields the next hit once it is back', () => {
    const s = warden();
    const c = s.crabs[0]!;
    shoot(s, c); // breaks the shield
    shoot(s, c); // lands on the bare warden
    expect(c.hp).toBe(CRAB_TYPES.warden.hp - 1);
    tickVeterans(s, SHIELD_REGROW_TICKS);
    shoot(s, c);
    expect({ hp: c.hp, shield: c.shield }).toEqual({ hp: CRAB_TYPES.warden.hp - 1, shield: 0 });
    expect(count(s, 'crab_shield_break')).toBe(2);
  });

  it('lets a piercing shot through: it damages the warden, keeps the shield up and flies on', () => {
    const s = warden();
    const c = s.crabs[0]!;
    shoot(s, c, 1);
    expect({ hp: c.hp, shield: c.shield, timer: c.shieldTimer, shots: s.shots.length })
      .toEqual({ hp: CRAB_TYPES.warden.hp - 1, shield: 1, timer: 0, shots: 1 });
    expect(count(s, 'crab_shield_break')).toBe(0);
  });

  it('never shields a legacy kind: a spawned crab of any of the five carries no shield at all', () => {
    for (const type of REEF_KINDS) {
      const s = createGame('legacy', PRACTICE_RUN);
      s.crabs = [crab(type)];
      s.waveTotal = 1;
      const c = s.crabs[0]!;
      shoot(s, c);
      expect({ type, shield: c.shield, hp: c.hp }).toEqual({ type, shield: 0, hp: CRAB_TYPES[type].hp - 1 });
    }
  });
});

describe('the herald spreads an aura', () => {
  /** The 6x6 `classic` wave: slot i sits on row `i / 6`, column `i % 6`. */
  function grid(): GameState {
    return landed('classic', ['normal']);
  }

  it('heralds every crab within Chebyshev distance 1 of the herald slot, and nothing further', () => {
    const s = grid();
    at(s, 7).type = 'herald'; // row 1, column 1
    const neighbours = new Set([0, 1, 2, 6, 8, 12, 13, 14]);
    for (const c of s.crabs) {
      if (c.slot === 7) continue;
      expect({ slot: c.slot, heralded: isHeralded(s, c) })
        .toEqual({ slot: c.slot, heralded: neighbours.has(c.slot) });
    }
  });

  it('never buffs a herald, its own aura or another one', () => {
    const s = grid();
    at(s, 7).type = 'herald';
    at(s, 8).type = 'herald';
    expect({ a: isHeralded(s, at(s, 7)), b: isHeralded(s, at(s, 8)) }).toEqual({ a: false, b: false });
    expect(isHeralded(s, at(s, 2))).toBe(true); // a plain crab between the two still is
  });

  it('stops heralding once the herald is dead', () => {
    const s = grid();
    at(s, 7).type = 'herald';
    const neighbour = at(s, 6);
    expect(isHeralded(s, neighbour)).toBe(true);
    s.crabs = s.crabs.filter((c) => c.slot !== 7);
    expect(isHeralded(s, neighbour)).toBe(false);
  });

  it('doubles a heralded crab fire weight in the shooter pick, with one draw per firing tick', () => {
    const s = grid();
    const herald = at(s, 7);
    herald.type = 'herald';
    // A heralded neighbour, the herald itself and a crab far away: weights 2*2, 2 and 2.
    s.crabs = [at(s, 6), herald, at(s, 35)];
    const byX = new Map(s.crabs.map((c) => [c.x, c.slot]));
    expect(byX.size).toBe(3);

    const picks: number[] = [];
    for (let r = 0; r < 8; r++) {
      const ranges: number[] = [];
      s.enemyShots = [];
      s.rngFire = { nextInt: (n: number) => { ranges.push(n); return n === 1000 ? 0 : r; } } as never;
      updateEnemyShots(s);
      expect({ r, ranges }).toEqual({ r, ranges: [1000, 8] }); // one fire roll, one shooter draw over 8
      picks.push(byX.get(s.enemyShots[0]!.x)!);
    }
    expect(picks).toEqual([6, 6, 6, 6, 7, 7, 35, 35]);
  });

  it('does not stack: a crab between two heralds still weighs exactly twice', () => {
    const s = grid();
    at(s, 7).type = 'herald';
    at(s, 9).type = 'herald';
    s.crabs = [at(s, 8), at(s, 7), at(s, 9)]; // slot 8 is adjacent to both heralds
    const ranges: number[] = [];
    s.rngFire = { nextInt: (n: number) => { ranges.push(n); return n === 1000 ? 0 : 0; } } as never;
    updateEnemyShots(s);
    expect(ranges).toEqual([1000, 8]); // 2*2 + 2 + 2, not 2*4 + 2 + 2
  });

  it('sends a heralded crab shot out 1.2x faster', () => {
    const s = grid();
    const herald = at(s, 7);
    herald.type = 'herald';
    const buffed = at(s, 6);
    const far = at(s, 35);
    for (const c of [buffed, far]) c.x = s.octopi.x; // straight down: vy carries the whole speed
    s.crabs = [buffed, herald];
    s.rngFire = { nextInt: (n: number) => (n === 1000 ? 0 : 0) } as never;
    updateEnemyShots(s);
    expect(s.enemyShots[0]!.vy).toBe(heraldedSpeed(110));
    expect(heraldedSpeed(110)).toBe(132);

    s.crabs = [far, herald];
    s.enemyShots = [];
    updateEnemyShots(s);
    expect(s.enemyShots[0]!.vy).toBe(110); // out of the aura: the plain crab shot
  });

  it('carries the aura into a bubble drift as well as an aimed shot', () => {
    const s = grid();
    const herald = at(s, 7);
    herald.type = 'herald';
    const blower = at(s, 6);
    blower.type = 'bubbler';
    s.crabs = [blower, herald];
    s.rngFire = { nextInt: (n: number) => (n === 1000 ? 0 : 0) } as never;
    updateEnemyShots(s);
    const b = s.enemyShots[0]!;
    expect({ kind: b.kind, vy: b.vy, drift: Math.abs(b.vx) })
      .toEqual({ kind: 'bubble', vy: heraldedSpeed(BUBBLE_VY), drift: heraldedSpeed(BUBBLE_VX) });
    expect([heraldedSpeed(BUBBLE_VY), heraldedSpeed(BUBBLE_VX)]).toEqual([72, 36]);
  });
});

describe('the bubbler blows bubbles', () => {
  /** A practice game whose only crab is a bubbler at `x`, never firing unless asked. */
  function bubbler(x = 2000): GameState {
    const s = createGame('bubbles', PRACTICE_RUN);
    s.crabs = [crab('bubbler', x)];
    s.waveTotal = 1;
    s.rngFire = { nextInt: (n: number) => (n === 1000 ? 999 : 0) } as never; // quiet by default
    return s;
  }

  function fireOnce(s: GameState): void {
    s.rngFire = { nextInt: (n: number) => (n === 1000 ? 0 : 0) } as never;
    updateEnemyShots(s);
    s.rngFire = { nextInt: (n: number) => (n === 1000 ? 999 : 0) } as never;
  }

  it('sinks at BUBBLE_VY and drifts BUBBLE_VX towards Octopi instead of flying aimed', () => {
    const s = bubbler(2000); // Octopi starts at 2812, to the right
    fireOnce(s);
    const b = s.enemyShots[0]!;
    expect({ kind: b.kind, vx: b.vx, vy: b.vy, data: b.data })
      .toEqual({ kind: 'bubble', vx: BUBBLE_VX, vy: BUBBLE_VY, data: BUBBLE_FLIP });

    const t = bubbler(4000); // and to the left
    fireOnce(t);
    expect(t.enemyShots[0]!.vx).toBe(-BUBBLE_VX);
  });

  it('flips its drift every BUBBLE_FLIP ticks', () => {
    const s = bubbler();
    fireOnce(s);
    const b = s.enemyShots[0]!;
    for (let i = 0; i < BUBBLE_FLIP - 1; i++) updateEnemyShots(s);
    expect({ vx: b.vx, data: b.data }).toEqual({ vx: BUBBLE_VX, data: 1 });
    updateEnemyShots(s);
    expect({ vx: b.vx, data: b.data }).toEqual({ vx: -BUBBLE_VX, data: BUBBLE_FLIP });
    for (let i = 0; i < BUBBLE_FLIP; i++) updateEnemyShots(s);
    expect(b.vx).toBe(BUBBLE_VX);
  });

  it('is a wide, one-life enemy shot: radius BUBBLE_RADIUS, damage 1', () => {
    expect(shotRadius(bullet('bubble'))).toBe(BUBBLE_RADIUS);
    expect(BUBBLE_RADIUS).toBe(200);
    expect(shotDamage(bullet('bubble'))).toBe(1);
  });

  it('pops on a player shot, which is consumed unless it pierces', () => {
    for (const data of [0, 1]) {
      const s = createGame('pop', PRACTICE_RUN);
      s.enemyShots = [{ x: 1000, y: 3000, vx: BUBBLE_VX, vy: BUBBLE_VY, kind: 'bubble', data: BUBBLE_FLIP }];
      s.shots = [{ x: 1000, y: 3000, vx: 0, vy: -240, kind: 'straight', data }];
      popBubbles(s);
      expect({ data, bubbles: s.enemyShots.length, shots: s.shots.length })
        .toEqual({ data, bubbles: 0, shots: data });
      expect(count(s, 'bubble_pop')).toBe(1);
    }
  });

  it('pops at most one bubble per shot, and leaves a shot that touches none alone', () => {
    const s = createGame('pop', PRACTICE_RUN);
    s.enemyShots = [
      { x: 1000, y: 3000, vx: 0, vy: BUBBLE_VY, kind: 'bubble', data: BUBBLE_FLIP },
      { x: 1000, y: 3050, vx: 0, vy: BUBBLE_VY, kind: 'bubble', data: BUBBLE_FLIP },
    ];
    s.shots = [
      { x: 1000, y: 3000, vx: 0, vy: -240, kind: 'straight', data: 1 },
      { x: 4000, y: 3000, vx: 0, vy: -240, kind: 'straight', data: 0 },
    ];
    popBubbles(s);
    expect({ bubbles: s.enemyShots.length, shots: s.shots.length }).toEqual({ bubbles: 1, shots: 2 });
    expect(s.enemyShots[0]!.y).toBe(3050); // the first bubble in the list is the one that popped
    expect(count(s, 'bubble_pop')).toBe(1);
  });

  it('leaves a shot untouched when nothing on the field is a bubble', () => {
    const s = createGame('pop', PRACTICE_RUN);
    s.enemyShots = [{ x: 1000, y: 3000, vx: 0, vy: 110, kind: 'crab', data: 0 }];
    s.shots = [{ x: 1000, y: 3000, vx: 0, vy: -240, kind: 'straight', data: 0 }];
    const before = hashState(s);
    popBubbles(s);
    expect(hashState(s)).toBe(before);
  });

  it('falls back to the plain crab shot while BUBBLE_CAP bubbles are alive', () => {
    const s = bubbler();
    for (let i = 0; i < BUBBLE_CAP; i++) fireOnce(s);
    expect(s.enemyShots.filter((b) => b.kind === 'bubble')).toHaveLength(BUBBLE_CAP);
    fireOnce(s);
    const last = s.enemyShots[s.enemyShots.length - 1]!;
    expect(last.kind).toBe('crab');
    expect(s.enemyShots.filter((b) => b.kind === 'bubble')).toHaveLength(BUBBLE_CAP);
    expect(BUBBLE_CAP).toBe(6);

    // One bubble popped, and the bubbler blows again.
    s.enemyShots.splice(s.enemyShots.findIndex((b) => b.kind === 'bubble'), 1);
    fireOnce(s);
    expect(s.enemyShots.filter((b) => b.kind === 'bubble')).toHaveLength(BUBBLE_CAP);
  });
});

describe('the bombardier throws a bursting charge', () => {
  /** A practice game with one quiet crab, so the shot list is the test's own. */
  function quiet(): GameState {
    const s = createGame('charge', PRACTICE_RUN);
    s.crabs = [crab('normal')];
    s.waveTotal = 1;
    s.rngFire = { nextInt: (n: number) => (n === 1000 ? 999 : 0) } as never;
    return s;
  }

  it('is a heavy, wide shot: radius CHARGE_RADIUS, damage 2', () => {
    expect(shotRadius(bullet('charge'))).toBe(CHARGE_RADIUS);
    expect(CHARGE_RADIUS).toBe(120);
    expect(shotDamage(bullet('charge'))).toBe(2);
    expect(shotDamage(bullet('fragment'))).toBe(1);
  });

  it('bursts into four fragments once it reaches CHARGE_BURST_GAP above Octopi', () => {
    const s = quiet();
    const burstY = s.octopi.y - CHARGE_BURST_GAP;
    s.enemyShots = [{ x: 2000, y: burstY - 101, vx: 0, vy: 100, kind: 'charge', data: 0 }];
    updateEnemyShots(s);
    expect({ kind: s.enemyShots[0]!.kind, y: s.enemyShots[0]!.y, burst: count(s, 'charge_burst') })
      .toEqual({ kind: 'charge', y: burstY - 1, burst: 0 }); // one unit short
    updateEnemyShots(s);
    expect(count(s, 'charge_burst')).toBe(1);
    expect(s.enemyShots.map((b) => [b.kind, b.x, b.y, b.vx, b.vy])).toEqual([
      ['fragment', 2000, burstY + 99, 73, 0],
      ['fragment', 2000, burstY + 99, 0, 73],
      ['fragment', 2000, burstY + 99, -73, 0],
      ['fragment', 2000, burstY + 99, 0, -73],
    ]);
  });

  it('follows Octopi down: the burst depth is measured off its current y', () => {
    const s = quiet();
    s.octopi.y = 6000;
    s.enemyShots = [{ x: 2000, y: 6000 - CHARGE_BURST_GAP, vx: 0, vy: 0, kind: 'charge', data: 0 }];
    updateEnemyShots(s);
    expect(count(s, 'charge_burst')).toBe(1);
  });

  it('costs two lives on a direct hit, and one charge of SHIELD_BARRIER for the whole hit', () => {
    const s = quiet();
    s.enemyShots = [{ x: s.octopi.x, y: s.octopi.y, vx: 0, vy: 100, kind: 'charge', data: 0 }];
    hitOctopi(s);
    expect(s.octopi.lives).toBe(1);

    const t = quiet();
    t.boosts.shield = 1;
    t.boosts.active = [{ type: 'SHIELD_BARRIER', ticksLeft: -1 }];
    t.enemyShots = [{ x: t.octopi.x, y: t.octopi.y, vx: 0, vy: 100, kind: 'charge', data: 0 }];
    hitOctopi(t);
    expect({ lives: t.octopi.lives, shield: t.boosts.shield }).toEqual({ lives: 3, shield: 0 });
  });
});

describe('the patriarch rallies the fallen', () => {
  /** The 30-crab `wreck` wave: exactly one tier-4 cell, so slot 0 is the wave's only patriarch. */
  function wreck(): GameState {
    const s = landed('wreck', PATRIARCH_POOL);
    expect(s.crabs.filter((c) => c.type === 'patriarch').map((c) => c.slot)).toEqual([0]);
    return s;
  }

  it('revives the lowest empty slot every RALLY_EVERY ticks, with that slot kind and full hp', () => {
    const s = wreck();
    const p = at(s, 0);
    const slot = form(s).slots[6]!;
    s.crabs = s.crabs.filter((c) => ![6, 8, 20].includes(c.slot));
    expect(freeSlots(s)).toEqual([6, 8, 20]);

    tickVeterans(s, RALLY_EVERY - 1);
    expect({ crabs: s.crabs.length, rallied: count(s, 'crab_rallied') }).toEqual({ crabs: 27, rallied: 0 });
    tickVeterans(s, 1);
    expect(count(s, 'crab_rallied')).toBe(1);

    const back = s.crabs[s.crabs.length - 1]!;
    expect({ slot: back.slot, type: back.type, hp: back.hp, revived: back.revived, rallies: p.rallies })
      .toEqual({ slot: 6, type: slot.type, hp: CRAB_TYPES[slot.type].hp, revived: REVIVED_TICKS, rallies: 1 });
    expect(CRAB_TYPES[slot.type].hp).toBeGreaterThan(1); // a full-hp revive is worth asserting
    expect(onSlot(s, back)).toEqual({ x: slot.x, y: slot.y });
    expect(freeSlots(s)).toEqual([8, 20]);
  });

  it('stops at RALLY_CAP revives, however long the patriarch lives', () => {
    const s = wreck();
    const p = at(s, 0);
    s.crabs = s.crabs.filter((c) => ![6, 7, 8, 9].includes(c.slot));
    tickVeterans(s, RALLY_EVERY * (RALLY_CAP + 2));
    expect({ rallies: p.rallies, rallied: count(s, 'crab_rallied'), crabs: s.crabs.length })
      .toEqual({ rallies: RALLY_CAP, rallied: RALLY_CAP, crabs: 26 + RALLY_CAP });
    expect(freeSlots(s)).toEqual([9]);
    expect(RALLY_CAP).toBe(3);
  });

  it('brings the revived crab back into the wave: it blocks the clear and scores again', () => {
    const s = wreck();
    const slot = form(s).slots[1]!;
    s.crabs = s.crabs.filter((c) => c.slot === 0); // only the patriarch is left
    tickVeterans(s, RALLY_EVERY);
    expect(s.crabs).toHaveLength(2);

    const back = s.crabs[1]!;
    const before = s.score;
    for (let i = 0; i < CRAB_TYPES[slot.type].hp; i++) shoot(s, back);
    expect(s.crabs).toHaveLength(1); // the patriarch alone: the wave is still not clear
    expect(s.score - before).toBe(CRAB_TYPES[slot.type].points * s.wave);
  });

  it('leaves a wave with no free slot alone, and never rallies for a legacy kind', () => {
    const s = wreck();
    tickVeterans(s, RALLY_EVERY * 2);
    expect({ crabs: s.crabs.length, rallied: count(s, 'crab_rallied') }).toEqual({ crabs: 30, rallied: 0 });

    const legacy = landed('wreck', [...REEF_KINDS], 'legacy');
    legacy.crabs = legacy.crabs.filter((c) => c.slot !== 6);
    const before = hashState(legacy);
    tickVeterans(legacy, RALLY_EVERY * 2);
    legacy.tick -= RALLY_EVERY * 2;
    expect(hashState(legacy)).toBe(before);
  });

  it('fills a free spearhead slot once the manta has reformed', () => {
    const s = landed('manta', PATRIARCH_POOL);
    const patriarchs = s.crabs.filter((c) => c.type === 'patriarch');
    // Twelve survivors, one of them the patriarch: below half of 36, so the wave reforms at once.
    s.crabs = [patriarchs[0]!, ...s.crabs.filter((c) => c.type !== 'patriarch').slice(0, 11)];
    advance(s, 1);
    expect(form(s).reformed).toBe(true);
    expect(form(s).slots).toHaveLength(18);
    expect(freeSlots(s)).toEqual([12, 13, 14, 15, 16, 17]);

    const slot = form(s).slots[12]!;
    advance(s, RALLY_EVERY - 1);
    expect(count(s, 'crab_rallied')).toBe(1);
    const back = s.crabs[s.crabs.length - 1]!;
    expect({ slot: back.slot, type: back.type, hp: back.hp })
      .toEqual({ slot: 12, type: slot.type, hp: CRAB_TYPES[slot.type].hp });
    expect(onSlot(s, back)).toEqual({ x: slot.x, y: slot.y });
  });

  it('places a revived crab of a split wave off a living crab of its own half', () => {
    const s = landed('claws', PATRIARCH_POOL);
    const p = at(s, 0); // column 1, the left half: the wave's first patriarch
    const slots = form(s).slots;
    // Slots 1..3 are the other tier-4 cells, which a rally will never take (ruling R7); slot 4 is
    // the left half's own column 0 on the next row down, and it is the one that comes back.
    s.crabs = s.crabs.filter((c) => ![1, 2, 3, 4].includes(c.slot));
    expect(freeSlots(s)).toEqual([1, 2, 3, 4]);
    expect(slots.slice(0, 4).every((sl) => sl.type === 'patriarch')).toBe(true);

    advance(s, RALLY_EVERY);
    expect(count(s, 'crab_rallied')).toBe(1);
    const back = s.crabs[s.crabs.length - 1]!;
    expect({ slot: back.slot, x: back.x, y: back.y }).toEqual({
      slot: 4,
      x: p.x + (slots[4]!.x - slots[0]!.x),
      y: p.y + (slots[4]!.y - slots[0]!.y),
    });
    // The halves have marched apart, so the frozen origin is no longer where the crab belongs.
    expect(back.x).not.toBe(form(s).ox + slots[4]!.x);
  });

  it('skips the rally while the half that owns the lowest free slot is empty, and retries later', () => {
    const s = landed('claws', PATRIARCH_POOL);
    const p = at(s, 0);
    const slots = form(s).slots;
    s.crabs = s.crabs.filter((c) => slots[c.slot]!.col <= 3); // the whole right half is gone
    at(s, 1).type = 'normal'; // the wave's other left-half patriarch: one rally clock is enough here
    expect(s.crabs.filter((c) => c.type === 'patriarch')).toHaveLength(1);
    // Slots 2 and 3 are tier-4 cells a rally never takes (R7); slot 8 is the lowest free one it
    // would take, and it belongs to the half that is gone.
    expect(freeSlots(s).filter((i) => slots[i]!.type !== 'patriarch')[0]).toBe(8);

    advance(s, RALLY_EVERY * 2);
    expect({ rallies: p.rallies, rallied: count(s, 'crab_rallied'), crabs: s.crabs.length })
      .toEqual({ rallies: 0, rallied: 0, crabs: 16 });

    // One right-half crab back on the field, and the next rally lands beside it.
    const anchor = crab('normal', 5000, 3000, 3);
    s.crabs.push(anchor);
    advance(s, RALLY_EVERY);
    expect(count(s, 'crab_rallied')).toBe(1);
    const back = s.crabs[s.crabs.length - 1]!;
    expect({ slot: back.slot, x: back.x, y: back.y }).toEqual({
      slot: 8,
      x: anchor.x + (slots[8]!.x - slots[3]!.x),
      y: anchor.y + (slots[8]!.y - slots[3]!.y),
    });
  });

  it('passes over a free slot that has marched off the field, and takes the lowest one still on it', () => {
    // Column 0 of the wreck's widest row is its only column-0 cell, so killing it takes the block's
    // left edge with it: the wall test only ever sees living crabs, and the block marches on until
    // *its* leftmost crab is at the wall — which carries the dead column's slot clean off the field.
    // A crab put there would fail the wall test in both directions and freeze the whole wave into a
    // step-down every march step, all the way to the invasion line (review C1).
    const s = landed('wreck', PATRIARCH_POOL);
    const p = at(s, 0);
    s.crabs = s.crabs.filter((c) => ![10, 13].includes(c.slot));
    s.dir = -1;
    while (s.dir === -1) advance(s, 1); // march to the left wall; the turn leaves the origin there

    const f = form(s);
    expect({ off: insideField(f.ox + f.slots[10]!.x), on: insideField(f.ox + f.slots[13]!.x) })
      .toEqual({ off: false, on: true });

    const oy = f.oy;
    p.rallyTimer = 1;
    advance(s, 1);
    expect(count(s, 'crab_rallied')).toBe(1);
    const back = s.crabs[s.crabs.length - 1]!;
    expect(back.slot).toBe(13); // not slot 10, the lowest free one
    expect(s.crabs.every((c) => insideField(c.x))).toBe(true);

    // And the wave marches on as it did: sideways every tick, and no step-down storm.
    const ox = form(s).ox;
    advance(s, 200);
    expect({ over: s.over, moved: form(s).ox !== ox }).toEqual({ over: false, moved: true });
    expect(stepDowns(s, oy)).toBeLessThan(4); // the jammed wave stepped down 22 times in 24 ticks
  });

  it('never puts a revived crab outside the field, however far its wave has marched', () => {
    // The reviewer's second reproduction: a `classic` wave whose two left columns are swept away,
    // with four patriarchs rallying over three full rally periods.
    const s = landed('classic', PATRIARCH_POOL);
    const slots = form(s).slots;
    s.crabs = s.crabs.filter((c) => slots[c.slot]!.col > 1);
    expect(s.crabs.filter((c) => c.type === 'patriarch')).toHaveLength(4);

    const oy = form(s).oy;
    let escaped = -1;
    for (let t = 0; t < RALLY_EVERY * 3 && !s.over; t++) {
      advance(s, 1);
      if (escaped < 0 && s.crabs.some((c) => !insideField(c.x))) escaped = t;
    }
    expect(escaped).toBe(-1);
    expect(s.over).toBe(false);
    expect(stepDowns(s, oy)).toBeLessThan(12);
    // The guard rejects places, it does not switch the skill off: the swept columns come back
    // whenever the wave has marched far enough right for their slots to be on the field again.
    expect(count(s, 'crab_rallied')).toBeGreaterThan(0);
  });

  it('never revives a patriarch, so a wave is bounded by RALLY_CAP per patriarch it spawned with', () => {
    // `shell` fields exactly two tier-4 cells, so exactly two patriarchs, at slots 0 and 1.
    const s = landed('shell', PATRIARCH_POOL);
    expect(s.crabs.filter((c) => c.type === 'patriarch').map((c) => c.slot)).toEqual([0, 1]);
    s.crabs = s.crabs.filter((c) => c.slot <= 1 || (c.slot >= 4 && c.slot % 2 === 0));
    expect(freeSlots(s).length).toBeGreaterThan(2 * RALLY_CAP);

    tickVeterans(s, RALLY_EVERY * 12);
    expect(count(s, 'crab_rallied')).toBe(2 * RALLY_CAP);
    expect(s.crabs.filter((c) => c.type === 'patriarch')).toHaveLength(2);
    expect(s.crabs.every((c) => c.revived === 0 || c.type !== 'patriarch')).toBe(true);
  });

  it('leaves a dead patriarch dead, on a formation wave and on the daily grid alike', () => {
    const s = landed('shell', PATRIARCH_POOL);
    s.crabs = s.crabs.filter((c) => c.slot !== 1 && c.slot !== 5); // one patriarch and one tier-3 cell
    tickVeterans(s, RALLY_EVERY * 6);
    expect(freeSlots(s)).toContain(1); // the fallen patriarch's slot is never filled
    expect(s.crabs.filter((c) => c.type === 'patriarch').map((c) => c.slot)).toEqual([0]);

    const d = createGame('daily-patriarch', DAILY_RUN);
    d.crabs[0]!.type = 'patriarch';
    d.crabs[7]!.type = 'patriarch';
    d.gridRows[1] = 'patriarch'; // the whole of that grid row spawned as patriarchs
    armRallies(d);
    d.crabs = d.crabs.filter((c) => ![6, 7, 8, 14].includes(c.slot));
    tickVeterans(d, RALLY_EVERY * 4);
    // Cells 6, 7 and 8 belong to a patriarch row and stay empty; 14 is the one that comes back.
    const taken = new Set(d.crabs.map((c) => c.slot));
    expect([6, 7, 8, 14].map((i) => taken.has(i))).toEqual([false, false, false, true]);
    expect(count(d, 'crab_rallied')).toBe(1);
    expect(d.crabs.filter((c) => c.type === 'patriarch')).toHaveLength(1);
  });

  it('staggers a wave\'s patriarchs so they never rally on the same tick', () => {
    const s = landed('classic', PATRIARCH_POOL); // six tier-4 cells, so six patriarchs
    const clocks = s.crabs.filter((c) => c.type === 'patriarch').map((c) => c.rallyTimer);
    expect(clocks).toEqual([0, 1, 2, 3, 4, 5].map((k) => RALLY_EVERY + RALLY_STAGGER * k));
    expect(s.crabs.filter((c) => c.type !== 'patriarch').every((c) => c.rallyTimer === 0)).toBe(true);

    s.crabs = s.crabs.filter((c) => c.slot < 6 || c.slot >= 12); // the whole tier-3 row is free
    const at0 = s.tick;
    const fired: number[] = [];
    for (let t = 0; t < RALLY_EVERY + RALLY_STAGGER * 6; t++) {
      const before = count(s, 'crab_rallied');
      tickVeterans(s, 1);
      if (count(s, 'crab_rallied') > before) fired.push(s.tick - at0);
    }
    expect(fired).toEqual([0, 1, 2, 3, 4, 5].map((k) => RALLY_EVERY + RALLY_STAGGER * k));
    expect(new Set(fired).size).toBe(6); // one at a time, never a wave of six at once
  });

  it('revives into the lowest empty cell of a daily grid wave, with that row kind', () => {
    const s = createGame('daily-rally', DAILY_RUN);
    expect(s.formation).toBeNull();
    expect(s.crabs.map((c) => c.slot)).toEqual(Array.from({ length: 18 }, (_, i) => i));
    expect(s.gridRows).toHaveLength(3);

    const p = s.crabs[0]!;
    p.type = 'patriarch'; // no daily pool fields one yet: hand-built
    s.crabs = s.crabs.filter((c) => ![4, 9].includes(c.slot));

    advance(s, RALLY_EVERY);
    expect(count(s, 'crab_rallied')).toBe(1);
    const back = s.crabs[s.crabs.length - 1]!;
    expect({ slot: back.slot, type: back.type, x: back.x, y: back.y }).toEqual({
      slot: 4,
      type: s.gridRows[0]!,
      x: p.x + 4 * CRAB.gapX,
      y: p.y,
    });
  });
});

describe('a dying patriarch enrages the formation', () => {
  function raging(): GameState {
    const s = landed('wreck', PATRIARCH_POOL);
    const p = at(s, 0);
    for (let i = 0; i < CRAB_TYPES.patriarch.hp; i++) shoot(s, p);
    expect(s.crabs.find((c) => c.slot === 0)).toBeUndefined();
    return s;
  }

  /** Whether the wave was raging on each of the `ticks` ticks after the death, in order. */
  function ragingTicks(s: GameState, ticks: number): boolean[] {
    const out: boolean[] = [];
    for (let t = 0; t < ticks; t++) {
      tickVeterans(s, 1);
      // Exactly where `marchCrabs` and `updateEnemyShots` read it: right after the veteran tick.
      out.push(s.rageTicks > 0);
    }
    return out;
  }

  it('rages on exactly RAGE_TICKS ticks of marching and firing, not one more', () => {
    const s = raging();
    expect(count(s, 'formation_rage')).toBe(1);
    const hot = ragingTicks(s, RAGE_TICKS + 2);
    expect(hot.filter(Boolean)).toHaveLength(RAGE_TICKS);
    expect({ last: hot[RAGE_TICKS - 1], after: hot[RAGE_TICKS] }).toEqual({ last: true, after: false });
    expect(RAGE_TICKS).toBe(300);
  });

  it('marches the wave half again as fast while it rages', () => {
    const s = raging();
    const hot = crabSpeed(s);
    s.rageTicks = 0;
    const calm = crabSpeed(s);
    expect({ hot, calm }).toEqual({ hot: Math.trunc((calm * 3) / 2), calm });
    expect(raged(s, 10)).toBe(10); // calm again
    s.rageTicks = 1;
    expect(raged(s, 10)).toBe(15);
  });

  it('fires half again as often while it rages', () => {
    const s = raging();
    // The wave-1 fire chance is 18 per mille; raging it is 27. A roll of 20 fires only in a rage.
    s.rngFire = { nextInt: (n: number) => (n === 1000 ? 20 : 0) } as never;
    s.rageTicks = 0;
    s.enemyShots = [];
    updateEnemyShots(s);
    expect(s.enemyShots).toHaveLength(0);
    s.rageTicks = RAGE_TICKS;
    updateEnemyShots(s);
    expect(s.enemyShots).toHaveLength(1);
  });

  it('lets the rage lapse: the wave marches at its plain speed again', () => {
    const s = raging();
    ragingTicks(s, RAGE_TICKS);
    expect(crabSpeed(s)).not.toBe(raged({ ...s, rageTicks: 1 } as GameState, crabSpeed(s)));
    tickVeterans(s, 1);
    expect({ rage: s.rageTicks, plain: crabSpeed(s) === raged(s, crabSpeed(s)) })
      .toEqual({ rage: 0, plain: true });
  });

  it('refreshes the rage on a second death instead of stacking it', () => {
    const s = raging();
    ragingTicks(s, 200);
    expect(s.rageTicks).toBeGreaterThan(0);
    const second = s.crabs[0]!;
    second.type = 'patriarch';
    second.hp = CRAB_TYPES.patriarch.hp;
    for (let i = 0; i < CRAB_TYPES.patriarch.hp; i++) shoot(s, second);
    expect(count(s, 'formation_rage')).toBe(2);
    // A full rage again from here, not the 100 ticks that were left plus another 300.
    const hot = ragingTicks(s, RAGE_TICKS + 2);
    expect(hot.filter(Boolean)).toHaveLength(RAGE_TICKS);
  });
});

describe('the frame carries the four veteran flags', () => {
  it('packs shield up, heralded, revived and raging into the crab flags int', () => {
    const s = landed('classic', ['normal']);
    const herald = at(s, 7);
    herald.type = 'herald';
    const warden = at(s, 6); // beside the herald: shielded and heralded
    warden.type = 'warden';
    warden.shield = 1;
    const plain = at(s, 35);
    const back = at(s, 34);
    back.revived = REVIVED_TICKS;
    s.crabs = [warden, herald, plain, back];

    const flags = (g: GameState) => snapshot(g).crabs.filter((_, i) => i % 6 === 5);
    expect(flags(s)).toEqual([1 | 2, 0, 0, 4]);
    s.rageTicks = 1;
    expect(flags(s)).toEqual([1 | 2 | 8, 8, 8, 4 | 8]);
  });

  it('counts the revived mark down and drops the flag after REVIVED_TICKS ticks', () => {
    const s = landed('classic', ['normal']);
    const back = s.crabs[0]!;
    back.revived = REVIVED_TICKS;
    tickVeterans(s, REVIVED_TICKS - 1);
    expect(back.revived).toBe(1);
    tickVeterans(s, 1);
    expect({ revived: back.revived, flag: snapshot(s).crabs[5]! & 4 }).toEqual({ revived: 0, flag: 0 });
    expect(REVIVED_TICKS).toBe(60);
  });
});

describe('the veteran work is wired into the tick', () => {
  /**
   * Everything here is driven through the real `step`, not through `updateVeterans`/`popBubbles`
   * by hand: removing either call from `core/src/step.ts` — or moving `popBubbles` after
   * `hitCrabs` — turns these red, which is the only thing that pins the order the skills are
   * documented to run in.
   */

  it('regrows a warden shield through step alone', () => {
    const s = createGame('wired-shield', PRACTICE_RUN);
    s.crabs = [crab('warden', 700, 1500)];
    s.waveTotal = 1;
    s.dir = -1;
    quiet(s);
    const c = s.crabs[0]!;
    c.shield = 0;
    c.shieldTimer = SHIELD_REGROW_TICKS;
    for (let t = 0; t < SHIELD_REGROW_TICKS - 1; t++) step(s, INITIAL_INPUT);
    expect({ shield: c.shield, up: count(s, 'crab_shield_up') }).toEqual({ shield: 0, up: 0 });
    step(s, INITIAL_INPUT);
    expect({ shield: c.shield, up: count(s, 'crab_shield_up') }).toEqual({ shield: 1, up: 1 });
  });

  it('rallies a fallen crab through step alone, at exactly the armed tick', () => {
    const s = landed('wreck', PATRIARCH_POOL);
    quiet(s);
    s.crabs = s.crabs.filter((c) => c.slot !== 13);
    for (let t = 0; t < RALLY_EVERY - 1; t++) step(s, INITIAL_INPUT);
    expect(count(s, 'crab_rallied')).toBe(0);
    step(s, INITIAL_INPUT);
    expect(count(s, 'crab_rallied')).toBe(1);
    expect(s.crabs[s.crabs.length - 1]!.slot).toBe(13);
  });

  it('pops a bubble with a player shot before that shot can reach the crab behind it', () => {
    const s = createGame('wired-bubble', PRACTICE_RUN);
    s.crabs = [crab('armored', 1500, 4000)];
    s.waveTotal = 1;
    quiet(s);
    const c = s.crabs[0]!;
    s.enemyShots = [{ x: c.x, y: c.y, vx: 0, vy: 0, kind: 'bubble', data: BUBBLE_FLIP }];
    s.shots = [{ x: c.x, y: c.y + SHOT.speed, vx: 0, vy: -SHOT.speed, kind: 'straight', data: 0 }];
    step(s, INITIAL_INPUT);
    // With `popBubbles` gone, or run after `hitCrabs`, the shot reaches the crab instead.
    expect({ bubbles: s.enemyShots.length, shots: s.shots.length, hp: c.hp, pops: count(s, 'bubble_pop') })
      .toEqual({ bubbles: 0, shots: 0, hp: CRAB_TYPES.armored.hp, pops: 1 });
  });

  it('lets a rage lapse through step alone, after exactly RAGE_TICKS ticks', () => {
    const s = landed('wreck', PATRIARCH_POOL);
    quiet(s);
    const p = at(s, 0);
    for (let i = 0; i < CRAB_TYPES.patriarch.hp; i++) shoot(s, p);
    expect(s.rageTicks).toBeGreaterThan(0);
    let hot = 0;
    for (let t = 0; t < RAGE_TICKS + 5; t++) {
      step(s, INITIAL_INPUT);
      if (s.rageTicks > 0) hot += 1;
    }
    expect(hot).toBe(RAGE_TICKS);
  });
});

describe('a wave without veterans', () => {
  it('is untouched by the veteran tick and the bubble pass, whatever the kinds', () => {
    const s = landed('classic', [...REEF_KINDS]);
    s.enemyShots = [{ x: 1000, y: 3000, vx: 0, vy: 110, kind: 'crab', data: 0 }];
    s.shots = [{ x: 1000, y: 3000, vx: 0, vy: -240, kind: 'straight', data: 0 }];
    const before = hashState(s);
    for (let i = 0; i < 600; i++) {
      updateVeterans(s);
      popBubbles(s);
    }
    expect(hashState(s)).toBe(before);
    expect(s.events).toHaveLength(1); // the wave_start of the level, and nothing else
  });

  it('keeps every legacy kind out of every new branch of the shooter pick', () => {
    const s = landed('classic', [...REEF_KINDS]);
    const ranges: number[] = [];
    s.rngFire = { nextInt: (n: number) => { ranges.push(n); return n === 1000 ? 0 : 0; } } as never;
    updateEnemyShots(s);
    const total = s.crabs.reduce((sum, c) => sum + ({ normal: 2, armored: 2, swift: 4, heavy: 1, elder: 4 } as Record<string, number>)[c.type]!, 0);
    expect(ranges).toEqual([1000, total]);
    expect(s.enemyShots[0]!.vy).toBeGreaterThan(0);
  });
});
