import { describe, expect, it } from 'vitest';
import {
  ARRIVAL, CRAB, DAILY_RUN, FIELD_W, FORMATION_BEHAVIOUR, REEF_KINDS, REFORM_TARGET, REFORM_TICKS,
  ROTATE_TICKS, WHIRLPOOL_RINGS, createGame, crabSpeed, formationGapX, formationPositions, freeSlots,
  kindForTier, marchCrabs, marchSteps,
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

const form = (s: GameState): FormationState => s.formation!;
const slotOf = (s: GameState, c: Crab) => form(s).slots[c.slot]!;
const onSlot = (s: GameState, c: Crab) => c.x === form(s).ox + slotOf(s, c).x && c.y === form(s).oy + slotOf(s, c).y;

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
  it('moves every crab onto the next slot of its ring every ROTATE_TICKS ticks', () => {
    const s = landed('whirlpool');
    const next = whirlpoolNext();
    const before = s.crabs.map((c) => c.slot);
    advance(s, ROTATE_TICKS);
    expect(s.crabs.map((c) => c.slot)).toEqual(before.map((i) => next[i]));
    expect(form(s).rotateTick).toBe(0);
    expect(s.crabs.every((c) => onSlot(s, c))).toBe(true);
  });

  it('glides by the integer lerp between the two slots mid-step', () => {
    const s = landed('whirlpool');
    const next = whirlpoolNext();
    const from = s.crabs.map((c) => c.slot);
    const t = 17;
    advance(s, t);
    expect(form(s).rotateTick).toBe(t);
    s.crabs.forEach((c, i) => {
      const a = form(s).slots[from[i]!]!;
      const b = form(s).slots[next[from[i]!]!]!;
      expect({ i, x: c.x, y: c.y }).toEqual({
        i,
        x: form(s).ox + a.x + Math.trunc(((b.x - a.x) * t) / ROTATE_TICKS),
        y: form(s).oy + a.y + Math.trunc(((b.y - a.y) * t) / ROTATE_TICKS),
      });
    });
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
    expect(form(s).glideTicks).toBe(REFORM_TICKS - 1);
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

  it('glides to the spearhead over REFORM_TICKS ticks and lands exactly on the slots', () => {
    const s = landed('manta');
    s.crabs = s.crabs.slice(0, 12);
    advance(s, 1);
    expect(s.crabs.every((c) => onSlot(s, c))).toBe(false);
    advance(s, REFORM_TICKS - 2);
    expect(s.crabs.every((c) => onSlot(s, c))).toBe(false);
    advance(s, 1);
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
    advance(s, 1 + REFORM_TICKS);
    expect(form(s).reformed).toBe(true);
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
