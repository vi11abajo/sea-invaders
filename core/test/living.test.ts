import { describe, expect, it } from 'vitest';
import {
  ALL_FORMATIONS, ARRIVAL, CRAB, DAILY_RUN, FIELD_W, FORMATION_BEHAVIOUR, MARCH_STEP_UNITS,
  REEF_KINDS, REFORM_TARGET, REFORM_TICKS, ROTATE_TICKS, WHIRLPOOL_RINGS, createGame, crabSpeed,
  formationGapX, formationPositions, freeSlots, kindForTier, marchCrabs, marchSteps,
  type Crab, type Formation, type FormationState, type GameState, type LevelSpec,
} from '../src';

/**
 * The three living formations of spec §3 (whirlpool rotates, claws splits, manta reforms) and the
 * slot bookkeeping every campaign wave now carries. Motion is driven through `marchCrabs` directly
 * rather than `step`, so no shot ever kills a crab mid-measurement: these tests are about where the
 * crabs go, and the wave's own thinning is scripted by hand where a test needs it.
 */

const HALF = CRAB.size / 2;
const CENTRE = Math.trunc(FIELD_W / 2);
/** The last template column of the claws' left half (spec §3: columns 0-3 left, 4-7 right). */
const SPLIT_COL = 3;

function levelOf(formation: Formation): LevelSpec {
  return {
    id: 1, reef: 5, index: 1, waves: 1, formation, formations: [formation],
    kinds: [...REEF_KINDS], speedOffset: 0, fireOffset: 0,
  };
}

/** A one-wave campaign run of `formation`, its arrival descent already played out. */
function landed(formation: Formation): GameState {
  const s = createGame(`living-${formation}`, {
    mode: 'campaign', level: levelOf(formation), lives: 5, features: { boosts: false }, octopi: 'base',
  });
  for (let i = 0; i < ARRIVAL.ticks; i++) {
    s.tick += 1;
    marchCrabs(s);
    s.arrival -= 1; // `step` decrements after the march; mirrored here so the descent lands exactly
  }
  return s;
}

/** Advances crab movement alone for `ticks` ticks: no shots, no kills, no boosts. */
function advance(s: GameState, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    s.tick += 1;
    marchCrabs(s);
  }
}

/**
 * Advances until the wave has taken `steps` march steps, and returns how many ticks that took.
 * Rotation and the reform glide count march steps, not wall-clock ticks (ruling R6), and
 * `TUNING.crabMovePct` rests the march on one tick in ten.
 */
function advanceSteps(s: GameState, steps: number): number {
  let taken = 0;
  let ticks = 0;
  while (taken < steps) {
    taken += marchSteps(s.tick + 1);
    advance(s, 1);
    ticks += 1;
  }
  return ticks;
}

/** Turns ICE_FREEZE on for the rest of a test, with no RNG draw and no expiry. */
function freeze(s: GameState): void {
  s.boosts.active.push({ type: 'ICE_FREEZE', ticksLeft: 1_000_000 });
}

const form = (s: GameState): FormationState => s.formation!;
const slotOf = (s: GameState, c: Crab) => form(s).slots[c.slot]!;
const onSlot = (s: GameState, c: Crab) => c.x === form(s).ox + slotOf(s, c).x && c.y === form(s).oy + slotOf(s, c).y;
const outside = (s: GameState) => s.crabs.some((c) => c.x - HALF < 0 || c.x + HALF > FIELD_W);

/**
 * Plays `ticks` ticks and fails on the deadlock `keepInsideField` exists to prevent: a wave left
 * hanging over a wall fails the wall test in *both* directions, so it turns round and steps down on
 * every single tick and never moves sideways again. Two flips or two step-downs on consecutive ticks
 * is that state and nothing else — a legitimate bounce is followed by a long march back across the
 * field — and no crab may ever be off the field either.
 */
