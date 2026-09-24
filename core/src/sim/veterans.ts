import { CRAB, CRAB_SHOTS, FIRE_WEIGHT, SHOT } from '../config';
import { idiv } from '../fixed';
import type { CrabType } from '../levels';
import {
  squadCellCol, squadCellRow, type Bullet, type BulletKind, type Crab, type FormationState,
  type GameState,
} from '../types';
import { FRAGMENT_VECTORS, insideField, spawnCrab } from './crabs';
import { SPLIT_COL, freeSlots } from './living';

/**
 * The five veteran skills: the warden's rune shield, the herald's aura, the bubbler's
 * bubbles, the bombardier's bursting charge and the patriarch's rally and rage.
 *
 * Everything here is reachable only through a veteran. A wave of `normal`/`armored`/`swift`/`heavy`/
 * `elder` crabs never raises a shield (only a spawned warden starts with `shield = 1`), never has a
 * herald to be heralded by, never fires a `bubble` or a `charge` and never enrages, so every branch
 * below falls through and core v10's play stays bit-identical. None of it draws: the rally, the
 * aura, the shield and the rage use no RNG at all, and the shooter pick still makes exactly one
 * `rngFire` draw per firing tick — the weighted walk just uses doubled weights.
 *
 * The fixed order of the new per-tick work (determinism):
 *  1. `updateVeterans`, between `updateShots` and `marchCrabs`: the rage countdown, then per crab in
 *     `s.crabs` order the shield regrow and the rally mark, then per crab in `s.crabs` order the
 *     patriarch rally clocks and their rallies (over the crab count as it stood before the first
 *     rally, so a crab revived this tick is not itself ticked).
 *  2. Inside `updateEnemyShots`'s shot loop: the bubble's drift flip where the zigzag's own flip
 *     happens, then the charge's burst right after the explosive's split.
 *  3. Inside `updateEnemyShots`'s firing block, after the single shooter draw: the bubble cap, the
 *     heralded speed and the bubble's drift.
 *  4. `popBubbles`, immediately before `hitCrabs`: a player shot meets the bubble it is flying into
 *     before it can reach anything behind it.
 *  5. Inside `hitCrabs`/`hitOctopi`: the rune shield absorbing a hit, and a dying patriarch's rage.
 */

/** Ticks a broken rune shield takes to grow back. */
export const SHIELD_REGROW_TICKS = 300;

/** Ticks between two of a patriarch's revives. */
export const RALLY_EVERY = 480;

/**
 * How much later than the patriarch before it the k-th patriarch of a wave first rallies: a wave
 * with four of them brings its fallen back as a trickle rather than four at a time.
 * `armRallies` hands out `RALLY_EVERY + RALLY_STAGGER * k` in slot order at spawn.
 */
export const RALLY_STAGGER = 40;

/** Revives one patriarch may ever make. */
export const RALLY_CAP = 3;

/** Ticks a revived crab carries its rally mark for the renderer (frame flag bit 2). */
export const REVIVED_TICKS = 60;

/** Ticks a formation actually marches and fires half again as fast after a patriarch died. */
export const RAGE_TICKS = 300;

/**
 * What `enrage` stores in `GameState.rageTicks`. A patriarch dies inside `hitCrabs`/`hitOctopi`, by
 * which point this tick's march and fire roll have already run, so the rage can only bite from the
 * next tick on; the extra unit is that dead tick, which `updateVeterans` spends at the top of the
 * next one. Storing it is what makes `RAGE_TICKS` mean exactly what it says — 300 ticks in which the
 * wave really is faster — the same way `SHIELD_REGROW_TICKS` means exactly 300 ticks with the shield
 * down. (The shield needs no such unit: it breaks and regrows in the same phase of the tick.)
 */
const RAGE_STORED = RAGE_TICKS + 1;

/** A raging formation marches and fires `RAGE_NUM / RAGE_DEN` times as fast (×1.5). */
const RAGE_NUM = 3;
const RAGE_DEN = 2;

/** A heralded crab's shot flies `HERALD_SPEED_NUM / HERALD_SPEED_DEN` times as fast (×1.2). */
const HERALD_SPEED_NUM = 12;
const HERALD_SPEED_DEN = 10;

/** How much heavier a heralded crab weighs in the shooter pick. */
const HERALD_WEIGHT = 2;

/** Bubbles alive at once before a bubbler falls back to the plain crab shot. */
export const BUBBLE_CAP = 6;

/** Ticks between two flips of a bubble's sideways drift (the zigzag mechanism). */
export const BUBBLE_FLIP = 40;

/** A bubble's sinking speed, units/tick. */
export const BUBBLE_VY = 60;

