import { BOSS, CRAB, FIELD_W } from '../config';
import { clamp, idiv } from '../fixed';
import { kindForTier, type CrabType } from '../levels';
import { squadCell, type Crab, type GameState, type Squad } from '../types';
import { chilled, tamed } from './boosts';
import { insideField, marchSteps, spawnCrab } from './crabs';
import { raged } from './veterans';

/**
 * The boss squads of spec §5.1: a handful of crabs that march beside a boss instead of arriving as
 * a wave. They are ordinary crabs in `GameState.crabs` — they are shot, scored, dropped from and
 * collided with exactly like any other crab, and they use every veteran skill a wave crab uses
 * except the patriarch's rally (there is no formation to revive into, so `updateVeterans` passes a
 * squad patriarch over). What sets them apart is only this:
 *
 * - `Crab.squad` is the squad's id rather than 0, and `Crab.slot` stays -1 — a squad is not a wave
 *   formation, so it has no slots. `Crab.cell` carries the crab's place in the squad's own tiny
 *   grid, which is what the herald's aura reads its neighbourhood off.
 * - They march by `marchSquads` below, never by the wave march: sideways at the wave's own speed,
 *   turning at the field margins, and never one step down.
 * - The whole fire roll is halved while the boss they came with is alive (`halvedWhileBoss`).
 * - They pop, without score, the moment that boss dies (`popSquads`).
 *
 * A boss round never carries a wave (a boss level has no waves at all, and `nextWave` only spawns
 * the boss once the last wave is cleared), so squad crabs and wave crabs never share `s.crabs`.
 * `marchCrabs` leans on that: with a squad on the field it hands the whole tick to `marchSquads`.
 */

/** Half a crab sprite: the reach of a crab's box either side of its centre. */
const HALF = idiv(CRAB.size, 2);

/** The character code of '0', so reading a template digit costs no string allocation. */
const ZERO = 48;

/** The column spacing inside a squad: the same gap a wave's grid uses. */
export const SQUAD_GAP_X = CRAB.gapX;

/**
 * The row spacing inside a squad. Tighter than `CRAB.gapY` (700), because the band below is barely
 * one crab deep and a two-row squad hangs off it; wide enough that the two rows of a `crew` do not
 * touch — 600 against a 530-unit sprite leaves 70 units of water between them — and that the bottom
 * row still stays clear of Octopi at its own ceiling. `squads.test.ts` pins both ends.
 */
export const SQUAD_ROW_GAP = 600;

/**
 * The band a squad's anchor row marches in (spec §5.1), which it never leaves because a squad never
 * descends. Further rows of a multi-row template hang below the anchor at `SQUAD_ROW_GAP`.
 *
 * The spec names two bounds: `BOSS.top + BOSS.height + 300` (below the boss box) and
 * `OCTOPI.minY − 1200` (well above Octopi). With the shipped geometry they cross — 3960 against
 * 3800, because the boss box is 2960 units tall and reaches down to 3660 — so they cannot both
 * hold, and ruling R12 settles it in favour of the boss box: the band runs from half a crab below
 * the boss box (3925, the shallowest anchor whose sprite is not drawn *inside* the boss) down to
 * the spec's own `+300` (3960). A squad therefore sits 1040 to 1075 units above Octopi's ceiling
 * rather than the spec's 1200 — still far outside Octopi's reach, which `squads.test.ts` pins for
 * both rows of a `crew` anchored anywhere in the band.
 */
export const SQUAD_BAND = {
  minY: BOSS.top + BOSS.height + HALF,
  maxY: BOSS.top + BOSS.height + 300,
} as const;

/** The tiny formations a boss can send out (spec §5.1). */
export type SquadTemplate = 'line4' | 'crew' | 'pair' | 'guard5';

/**
 * Each template as data: one string per row, one digit per crab, the digit being the tier that
 * `kindForTier` turns into a kind from the roster it is given — exactly the rule a campaign wave's
 * silhouette uses. `line4` is a rank of four of one kind, `crew` a boarding party of two ranks,
 * `pair` the Tyrant's two escorts, and `guard5` the Huntsman's honour guard, one of every tier.
 */
export const SQUAD_TEMPLATES: Readonly<Record<SquadTemplate, readonly string[]>> = {
  line4: ['1111'],
  crew: ['3333', '1111'],
  pair: ['11'],
  guard5: ['01234'],
};

/** The next free squad id: one past the highest one standing, so ids start again at 1 on an empty arena. */
function nextSquadId(s: GameState): number {
  let top = 0;
  for (const q of s.squads) if (q.id > top) top = q.id;
  return top + 1;
}