function expectNoWallDeadlock(s: GameState, ticks: number): void {
  let flippedBefore = false;
  let steppedBefore = false;
  for (let t = 0; t < ticks; t++) {
    const dir = s.dir;
    const oy = form(s).oy;
    advance(s, 1);
    const flipped = s.dir !== dir;
    const stepped = form(s).oy !== oy;
    expect({ t, flippedTwice: flipped && flippedBefore }).toEqual({ t, flippedTwice: false });
    expect({ t, steppedTwice: stepped && steppedBefore }).toEqual({ t, steppedTwice: false });
    expect({ t, outside: outside(s) }).toEqual({ t, outside: false });
    flippedBefore = flipped;
    steppedBefore = stepped;
  }
}

/** The slot each whirlpool slot rotates into, derived here from the ring lists the spec gives. */
function whirlpoolNext(): number[] {
  const slots = formationPositions('whirlpool');
  const at = new Map(slots.map((p, i) => [`${p.row},${p.col}`, i]));
  const next = slots.map(() => -1);
  for (const ring of [WHIRLPOOL_RINGS.outer, WHIRLPOOL_RINGS.inner]) {
    for (let k = 0; k < ring.length; k++) {
      const from = at.get(`${ring[k]![0]},${ring[k]![1]}`)!;
      next[from] = at.get(`${ring[(k + 1) % ring.length]![0]},${ring[(k + 1) % ring.length]![1]}`)!;
    }
  }
  return next;
}

describe('formation slots', () => {
  it('records a slot per crab of a campaign wave and seats every crab on its own', () => {
    for (const f of ['classic', 'whirlpool', 'claws', 'manta'] as Formation[]) {
      const s = landed(f);
      expect({ f, name: form(s).name, behaviour: form(s).behaviour })
        .toEqual({ f, name: f, behaviour: FORMATION_BEHAVIOUR[f] });
      expect(form(s).slots).toHaveLength(s.crabs.length);
      expect(s.crabs.map((c) => c.slot)).toEqual(s.crabs.map((_, i) => i));
      expect({ f, seated: s.crabs.every((c) => onSlot(s, c)) }).toEqual({ f, seated: true });
    }
  });

  it('carries the template row, column and tier into the slot, with the kind that tier fields', () => {
    const s = landed('crown');
    const positions = formationPositions('crown');
    expect(form(s).slots.map((sl) => [sl.row, sl.col, sl.tier])).toEqual(positions.map((p) => [p.row, p.col, p.tier]));
    for (const c of s.crabs) expect(c.type).toBe(slotOf(s, c).type);
    expect(form(s).slots.every((sl) => sl.type === kindForTier(REEF_KINDS, sl.tier))).toBe(true);
  });

  it('leaves a daily or practice wave without a formation, on the plain grid cells', () => {
    const s = createGame('daily', DAILY_RUN);
    expect(s.formation).toBeNull();
    // No slots to live by, but every crab still names the grid cell it stands in (spec §2: the
    // veteran skills need a cell off the formation too), so `freeSlots` has nothing to offer.
    expect(s.crabs.map((c) => c.slot)).toEqual(s.crabs.map((_, i) => i));
    expect(freeSlots(s)).toEqual([]);
  });

  it('lists the slots no living crab holds, so a later rally can find a free one', () => {
    const s = landed('manta');
    expect(freeSlots(s)).toEqual([]);
    const gone = [3, 7, 20];
    s.crabs = s.crabs.filter((c) => !gone.includes(c.slot));
    expect(freeSlots(s)).toEqual(gone);
  });
});

describe('a marching wave', () => {
  it('advances every crab by the march step and carries the origin along with it', () => {
    const s = landed('classic');
    const before = s.crabs.map((c) => c.x);
    const ox = form(s).ox;
    const moved = crabSpeed(s) * s.dir * marchSteps(s.tick + 1);
    advance(s, 1);
    expect(s.crabs.map((c) => c.x)).toEqual(before.map((x) => x + moved));
    expect(form(s).ox).toBe(ox + moved);
    expect(s.crabs.every((c) => onSlot(s, c))).toBe(true);
  });
});

