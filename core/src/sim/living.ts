import { CRAB, FIELD_W } from '../config';
import { idiv } from '../fixed';
import {
  FORMATION_ORIGIN, REFORM_TARGET, WHIRLPOOL_RINGS, formationGapX, formationPositions,
} from '../formations';
import type { Crab, FormationSlot, FormationState, GameState } from '../types';
import { chilled, tamed } from './boosts';
import { crabStepFor, marchBlockOnce, marchSteps } from './crabs';

/**
 * The three living formations of spec §3. Every wave whose behaviour is `march` — daily, practice,
 * and every static silhouette of both campaigns — goes through `marchCrabs`'s block march instead
 * and never reaches this file, which is what keeps core v10's play bit-identical.
 *
 * All three ride on that same block march: `marchBlockOnce` moves the crabs and the formation
 * origin together, with the usual wall test on the outermost living crab's actual x and the usual
 * `CRAB.stepDown` at a wall, and only then does a behaviour rewrite where its crabs sit relative to
 * the origin. The speed-up curve is untouched: `crabSpeed` still reads the wave's living count, so
 * a thinning whirlpool turns and marches faster exactly as a thinning block does.
 */

const HALF = idiv(CRAB.size, 2);

/**
 * March steps a whirlpool crab takes to travel from its slot to the next one on its ring (spec §3,
 * amended by ruling R6: march steps, not wall-clock ticks). At the 90 % `TUNING.crabMovePct` the
 * game ships with, and with nothing slowing the wave, that is 50 ticks.
 */
export const ROTATE_TICKS = 45;

/** March steps a reforming wave takes to glide into the spearhead (spec §3); 66 ticks untroubled. */
export const REFORM_TICKS = 60;

/**
 * What one unhindered march step is worth to a rotation or a glide. Both are crab movement, so both
 * obey ICE_FREEZE and SPEED_TAMER like the march does (ruling R6) — but the march carries those
 * slowdowns in the *size* of its step, not in how many steps it takes, and a counter that only ever
 * moved by whole steps could not be halved. Counting a step as twenty units lets the very same
 * `chilled` and `tamed` the march puts its displacement through apply to the counter exactly:
 * ICE_FREEZE halves twenty to ten, SPEED_TAMER's tenths divide it evenly, and the two together
 * still land on a whole number. `rotateTick` and `glideTicks` are counted in these units.
 */
export const MARCH_STEP_UNITS = 20;

/** A whole ring step and a whole reform glide, in `MARCH_STEP_UNITS`. */
const ROTATE_SPAN = ROTATE_TICKS * MARCH_STEP_UNITS;
const REFORM_SPAN = REFORM_TICKS * MARCH_STEP_UNITS;

/**
 * How far this tick's march carries a rotation or a glide: the march steps the wave just took, in
 * progress units, slowed exactly as the march slows its own step. Derived from the one step count
 * the march itself used this tick — never a second `marchSteps` call with different inputs — so the
 * counter and the march can never disagree about a tick the march sat out, which scores 0.
 */
function marchProgress(s: GameState, steps: number): number {
  return chilled(s, tamed(s, steps * MARCH_STEP_UNITS), false);
}

/**
 * The last template column of a split wave's left half; 4 to 7 are the right half (spec §3). The
 * patriarch's rally needs it too: a revived crab of a split wave is placed off a living crab of its
 * own half, because the two halves march apart and the wave's origin no longer describes either.
 */
export const SPLIT_COL = 3;

/** A reformed wave marches `REFORM_SPEED_NUM / REFORM_SPEED_DEN` times as fast (spec §3: x1.25). */
const REFORM_SPEED_NUM = 5;
const REFORM_SPEED_DEN = 4;

/** The spearhead's slot offsets, in template order: the shape a reforming wave falls back into. */
const SPEARHEAD: ReadonlyArray<Omit<FormationSlot, 'type'>> = formationPositions(REFORM_TARGET).map((p) => ({
  x: p.x - FORMATION_ORIGIN.x,
  y: p.y - FORMATION_ORIGIN.y,
  row: p.row,
  col: p.col,
  tier: p.tier,
}));