/** A bubble's sideways drift, units/tick, flipping every `BUBBLE_FLIP` ticks. */
export const BUBBLE_VX = 30;

/** A bubble's collision radius: far wider than any other crab shot's. */
export const BUBBLE_RADIUS = 200;

/** A charge's collision radius. */
export const CHARGE_RADIUS = 120;

/** How far above Octopi a charge bursts into its four fragments. */
export const CHARGE_BURST_GAP = 900;

/**
 * The veteran tick, called once per tick from `step` between `updateShots` and
 * `marchCrabs` so every timer is settled before anything reads it. A wave with no veteran in it
 * touches nothing here: no crab has a running shield timer or a rally mark, none is a patriarch, and
 * `rageTicks` is 0.
 */
export function updateVeterans(s: GameState): void {
  if (s.rageTicks > 0) s.rageTicks -= 1;
  for (const c of s.crabs) {
    if (c.shieldTimer > 0) {
      c.shieldTimer -= 1;
      if (c.shieldTimer === 0) {
        c.shield = 1;
        s.events.push({ tick: s.tick, type: 'crab_shield_up' });
      }
    }
    if (c.revived > 0) c.revived -= 1;
  }
  // Over the count as it stands now, not over a growing list: a crab a rally revives this tick
  // joins the wave without being ticked itself.
  const living = s.crabs.length;
  for (let i = 0; i < living; i++) {
    const c = s.crabs[i]!;
    // A patriarch marching in a boss's squad never rallies — there is no formation to
    // revive into, and a squad's shape is fixed for as long as it lives.
    if (c.type !== 'patriarch' || c.squad > 0 || c.rallies >= RALLY_CAP) continue;
    // A patriarch that reached the field with no clock armed — a hand-built state — falls back to
    // the plain cadence rather than never rallying at all.
    if (c.rallyTimer <= 0) c.rallyTimer = RALLY_EVERY;
    c.rallyTimer -= 1;
    if (c.rallyTimer > 0) continue;
    c.rallyTimer = RALLY_EVERY;
    rally(s, c);
  }
}

/**
 * Arms the rally clock of every patriarch of a freshly spawned wave: the k-th of them
 * in slot order — which is the order `spawnFormation` and `spawnWave` build their crabs in — waits
 * `RALLY_EVERY + RALLY_STAGGER * k` ticks for its first revive, and `RALLY_EVERY` for every one
 * after. Without the stagger a wave's four patriarchs would rally in lockstep and bring back four
 * crabs at a time. A wave with no patriarch in it is walked once and left untouched.
 */
export function armRallies(s: GameState): void {
  let k = 0;
  for (const c of s.crabs) {
    if (c.type !== 'patriarch') continue;
    c.rallyTimer = RALLY_EVERY + RALLY_STAGGER * k;
    k += 1;
  }
}

/**
 * One revive by the patriarch `p`: a fallen crab of its wave comes back with the kind its
 * slot fields and full hp, marked as revived for the renderer. On a whirlpool, that slot's own kind
 * follows the ring right along with the crabs (`rotate`, `sim/living.ts`), so what comes back is
 * always the kind that was actually standing on that cell, not the template's original one for it.
 * The revived crab counts for the clear condition and scores again, exactly like any other crab of
 * the wave.
 *
 * Nothing happens when no slot qualifies (see `rallyTarget`); that spends none of the patriarch's
 * three revives, and it tries again at its next rally.
 */
function rally(s: GameState, p: Crab): void {
  const target = rallyTarget(s);
  if (target === null) return;
  const back = spawnCrab(target.x, target.y, target.type, target.slot);
  back.revived = REVIVED_TICKS;
  s.crabs.push(back);
  p.rallies += 1;
  s.events.push({ tick: s.tick, type: 'crab_rallied', x: back.x, y: back.y });
}

/**
 * The slot a rally brings a crab back into, and where that crab goes: the **lowest free slot of the
 * wave that a crab can actually be put back into**, walked in ascending slot order. A slot is
 * passed over when
 *
 * - it is a patriarch's. A rally never brings a patriarch back, on a formation wave or
 *   on the daily grid alike, so a wave's revives are bounded by `RALLY_CAP` per patriarch it
 *   *spawned with* and a dead patriarch stays dead;
 * - its place cannot be measured at all — a split wave whose half has been wiped out (see
 *   `rallyPoint`);
 * - its place lies outside the field. The formation origin rides with the block but the
 *   march's wall test only ever sees the *living* crabs, so once an edge column is dead the block
 *   marches past it and that column's slots sit off the field. A crab put there fails
 *   `insideField` in both directions on every march step, and the whole wave would stop moving
 *   sideways and step down 250 units a tick until it invaded — so the band is checked with
 *   `insideField` itself, the very test the march turns on, never a margin of its own.
 *
 * `null` when no free slot qualifies: the rally is skipped whole and the patriarch tries again at
 * its next one, by which time the wave has marched and the same slot may well be reachable.
 */