describe('the whirlpool rotates', () => {
  /** A whole ring step, in the progress units `rotateTick` counts. */
  const SPAN = ROTATE_TICKS * MARCH_STEP_UNITS;

  it('moves every crab onto the next slot of its ring every ROTATE_TICKS march steps', () => {
    const s = landed('whirlpool');
    const next = whirlpoolNext();
    const before = s.crabs.map((c) => c.slot);
    const ticks = advanceSteps(s, ROTATE_TICKS);
    // 45 march steps is 50 ticks at the game's default 90 % `TUNING.crabMovePct`.
    expect({ steps: ROTATE_TICKS, ticks }).toEqual({ steps: 45, ticks: 50 });
    expect(s.crabs.map((c) => c.slot)).toEqual(before.map((i) => next[i]));
    expect(form(s).rotateTick).toBe(0);
    expect(s.crabs.every((c) => onSlot(s, c))).toBe(true);
  });

  it('glides by the integer lerp between the two slots mid-step', () => {
    const s = landed('whirlpool');
    const next = whirlpoolNext();
    const from = s.crabs.map((c) => c.slot);
    const steps = 17;
    advanceSteps(s, steps);
    expect(form(s).rotateTick).toBe(steps * MARCH_STEP_UNITS);
    s.crabs.forEach((c, i) => {
      const a = form(s).slots[from[i]!]!;
      const b = form(s).slots[next[from[i]!]!]!;
      expect({ i, x: c.x, y: c.y }).toEqual({
        i,
        x: form(s).ox + a.x + Math.trunc(((b.x - a.x) * steps * MARCH_STEP_UNITS) / SPAN),
        y: form(s).oy + a.y + Math.trunc(((b.y - a.y) * steps * MARCH_STEP_UNITS) / SPAN),
      });
    });
  });

  it('rests with the march: a tick the march sits out turns the ring no further', () => {
    const s = landed('whirlpool');
    while (marchSteps(s.tick + 1) !== 0) advance(s, 1);
    const held = form(s).rotateTick;
    const x = s.crabs.map((c) => c.x);
    advance(s, 1);
    expect(form(s).rotateTick).toBe(held);
    expect(s.crabs.map((c) => c.x)).toEqual(x);
  });

  it('takes twice as long under ICE_FREEZE and lands on exactly the same slots', () => {
    const plain = landed('whirlpool');
    const frozen = landed('whirlpool');
    freeze(frozen);
    const next = whirlpoolNext();
    const before = plain.crabs.map((c) => c.slot);
    const plainTicks = advanceSteps(plain, ROTATE_TICKS);
    // ICE_FREEZE halves the progress a march step is worth, so the ring step costs twice the march
    // steps — and, the march itself being untouched in cadence, twice the ticks.
    const frozenTicks = advanceSteps(frozen, ROTATE_TICKS * 2);
    expect({ plainTicks, frozenTicks }).toEqual({ plainTicks: 50, frozenTicks: 100 });
    expect(form(frozen).rotateTick).toBe(0);
    expect(frozen.crabs.map((c) => c.slot)).toEqual(before.map((i) => next[i]));
    expect(frozen.crabs.map((c) => c.slot)).toEqual(plain.crabs.map((c) => c.slot));
    expect(frozen.crabs.every((c) => onSlot(frozen, c))).toBe(true);
  });

  it('marches its origin, steps it down at the wall and keeps every crab inside the field', () => {
    const s = landed('whirlpool');
    const dir0 = s.dir;
    let oyBefore = form(s).oy;
    let turned = false;
    for (let t = 0; t < 400 && !turned; t++) {
      oyBefore = form(s).oy;
      advance(s, 1);
      turned = s.dir !== dir0;
      expect(s.crabs.every((c) => c.x - HALF >= 0 && c.x + HALF <= FIELD_W)).toBe(true);
    }
    expect(turned).toBe(true);
    expect(form(s).oy).toBe(oyBefore + CRAB.stepDown);
  });
});