/**
 * A wave reforms only once it is down to this many crabs or fewer (spec §3), which is exactly the
 * number of spearhead slots — so every survivor is guaranteed a place.
 */
export const REFORM_MAX = SPEARHEAD.length;

/**
 * The slot each whirlpool slot turns into, built once from the ring lists of spec §3 and checked as
 * it is built: every cell of the template belongs to exactly one ring, and a ring is a cycle, so a
 * crab following it can never land on another's cell.
 */
const WHIRLPOOL_NEXT: readonly number[] = buildRotation();

function buildRotation(): number[] {
  const cells = formationPositions('whirlpool');
  const at = new Map<string, number>(cells.map((p, i) => [`${p.row},${p.col}`, i]));
  const next = cells.map(() => -1);
  for (const ring of [WHIRLPOOL_RINGS.outer, WHIRLPOOL_RINGS.inner]) {
    for (let k = 0; k < ring.length; k++) {
      const [r, c] = ring[k]!;
      const [nr, nc] = ring[(k + 1) % ring.length]!;
      const from = at.get(`${r},${c}`);
      const to = at.get(`${nr},${nc}`);
      if (from === undefined || to === undefined) throw new Error(`whirlpool ring cell ${r},${c} is not a template cell`);
      if (next[from] !== -1) throw new Error(`whirlpool cell ${r},${c} belongs to two rings`);
      next[from] = to;
    }
  }
  if (next.some((n) => n < 0)) throw new Error('the whirlpool rings leave a template cell out');
  return next;
}

/** `a` to `b`, `at` of the way through a glide of `span`; exact at both ends, integers throughout. */
function lerp(a: number, b: number, at: number, span: number): number {
  return a + idiv((b - a) * at, span);
}

/**
 * Slides a wave that has just changed shape back onto the field. The block march turns on where the
 * crabs actually are, so a wave that narrows as it moves — a whirlpool whose outermost crab is
 * mid-glide towards an inner cell, a manta pulling itself into the spearhead — can march closer to
 * a wall than its full width allows and then reach back out past it. Shifting the whole wave by the
 * overflow, crabs and origin together, puts every crab back on the field without moving one crab
 * relative to another, so `origin + slot` still holds afterwards.
 */
function keepInsideField(s: GameState, f: FormationState): void {
  f.ox += slideInside(s.crabs, HALF, FIELD_W - HALF);
}

/**
 * Slides `crabs` as one rigid group until every one of them sits between the crab-centre bounds
 * `loX` and `hiX`, and returns how far it moved them. A group is always narrower than the band it
 * lives in — no template comes near the field's width (the widest spans 4821 units of 5625) and a
 * half of one is narrower than its side of the centre line, both pinned by `a wave that widens at a
 * wall` in the tests — so only one bound can ever be over and the two corrections below can never
 * fight over the group.
 */
function slideInside(crabs: readonly Crab[], loX: number, hiX: number): number {
  if (crabs.length === 0) return 0;
  let minX = Number.MAX_SAFE_INTEGER;
  let maxX = -Number.MAX_SAFE_INTEGER;
  for (const c of crabs) {
    if (c.x < minX) minX = c.x;
    if (c.x > maxX) maxX = c.x;
  }
  let shift = 0;
  if (maxX > hiX) shift = hiX - maxX;
  else if (minX < loX) shift = loX - minX;
  if (shift === 0) return 0;
  for (const c of crabs) c.x += shift;
  return shift;
}

/** The slot indices of a wave that no living crab holds, ascending (a later rally picks the first). */
export function freeSlots(s: GameState): number[] {
  const f = s.formation;
  if (!f) return [];
  const taken = new Set(s.crabs.map((c) => c.slot));
  const free: number[] = [];
  for (let i = 0; i < f.slots.length; i++) if (!taken.has(i)) free.push(i);
  return free;
}