function rallyTarget(s: GameState): { slot: number; type: CrabType; x: number; y: number } | null {
  const free = s.formation ? freeSlots(s) : freeCells(s);
  for (const slot of free) {
    const type = typeForSlot(s, slot);
    if (type === 'patriarch') continue;
    const spot = rallyPoint(s, slot);
    if (spot === null || !insideField(spot.x)) continue;
    return { slot, type, x: spot.x, y: spot.y };
  }
  return null;
}

/** The kind slot `slot` of the current wave fields: the slot's own kind, or the grid row's. */
function typeForSlot(s: GameState, slot: number): CrabType {
  const f = s.formation;
  return f ? f.slots[slot]!.type : s.gridRows[idiv(slot, CRAB.cols)]!;
}

/** The cells of a daily or practice grid wave that no living crab stands in, ascending. */
function freeCells(s: GameState): number[] {
  const cells = s.gridRows.length * CRAB.cols;
  const taken = new Set(s.crabs.map((c) => c.slot));
  const free: number[] = [];
  for (let i = 0; i < cells; i++) if (!taken.has(i)) free.push(i);
  return free;
}

/** Where a cell of the daily/practice grid sits, relative to cell 0 (the 6-column grid). */
function gridCell(i: number): { x: number; y: number } {
  return { x: (i % CRAB.cols) * CRAB.gapX, y: idiv(i, CRAB.cols) * CRAB.gapY };
}

/** Whether slot `slot` belongs to a split wave's left half (template columns 0-3). */
function leftHalf(f: FormationState, slot: number): boolean {
  return (f.slots[slot]?.col ?? 0) <= SPLIT_COL;
}

/**
 * Where slot `slot` stands right now, for a crab about to be revived into it.
 *
 * A wave that marches, turns or reforms carries its origin with it, so the place is simply
 * `origin + slot`. A `split` wave does not: its two halves drift apart and its origin is frozen
 * where the arrival left it, so the place is measured off a living crab of the same half
 * instead — the offset between two cells of one rigid half never changes, so
 * `sibling + (cell - sibling's cell)` names it exactly. A daily or practice grid is measured the
 * same way off its lowest-slot living crab, having no origin either.
 *
 * `null` when there is nothing to measure from: a split wave whose half has been wiped out. The
 * caller then passes the slot over, exactly as it does for a place outside the field.
 */
function rallyPoint(s: GameState, slot: number): { x: number; y: number } | null {
  const f = s.formation;
  if (!f) return placeBeside(s, slot, () => true, gridCell);
  if (f.behaviour !== 'split') return { x: f.ox + f.slots[slot]!.x, y: f.oy + f.slots[slot]!.y };
  const left = leftHalf(f, slot);
  return placeBeside(s, slot, (c) => leftHalf(f, c.slot) === left, (i) => f.slots[i]!);
}

/**
 * `slot`'s place measured off the living crab of `group` with the lowest slot index, through the
 * cell offsets `cell` gives; `null` when `group` has no living crab left.
 */
function placeBeside(
  s: GameState,
  slot: number,
  group: (c: Crab) => boolean,
  cell: (i: number) => { x: number; y: number },
): { x: number; y: number } | null {
  let anchor: Crab | null = null;
  for (const c of s.crabs) {
    if (c.slot < 0 || !group(c)) continue;
    if (anchor === null || c.slot < anchor.slot) anchor = c;
  }
  if (anchor === null) return null;
  const to = cell(slot);
  const from = cell(anchor.slot);
  return { x: anchor.x + to.x - from.x, y: anchor.y + to.y - from.y };
}

/**
 * A dying patriarch enrages what is left of its formation: `RAGE_TICKS` of half-again
 * march speed and fire chance, refreshed rather than stacked when a second patriarch falls. Called
 * from both paths a crab can die by — shot down (`killCrab`) and walking into Octopi (`hitOctopi`)
 * — and a no-op for every other kind.
 */
export function enrage(s: GameState, c: Crab): void {
  if (c.type !== 'patriarch') return;
  s.rageTicks = RAGE_STORED;
  s.events.push({ tick: s.tick, type: 'formation_rage' });
}

/** `v` half again as fast while the formation rages, unchanged while it is calm. */
export function raged(s: GameState, v: number): number {
  return s.rageTicks > 0 ? idiv(v * RAGE_NUM, RAGE_DEN) : v;
}