describe('the claws split', () => {
  const halves = (s: GameState) => {
    const left: Crab[] = [];
    const right: Crab[] = [];
    for (const c of s.crabs) (slotOf(s, c).col <= SPLIT_COL ? left : right).push(c);
    return { left, right };
  };

  it('starts the halves apart and marches them the opposite way', () => {
    const s = landed('claws');
    expect({ dirL: form(s).dirL, dirR: form(s).dirR }).toEqual({ dirL: -1, dirR: 1 });
    const { left, right } = halves(s);
    expect({ left: left.length, right: right.length }).toEqual({ left: 16, right: 16 });
    const lx = left.map((c) => c.x);
    const rx = right.map((c) => c.x);
    advance(s, 5);
    expect(left.every((c, i) => c.x < lx[i]!)).toBe(true);
    expect(right.every((c, i) => c.x > rx[i]!)).toBe(true);
  });

  it('turns at the field margin with a step down and at the centre without one, never overlapping', () => {
    const s = landed('claws');
    const gap = Math.trunc(formationGapX('claws') / 2);
    const { left, right } = halves(s);
    let outerTurns = 0;
    let innerTurns = 0;
    for (let t = 0; t < 3000; t++) {
      const was = { dirL: form(s).dirL, dirR: form(s).dirR, ly: left[0]!.y, ry: right[0]!.y };
      advance(s, 1);
      if (form(s).dirL !== was.dirL) {
        if (was.dirL < 0) { outerTurns += 1; expect(left[0]!.y).toBe(was.ly + CRAB.stepDown); }
        else { innerTurns += 1; expect(left[0]!.y).toBe(was.ly); }
      }
      if (form(s).dirR !== was.dirR) {
        if (was.dirR > 0) { outerTurns += 1; expect(right[0]!.y).toBe(was.ry + CRAB.stepDown); }
        else { innerTurns += 1; expect(right[0]!.y).toBe(was.ry); }
      }
      const maxL = Math.max(...left.map((c) => c.x));
      const minR = Math.min(...right.map((c) => c.x));
      expect({ t, over: maxL > CENTRE - gap || minR < CENTRE + gap || maxL + HALF > minR - HALF })
        .toEqual({ t, over: false });
      expect({ t, out: Math.min(...left.map((c) => c.x)) - HALF < 0 || Math.max(...right.map((c) => c.x)) + HALF > FIELD_W })
        .toEqual({ t, out: false });
    }
    expect(outerTurns).toBeGreaterThan(0);
    expect(innerTurns).toBeGreaterThan(0);
  });

  it('lets one half march on once the other is gone', () => {
    const s = landed('claws');
    s.crabs = s.crabs.filter((c) => slotOf(s, c).col <= SPLIT_COL);
    const dirR = form(s).dirR;
    const x = s.crabs.map((c) => c.x);
    advance(s, 20);
    expect(form(s).dirR).toBe(dirR);
    expect(s.crabs.some((c, i) => c.x !== x[i]!)).toBe(true);
  });
});