/**
 * Raises a squad of `template`, its kinds drawn from `roster` by the tier rule, centred on
 * `originX` with its first row on `originY` and marching in `dir` (1 right, -1 left). Returns the
 * squad's id, which is what every crab of it carries in `Crab.squad`.
 *
 * The origin is clamped twice, and both clamps matter: `originY` into the band above, and `originX`
 * far enough from the edges that every crab of the squad starts inside the field. A crab standing
 * outside the field would fail `insideField` in *both* directions, which would freeze the squad
 * into turning round on every single march step (the same trap ruling R8 fixed for the rally).
 *
 * Draws nothing: where a squad is raised and which kinds it fields are the caller's decisions.
 */
export function spawnSquad(
  s: GameState,
  template: SquadTemplate,
  roster: readonly CrabType[],
  originX: number,
  originY: number,
  dir: number,
): number {
  const rows = SQUAD_TEMPLATES[template];
  const span = (rows[0]!.length - 1) * SQUAD_GAP_X;
  const x0 = clamp(originX - idiv(span, 2), HALF, FIELD_W - HALF - span);
  const y0 = clamp(originY, SQUAD_BAND.minY, SQUAD_BAND.maxY);
  const id = nextSquadId(s);
  for (let row = 0; row < rows.length; row++) {
    const cells = rows[row]!;
    for (let col = 0; col < cells.length; col++) {
      const tier = cells.charCodeAt(col) - ZERO;
      const crab = spawnCrab(x0 + col * SQUAD_GAP_X, y0 + row * SQUAD_ROW_GAP, kindForTier(roster, tier));
      crab.squad = id;
      crab.cell = squadCell(row, col);
      s.crabs.push(crab);
    }
  }
  s.squads.push({ id, dir: dir >= 0 ? 1 : -1 });
  return id;
}

/**
 * A squad's per-tick march displacement in direction `dir` — spec §5.1's "the normal crab speed",
 * read on an arena that has no wave to read it from. `crabSpeed`'s two wave terms have nothing to
 * say here (a boss level never spawned a wave, so `s.wave` and `s.waveTotal` are both 0 and the
 * thinning-out term would divide by zero), so what is left is the base speed plus the level's own
 * offset — put through exactly the same rage, tamer and freeze a wave's own step goes through, in
 * the same order, so a squad answers ICE_FREEZE and SPEED_TAMER like every other crab on the field.
 */
export function squadStep(s: GameState, dir: number): number {
  const v = CRAB.baseSpeed + (s.run.level?.speedOffset ?? 0);
  return chilled(s, tamed(s, raged(s, v)) * dir, false);
}

/**
 * Marches every squad one tick (spec §5.1): `marchSteps` steps at `squadStep`, each squad turning
 * on its own outermost crab through `insideField` — the one wall test the whole game asks — and
 * giving up no ground when it turns. A squad never steps down, so it stays in its band for as long
 * as it lives and can never invade the reef.
 *
 * A squad whose last crab has been shot stops being a squad. Called from `marchCrabs`, which is
 * where a wave would have moved.
 */
export function marchSquads(s: GameState): void {
  if (s.squads.length === 0) return;
  const steps = marchSteps(s.tick);
  const live: Squad[] = [];
  for (const q of s.squads) {
    const crabs = s.crabs.filter((c) => c.squad === q.id);
    if (crabs.length === 0) continue;
    for (let i = 0; i < steps; i++) {
      const step = squadStep(s, q.dir);
      let hitsWall = false;
      for (const c of crabs) {
        if (!insideField(c.x + step)) {
          hitsWall = true;
          break;
        }
      }
      if (hitsWall) q.dir = -q.dir;
      else for (const c of crabs) c.x += step;
    }
    live.push(q);
  }
  s.squads = live;
}

/**
 * The fire chance `v`, halved while a boss is alive (spec §5.1). A squad fires by the ordinary crab
 * rules — the same single `rngFire` roll, the same weighted shooter pick, the same kind-specific
 * shot — only half as often, because the boss is already filling the water. With no boss on the
 * field the chance is passed through untouched, which is every wave the game has ever played.
 */
export function halvedWhileBoss(s: GameState, v: number): number {
  return s.boss ? idiv(v, 2) : v;
}

/**
 * Pops every surviving squad crab the moment their boss dies (spec §5.1): they are removed without
 * score, without a kill and without a drop — the fight is over, and what is left of the escort goes
 * with it. One `squad_popped` event per squad that still had a crab standing; a squad already wiped
 * out by the player raised its scores as it died and raises nothing here.
 *
 * Called from `damageBoss` right after the boss is cleared. A no-op on an arena with no squad on
 * it, which is every fight of the first campaign.
 */
export function popSquads(s: GameState): void {
  if (s.squads.length === 0) return;
  const survived = new Set<number>();
  const kept: Crab[] = [];
  for (const c of s.crabs) {
    if (c.squad > 0) survived.add(c.squad);
    else kept.push(c);
  }
  s.crabs = kept;
  for (const q of s.squads) if (survived.has(q.id)) s.events.push({ tick: s.tick, type: 'squad_popped' });
  s.squads = [];
}