/** Moves a wave that is not a plain marching block. Only ever called with crabs on the field. */
export function moveLivingFormation(s: GameState, f: FormationState): void {
  if (f.behaviour === 'rotate') rotate(s, f);
  else if (f.behaviour === 'split') split(s, f);
  else if (f.behaviour === 'reform') reform(s, f);
}

/**
 * The whirlpool (spec §3). The block marches and steps down as always, carrying the origin; on top
 * of that every crab travels its ring, one slot every `ROTATE_TICKS` march steps, gliding between
 * the two by the integer lerp. The wheel turns with the march and not against a clock of its own: a
 * tick the march rests, or a wave held back by ICE_FREEZE or SPEED_TAMER, turns it that much less,
 * and a ring step always ends with the crabs exactly on their new slots.
 */
function rotate(s: GameState, f: FormationState): void {
  const steps = marchSteps(s.tick);
  for (let i = 0; i < steps; i++) marchBlockOnce(s, crabStepFor(s, s.dir));
  f.rotateTick += marchProgress(s, steps);
  if (f.rotateTick >= ROTATE_SPAN) {
    // Any progress past the span is dropped rather than carried: a crab that has reached its slot
    // is *on* it, and a step is only ever overshot by part of one tick's worth.
    f.rotateTick = 0;
    for (const c of s.crabs) if (c.slot >= 0) c.slot = WHIRLPOOL_NEXT[c.slot]!;
  }
  for (const c of s.crabs) {
    if (c.slot < 0) continue;
    const from = f.slots[c.slot]!;
    const to = f.slots[WHIRLPOOL_NEXT[c.slot]!]!;
    c.x = f.ox + lerp(from.x, to.x, f.rotateTick, ROTATE_SPAN);
    c.y = f.oy + lerp(from.y, to.y, f.rotateTick, ROTATE_SPAN);
  }
  keepInsideField(s, f);
}

/**
 * The claws (spec §3). Template columns 0-3 and 4-7 march as two independent halves, the left one
 * opening leftwards and the right one rightwards, each at the wave's shared march speed. A half
 * turns at the field margin it owns and steps down there; it turns half a column gap short of the
 * centre line without stepping down, which is what keeps the halves from ever touching. A half with
 * no crabs left simply stops being asked to move.
 *
 * The origin is not carried here: two halves that drift apart have no single point to hang off, so
 * a split wave leaves `ox`/`oy` where its arrival ended and steers by `dirL`/`dirR` alone.
 *
 * Each half is then slid back into its own band, for the same reason the other two behaviours are
 * slid back onto the field: a half pressed against its margin while it is short of its outer column
 * widens again the moment a crab is revived into that column, and a half left hanging over a bound
 * fails it in both directions and turns round on every tick from then on.
 */
function split(s: GameState, f: FormationState): void {
  const gap = idiv(formationGapX(f.name), 2);
  const centre = idiv(FIELD_W, 2);
  const steps = marchSteps(s.tick);
  for (let i = 0; i < steps; i++) {
    f.dirL = marchHalf(s, f, true, f.dirL, HALF, centre - gap);
    f.dirR = marchHalf(s, f, false, f.dirR, centre + gap, FIELD_W - HALF);
  }
  slideInside(halfCrabs(s, f, true), HALF, centre - gap);
  slideInside(halfCrabs(s, f, false), centre + gap, FIELD_W - HALF);
}

/** The living crabs of one half of a split wave (spec §3: template columns 0-3 and 4-7). */
function halfCrabs(s: GameState, f: FormationState, left: boolean): Crab[] {
  return s.crabs.filter((c) => c.slot >= 0 && (f.slots[c.slot]!.col <= SPLIT_COL) === left);
}

/**
 * One march step of one half, between the crab-centre bounds `loX` and `hiX`. Returns the half's
 * direction after the step: reversed if the step would have carried a crab past a bound, and the
 * half steps down when that bound is the field margin rather than the centre line.
 */