describe('the manta reforms', () => {
  const spearhead = formationPositions(REFORM_TARGET);

  it('holds off while more than half the wave is alive', () => {
    const s = landed('manta');
    expect(s.waveTotal).toBe(36);
    s.crabs = s.crabs.slice(0, 19);
    advance(s, 5);
    expect(form(s).reformed).toBe(false);
    expect(s.events.some((e) => e.type === 'formation_reform')).toBe(false);
  });

  it('reforms when the wave falls to half, once and only once', () => {
    const s = landed('manta');
    s.crabs = s.crabs.slice(0, 18);
    advance(s, 1);
    expect(form(s).reformed).toBe(true);
    // The glide is measured in march steps too, and that first tick marched one of the sixty.
    expect(form(s).glideTicks).toBe((REFORM_TICKS - 1) * MARCH_STEP_UNITS);
    advance(s, 300);
    expect(s.events.filter((e) => e.type === 'formation_reform')).toHaveLength(1);
  });

  it('seats the survivors on the spearhead by tier, highest first, then by slot', () => {
    const s = landed('manta');
    const tier = new Map(s.crabs.map((c) => [c, slotOf(s, c).tier]));
    const was = new Map(s.crabs.map((c) => [c, c.slot]));
    s.crabs = s.crabs.filter((c) => [35, 2, 20, 1, 34, 9].includes(c.slot));
    const expected = [...s.crabs].sort((a, b) => tier.get(b)! - tier.get(a)! || was.get(a)! - was.get(b)!);
    advance(s, 1);
    expect(form(s).slots).toHaveLength(spearhead.length);
    expect(expected.map((c) => was.get(c))).toEqual([1, 2, 9, 20, 34, 35]);
    expected.forEach((c, i) => expect({ i, slot: c.slot }).toEqual({ i, slot: i }));
    expect(freeSlots(s)).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
  });

  it('glides to the spearhead over REFORM_TICKS march steps and lands exactly on the slots', () => {
    const s = landed('manta');
    s.crabs = s.crabs.slice(0, 12);
    const ticks = advanceSteps(s, REFORM_TICKS - 1);
    expect(form(s).reformed).toBe(true);
    expect(s.crabs.every((c) => onSlot(s, c))).toBe(false);
    expect(form(s).glideTicks).toBe(MARCH_STEP_UNITS); // one march step of the sixty still to go
    const last = advanceSteps(s, 1);
    // 60 march steps is 66 ticks at the game's default 90 % `TUNING.crabMovePct`.
    expect({ ticks: ticks + last }).toEqual({ ticks: 66 });
    expect(form(s).glideTicks).toBe(0);
    expect(s.crabs.every((c) => onSlot(s, c))).toBe(true);
  });

  it('glides for twice the march steps under ICE_FREEZE and still lands exactly on the slots', () => {
    const s = landed('manta');
    freeze(s);
    s.crabs = s.crabs.slice(0, 12);
    advanceSteps(s, REFORM_TICKS);
    expect(form(s).reformed).toBe(true);
    expect(s.crabs.every((c) => onSlot(s, c))).toBe(false); // only half way after sixty steps
    advanceSteps(s, REFORM_TICKS);
    expect(form(s).glideTicks).toBe(0);
    expect(s.crabs.every((c) => onSlot(s, c))).toBe(true);
  });

  it('marches at the plain step before it reforms', () => {
    const s = landed('manta');
    while (marchSteps(s.tick + 1) === 0) advance(s, 1);
    const ox = form(s).ox;
    const base = crabSpeed(s) * s.dir;
    advance(s, 1);
    expect({ moved: form(s).ox - ox, reformed: form(s).reformed }).toEqual({ moved: base, reformed: false });
  });

  it('marches a quarter faster once reformed', () => {
    const s = landed('manta');
    s.crabs = s.crabs.slice(0, 12);
    advanceSteps(s, REFORM_TICKS);
    expect({ reformed: form(s).reformed, glide: form(s).glideTicks }).toEqual({ reformed: true, glide: 0 });
    let moved = 0;
    for (let t = 0; t < 60 && moved === 0; t++) {
      if (marchSteps(s.tick + 1) === 0) { advance(s, 1); continue; }
      const dir = s.dir;
      const ox = form(s).ox;
      const base = crabSpeed(s) * dir;
      advance(s, 1);
      if (s.dir !== dir) continue; // a wall turn steps down instead of marching sideways
      moved = form(s).ox - ox;
      expect({ moved, plain: base }).toEqual({ moved: Math.trunc((base * 5) / 4), plain: base });
    }
    expect(moved).not.toBe(0);
  });
});