/**
 * A warden's rune shield eating a player shot: a non-piercing hit on a shielded crab is
 * consumed whole — no hit points lost — and breaks the shield for `SHIELD_REGROW_TICKS` ticks. A
 * piercing shot (the PIERCING_BULLETS/trident bit in `Bullet.data`) ignores the shield outright: it
 * damages the warden and flies on, and the shield stays up. Returns whether the shot was absorbed.
 */
export function shieldAbsorbs(s: GameState, c: Crab, b: Bullet): boolean {
  if (c.shield !== 1 || (b.data & 1) !== 0) return false;
  c.shield = 0;
  c.shieldTimer = SHIELD_REGROW_TICKS;
  s.events.push({ tick: s.tick, type: 'crab_shield_break', x: c.x, y: c.y });
  return true;
}

/** Whether any living crab of the wave is a herald; the cheap gate on every aura lookup below. */
export function hasHerald(s: GameState): boolean {
  for (const c of s.crabs) if (c.type === 'herald') return true;
  return false;
}

/** The template row of slot `slot` — or, for an unslotted daily/practice grid, its grid row. */
function rowOf(s: GameState, slot: number): number {
  const f = s.formation;
  return f ? (f.slots[slot]?.row ?? -1) : idiv(slot, CRAB.cols);
}

/** The template column of slot `slot` — or, for a daily/practice grid, its grid column. */
function colOf(s: GameState, slot: number): number {
  const f = s.formation;
  return f ? (f.slots[slot]?.col ?? -1) : slot % CRAB.cols;
}

/**
 * Whether a living herald stands within Chebyshev distance 1 of `c`'s own cell. The cell
 * is the crab's current slot, so a crab that has turned onto another cell of a whirlpool ring takes
 * that cell's neighbourhood with it. Heralds never buff heralds — their own aura or another's — and
 * two heralds beside the same crab are worth no more than one: the answer is a yes or a no, so
 * auras cannot stack.
 *
 * A crab marching in a boss's squad holds no slot, so its neighbourhood is read off the
 * squad's own tiny grid instead — `Crab.cell` — and only ever against heralds of the *same* squad:
 * two squads that happen to march past each other are two different formations, and neither one's
 * herald reaches into the other.
 */
export function isHeralded(s: GameState, c: Crab): boolean {
  if (c.type === 'herald') return false;
  if (c.squad > 0) return heraldedInSquad(s, c);
  if (c.slot < 0) return false;
  const row = rowOf(s, c.slot);
  if (row < 0) return false;
  const col = colOf(s, c.slot);
  for (const h of s.crabs) {
    if (h.type !== 'herald' || h.slot < 0) continue;
    const hr = rowOf(s, h.slot);
    if (hr < 0) continue;
    if (Math.abs(hr - row) <= 1 && Math.abs(colOf(s, h.slot) - col) <= 1) return true;
  }
  return false;
}

/** Whether a herald of `c`'s own squad stands on one of the eight cells around `c`. */
function heraldedInSquad(s: GameState, c: Crab): boolean {
  if (c.cell < 0) return false;
  const row = squadCellRow(c.cell);
  const col = squadCellCol(c.cell);
  for (const h of s.crabs) {
    if (h.type !== 'herald' || h.squad !== c.squad || h.cell < 0) continue;
    if (Math.abs(squadCellRow(h.cell) - row) <= 1 && Math.abs(squadCellCol(h.cell) - col) <= 1) return true;
  }
  return false;
}

/** `c`'s weight in the shooter pick: its kind's, doubled while it is heralded. */
export function fireWeight(s: GameState, c: Crab, aura: boolean): number {
  const w = FIRE_WEIGHT[c.type];
  return aura && isHeralded(s, c) ? w * HERALD_WEIGHT : w;
}

/** `v` scaled by the herald's aura (×1.2). */
export function heraldedSpeed(v: number): number {
  return idiv(v * HERALD_SPEED_NUM, HERALD_SPEED_DEN);
}

/**
 * The shot `c` actually fires: its kind's own entry, except that a bubbler with `BUBBLE_CAP` bubbles
 * already in the water blows no more and fires the plain crab shot instead.
 */
export function shotEntryFor(s: GameState, c: Crab): { kind: BulletKind; speed: number; damage: 1 | 2 } {
  const entry = CRAB_SHOTS[c.type];
  if (entry.kind !== 'bubble') return entry;
  let bubbles = 0;
  for (const b of s.enemyShots) if (b.kind === 'bubble') bubbles += 1;
  return bubbles >= BUBBLE_CAP ? CRAB_SHOTS.normal : entry;
}