function marchHalf(s: GameState, f: FormationState, left: boolean, dir: number, loX: number, hiX: number): number {
  const crabs = halfCrabs(s, f, left);
  if (crabs.length === 0) return dir;
  const step = crabStepFor(s, dir);
  let hitsBound = false;
  for (const c of crabs) {
    const nx = c.x + step;
    if (nx < loX || nx > hiX) {
      hitsBound = true;
      break;
    }
  }
  if (!hitsBound) {
    for (const c of crabs) c.x += step;
    return dir;
  }
  // The left half's outer margin is the field's left edge, the right half's is its right edge; the
  // bound each one meets coming the other way is the centre line, which costs no ground.
  if (left ? dir < 0 : dir > 0) for (const c of crabs) c.y += CRAB.stepDown;
  return -dir;
}

/**
 * The manta (spec §3). It marches as a plain block until it is halved, then falls back into the
 * spearhead: the survivors glide onto the new slots over `REFORM_TICKS` march steps, and from the
 * moment it reforms the wave marches a quarter faster. The glide moves by the share of the distance
 * still to cover that this tick's march is worth of the glide still to run, so it is integer
 * arithmetic throughout, it slows with the march exactly as the rotation does, and its last step —
 * where the two are equal — lands on the slot exactly, however the origin marched underneath it.
 */
function reform(s: GameState, f: FormationState): void {
  if (!f.reformed) fallBack(s, f);
  const steps = marchSteps(s.tick);
  for (let i = 0; i < steps; i++) {
    const step = crabStepFor(s, s.dir);
    marchBlockOnce(s, f.reformed ? idiv(step * REFORM_SPEED_NUM, REFORM_SPEED_DEN) : step);
  }
  if (f.glideTicks <= 0) return;
  const moved = Math.min(marchProgress(s, steps), f.glideTicks);
  if (moved <= 0) return;
  for (const c of s.crabs) {
    if (c.slot < 0) continue;
    const to = f.slots[c.slot]!;
    const dx = c.x - f.ox;
    const dy = c.y - f.oy;
    c.x = f.ox + dx + idiv((to.x - dx) * moved, f.glideTicks);
    c.y = f.oy + dy + idiv((to.y - dy) * moved, f.glideTicks);
  }
  f.glideTicks -= moved;
  keepInsideField(s, f);
}

/**
 * Hands the spearhead's slots to the survivors once the wave is down to half its size and no more
 * than `REFORM_MAX` crabs (spec §3): sorted by tier, highest first, then by the slot they held, they
 * take the spearhead in template order — so the elites end up in the broad tail and the infantry at
 * the tip. The spearhead is centred on the wave's current origin, which is where the wave stands.
 */
function fallBack(s: GameState, f: FormationState): void {
  const alive = s.crabs.length;
  if (alive === 0 || alive > REFORM_MAX || alive > idiv(s.waveTotal, 2)) return;
  const order = [...s.crabs].sort((a, b) => tierOf(f, b) - tierOf(f, a) || a.slot - b.slot);
  // A slot's kind is the kind that slot fields, as it was when the wave spawned: the old slots
  // already spell out the level's tier-to-kind pool, so the spearhead reads it straight off them —
  // which it has to do before they are replaced below.
  const slots = SPEARHEAD.map((p) => ({ ...p, type: typeForTier(f, p.tier) }));
  f.slots = slots;
  order.forEach((c, i) => { c.slot = i; });
  f.reformed = true;
  f.glideTicks = REFORM_SPAN;
  s.events.push({ tick: s.tick, type: 'formation_reform' });
}

/** The tier of the slot `c` holds, or -1 when it holds none (never the case in a campaign wave). */
function tierOf(f: FormationState, c: Crab): number {
  return c.slot >= 0 ? f.slots[c.slot]!.tier : -1;
}

/** The kind this wave fields on `tier`, read off the slots it spawned with. */
function typeForTier(f: FormationState, tier: number): FormationSlot['type'] {
  const slot = f.slots.find((sl) => sl.tier === tier) ?? f.slots[0]!;
  return slot.type;
}