/**
 * A wave that changes shape can march closer to a wall than its full width allows while it is
 * momentarily narrow, and then reach back out past that wall as it widens again. Left alone it
 * deadlocks: hanging over the edge, both directions fail the wall test, so it turns round and steps
 * down on every tick and never marches again. `keepInsideField` slides it back on. Both shapes that
 * can narrow get their own regression here, because the next task's rally re-widens waves too.
 */
describe('a wave that widens at a wall', () => {
  it('is never wider than the band it lives in, so only one bound can ever be over', () => {
    for (const f of ALL_FORMATIONS) {
      const xs = formationPositions(f).map((p) => p.x);
      const width = Math.max(...xs) - Math.min(...xs) + CRAB.size;
      expect({ f, fits: width < FIELD_W }).toEqual({ f, fits: true });
    }
    // A split wave's half has only its own side of the centre line to march in.
    const gap = Math.trunc(formationGapX('claws') / 2);
    for (const left of [true, false]) {
      const xs = formationPositions('claws').filter((p) => (p.col <= SPLIT_COL) === left).map((p) => p.x);
      const width = Math.max(...xs) - Math.min(...xs) + CRAB.size;
      const band = left ? CENTRE - gap - HALF : FIELD_W - HALF - (CENTRE + gap);
      expect({ left, fits: width < band + CRAB.size }).toEqual({ left, fits: true });
    }
  });

  it('slides a split half back into its band when a crab appears in its outermost column', () => {
    const s = landed('claws');
    const f = form(s);
    // The half is left holding only its inner columns, so it marches past where its full width fits.
    s.crabs = s.crabs.filter((c) => slotOf(s, c).col >= 2 && slotOf(s, c).col <= SPLIT_COL);
    advance(s, 400);
    // A crab is revived into the half's outermost column, measured off a sibling as the rally does.
    const sibling = s.crabs[0]!;
    const slot = f.slots.findIndex((sl, i) => sl.col === 0 && !s.crabs.some((c) => c.slot === i));
    expect(slot).toBeGreaterThanOrEqual(0);
    s.crabs.push({
      ...sibling,
      slot,
      x: sibling.x + (f.slots[slot]!.x - slotOf(s, sibling).x),
      y: sibling.y + (f.slots[slot]!.y - slotOf(s, sibling).y),
    });
    expect(outside(s)).toBe(true); // it lands off the field, which is the state being recovered from
    advance(s, 1);
    expect(outside(s)).toBe(false);
    let flips = 0;
    for (let t = 0; t < 200; t++) {
      const was = f.dirL;
      advance(s, 1);
      if (f.dirL !== was) flips += 1;
      expect({ t, outside: outside(s) }).toEqual({ t, outside: false });
    }
    // A half that marches its band turns a handful of times in 200 ticks; a stuck one turns on
    // every tick it moves at all.
    expect({ marching: flips < 10 }).toEqual({ marching: true });
  });

  it('keeps a rotating whirlpool on the field when the ring carries a crab back out to the edge', () => {
    const s = landed('whirlpool');
    const ring = (cells: ReadonlyArray<readonly [number, number]>) =>
      cells.map(([r, c]) => formationPositions('whirlpool').findIndex((p) => p.row === r && p.col === c));
    // Only the inner ring and one outer crab are left. The wave is narrow, so it marches past where
    // its full width fits — and then the ring carries that one crab out to the template's own edge
    // column, which is the moment it would hang over the wall.
    const keep = new Set([...ring(WHIRLPOOL_RINGS.inner), ring(WHIRLPOOL_RINGS.outer)[14]!]);
    s.crabs = s.crabs.filter((c) => keep.has(c.slot));
    expect(s.crabs).toHaveLength(9);
    expectNoWallDeadlock(s, 400);
  });

  it('keeps a reformed manta on the field as it pulls into the spearhead and spreads out again', () => {
    const s = landed('manta');
    s.crabs = s.crabs.slice(0, 12);
    advance(s, 1);
    expect(form(s).reformed).toBe(true);
    expectNoWallDeadlock(s, 400);
  });
});