/**
 * Turns a freshly fired bubble from an aimed shot into a sinking, drifting one: it falls
 * at `BUBBLE_VY` and slides `BUBBLE_VX` to the side `towards` (1 right, -1 left — towards Octopi,
 * the only aiming a bubble does), flipping that drift every `BUBBLE_FLIP` ticks through `data`. A
 * heralded bubbler's bubble carries the aura on both axes, like every other heralded shot.
 */
export function driftBubble(b: Bullet, towards: number, heralded: boolean): void {
  b.vy = heralded ? heraldedSpeed(BUBBLE_VY) : BUBBLE_VY;
  b.vx = towards * (heralded ? heraldedSpeed(BUBBLE_VX) : BUBBLE_VX);
  b.data = BUBBLE_FLIP;
}

/** One tick of a bubble's drift clock: flips the drift every `BUBBLE_FLIP` ticks. */
export function flipBubble(b: Bullet): void {
  b.data -= 1;
  if (b.data <= 0) {
    b.vx = -b.vx;
    b.data = BUBBLE_FLIP;
  }
}

/**
 * A bombardier's charge bursting: once it has sunk to within `CHARGE_BURST_GAP` of
 * Octopi's current depth — Octopi moves freely between `OCTOPI.minY` and `maxY`, so the line follows
 * it — the charge is replaced by four `fragment` shots on the existing fragment vectors, each
 * costing one life where the charge itself cost two. Returns whether it burst; the caller drops the
 * charge when it did.
 */
export function burstCharge(s: GameState, b: Bullet, out: Bullet[]): boolean {
  if (b.y < s.octopi.y - CHARGE_BURST_GAP) return false;
  for (const [vx, vy] of FRAGMENT_VECTORS) out.push({ x: b.x, y: b.y, vx, vy, kind: 'fragment', data: 0 });
  s.events.push({ tick: s.tick, type: 'charge_burst', x: b.x, y: b.y });
  return true;
}

/**
 * Whether a player shot overlaps a bubble: the same box-against-box test `hitCrabs` uses for a
 * crab, with the bubble's radius as its half-width. It is deliberately a 400 × 400 box and not the
 * radius-200 circle `hitOctopi` tests the same bubble with — a player shot is a box, so the cheap
 * box test is the one that matches the rest of `hitCrabs`; the corners buy at most 83 units of
 * extra reach on the diagonal.
 */
function touchesBubble(p: Bullet, b: Bullet): boolean {
  return Math.abs(p.x - b.x) * 2 < SHOT.w + BUBBLE_RADIUS * 2
    && Math.abs(p.y - b.y) * 2 < SHOT.h + BUBBLE_RADIUS * 2;
}

/**
 * Player shots meeting bubbles, called once per tick from `step` immediately before
 * `hitCrabs`: a bubble has one hit point against player fire, so the first bubble a shot touches
 * pops, and the shot is consumed unless it pierces — a piercing shot pops the bubble and flies on.
 * Each shot pops at most one bubble per tick; shots are walked in their own array order and bubbles
 * in the enemy shots' order, so which bubble goes first never depends on anything but the state.
 *
 * Costs nothing on a field with no bubbles on it, which is every field the first campaign ever puts
 * up: the scan below leaves immediately.
 */
export function popBubbles(s: GameState): void {
  if (s.shots.length === 0) return;
  let any = false;
  for (const b of s.enemyShots) {
    if (b.kind === 'bubble') {
      any = true;
      break;
    }
  }
  if (!any) return;
  const kept: Bullet[] = [];
  for (const p of s.shots) {
    const i = s.enemyShots.findIndex((b) => b.kind === 'bubble' && touchesBubble(p, b));
    if (i < 0) {
      kept.push(p);
      continue;
    }
    const bubble = s.enemyShots[i]!;
    s.enemyShots.splice(i, 1);
    s.events.push({ tick: s.tick, type: 'bubble_pop', x: bubble.x, y: bubble.y });
    if ((p.data & 1) !== 0) kept.push(p);
  }
  s.shots = kept;
}

/**
 * The per-crab `flags` int of the view frame: bit 0 shield up, bit 1 heralded, bit 2
 * revived within the last `REVIVED_TICKS` ticks, bit 3 the formation raging. `aura` is
 * `hasHerald(s)`, hoisted out of the caller's loop.
 */
export function crabFlags(s: GameState, c: Crab, aura: boolean): number {
  return c.shield
    | (aura && isHeralded(s, c) ? 2 : 0)
    | (c.revived > 0 ? 4 : 0)
    | (s.rageTicks > 0 ? 8 : 0);
}
