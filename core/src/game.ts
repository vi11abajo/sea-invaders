import { ARRIVAL, CRAB, FIELD_W, OCTOPI, bonusLivesFor, fireIntervalFor } from './config';
import { idiv } from './fixed';
import { FORMATION_BEHAVIOUR, FORMATION_ORIGIN, formationPositions } from './formations';
import { dailyPool, kindForTier, type CrabType, type Formation } from './levels';
import { Rng } from './rng';
import type { RunConfig } from './run';
import { spawnBoss } from './sim/boss';
import { spawnCrab } from './sim/crabs';
import { armRallies } from './sim/veterans';
import type { FormationSlot, GameState, Input } from './types';

/** Where Octopi starts; also the input a replay assumes before its first recorded change. */
export const INITIAL_INPUT: Input = Object.freeze({ x: idiv(FIELD_W, 2), y: OCTOPI.startY });

export function createGame(seed: string, run: RunConfig): GameState {
  const lives = run.lives + bonusLivesFor(run.octopi);
  const s: GameState = {
    tick: 0,
    wave: 0,
    waveTotal: 0,
    score: 0,
    kills: 0,
    over: false,
    dir: 1,
    octopi: { x: INITIAL_INPUT.x, y: INITIAL_INPUT.y, cooldown: fireIntervalFor(run.octopi), invuln: 0, lives },
    shots: [],
    enemyShots: [],
    crabs: [],
    rngWaves: new Rng(`${seed}/waves`),
    rngFire: new Rng(`${seed}/fire`),
    run,
    cleared: false,
    boss: null,
    boosts: { active: [], shield: 0, tamerStacks: 0, well: null },
    drops: [],
    rngBoss: new Rng(`${seed}/boss`),
    rngBoosts: new Rng(`${seed}/boosts`),
    events: [],
    arrival: 0,
    formation: null,
    scoreDecay: 0,
    rageTicks: 0,
    gridRows: [],
    // The boss arena of reefs 6-10 (spec §5.1): empty on every run until a boss of kinds 6..10
    // raises something.
    squads: [],
    obstacles: [],
    lanes: [],
    aims: [],
    chillTicks: 0,
  };
  if (run.level) {
    if (run.level.waves > 0) startLevelWave(s, 1);
    else spawnBoss(s, run.level.boss!);
  } else {
    spawnWave(s, 1);
  }
  return s;
}

/**
 * Replaces the crabs with wave `wave` of a daily or practice run: 6 columns, 3 to 5 rows, one kind
 * per row drawn from that wave's pool (spec §2 — wave 1 is green only and every wave adds the next
 * kind, up to all five). Exactly one draw per row, as before, plus the direction draw; the colour
 * and hit points follow from the kind, so a blue crab means the same thing here as in the campaign.
 *
 * A grid wave carries no formation, but it does give every crab the cell it stands in
 * (`slot = row * CRAB.cols + col`) and records each row's kind (spec §2): the herald's aura reads
 * neighbourhoods off those cells and the patriarch's rally revives into the lowest empty one. The
 * grid itself is unchanged — nothing about where a crab stands, how it moves or what it draws
 * depends on the number, and no extra RNG draw is made for it.
 */
export function spawnWave(s: GameState, wave: number): void {
  const rows = Math.min(2 + wave, 5);
  const pool = dailyPool(wave);
  const x0 = idiv(FIELD_W - (CRAB.cols - 1) * CRAB.gapX, 2);
  s.wave = wave;
  s.crabs = [];
  s.formation = null; // spec §3: only a campaign wave carries slots, and only it can live
  s.scoreDecay = 0; // spec C7: the score-decay clock resets at every wave start
  s.rageTicks = 0; // spec §2: a rage belongs to the formation that lost its patriarch
  s.gridRows = [];
  for (let r = 0; r < rows; r++) {
    const type = pool[s.rngWaves.nextInt(pool.length)]!;
    s.gridRows.push(type);
    for (let c = 0; c < CRAB.cols; c++) {
      const x = x0 + c * CRAB.gapX;
      const y = CRAB.startY + r * CRAB.gapY;
      s.crabs.push(spawnCrab(x, y, type, r * CRAB.cols + c));
    }
  }
  armRallies(s); // spec §2: the wave's patriarchs get staggered rally clocks, in grid cell order
  s.dir = s.rngWaves.nextInt(2) === 0 ? 1 : -1;
  s.waveTotal = s.crabs.length;
}

/**
 * Replaces the crabs with a silhouette (the campaign's spawn path, spec §2). The template gives
 * every cell a tier, 0 on the bottom row up to 4 on the top, and `kindForTier` spreads the level's
 * reef pool over those tiers — so a reef-1 wave is all green, and a reef-5 wave has one kind per
 * tier, with the toughest crabs furthest from Octopi. Nothing here is drawn: the direction draw is
 * the only RNG draw, whatever the silhouette.
 *
 * The wave also records its shape (spec §3): one `FormationSlot` per cell in the order
 * `formationPositions` yields them — row by row, left to right — and each crab's `slot` is its
 * index in that list. A slot holds an offset from `FORMATION_ORIGIN`, so a crab sits exactly on
 * `origin + slot` and stays there for as long as its wave marches as a block.
 */
export function spawnFormation(
  s: GameState,
  spec: { formation: Formation; kinds: readonly CrabType[] },
): void {
  const slots: FormationSlot[] = formationPositions(spec.formation).map((p) => ({
    x: p.x - FORMATION_ORIGIN.x,
    y: p.y - FORMATION_ORIGIN.y,
    row: p.row,
    col: p.col,
    tier: p.tier,
    type: kindForTier(spec.kinds, p.tier),
  }));
  s.crabs = slots.map((slot, i) =>
    spawnCrab(FORMATION_ORIGIN.x + slot.x, FORMATION_ORIGIN.y + slot.y, slot.type, i));
  s.formation = {
    name: spec.formation,
    behaviour: FORMATION_BEHAVIOUR[spec.formation],
    slots,
    ox: FORMATION_ORIGIN.x,
    oy: FORMATION_ORIGIN.y,
    dirL: -1, // spec §3: a split wave's left half opens leftwards and its right half rightwards
    dirR: 1,
    rotateTick: 0,
    reformed: false,
    glideTicks: 0,
  };
  s.rageTicks = 0; // spec §2: a rage belongs to the formation that lost its patriarch
  s.gridRows = []; // a campaign wave carries a kind per cell in its slots instead
  armRallies(s); // spec §2: the wave's patriarchs get staggered rally clocks, in slot order
  s.dir = s.rngWaves.nextInt(2) === 0 ? 1 : -1;
  s.waveTotal = s.crabs.length;
}

/**
 * Starts wave `wave` of the current level. Every wave of a level marches in the same silhouette
 * (spec §2): the shape no longer grows with the wave number, so a level's crab count is the same
 * from its first wave to its last. The formation spawns `ARRIVAL.drop` units above its slots and
 * descends into them over `ARRIVAL.ticks`; `nextWave`/`createGame` route every level wave through
 * here, so level 1 wave 1 arrives too.
 */
export function startLevelWave(s: GameState, wave: number): void {
  const l = s.run.level!;
  s.wave = wave;
  // Wave `wave` takes its own silhouette from the level's chain (the first wave is the headline).
  spawnFormation(s, { formation: l.formations[wave - 1] ?? l.formation, kinds: l.kinds });
  for (const c of s.crabs) c.y -= ARRIVAL.drop;
  s.formation!.oy -= ARRIVAL.drop; // the origin drops with the wave, so `origin + slot` still holds
  s.arrival = ARRIVAL.ticks;
  s.scoreDecay = 0; // spec C7: the score-decay clock resets at every campaign wave start too
  s.events.push({ tick: s.tick, type: 'wave_start', wave });
}

/**
 * Advances past a cleared wave. Without a campaign level this is the endless behaviour unchanged.
 * With one: the next wave inside the level, or the level's boss once all waves are done, or the
 * level is cleared (boss dead already handled by the boss engine clearing `s.boss`).
 */
export function nextWave(s: GameState): void {
  s.events.push({ tick: s.tick, type: 'wave_cleared' });
  const l = s.run.level;
  if (!l) {
    spawnWave(s, s.wave + 1);
    return;
  }
  if (s.wave < l.waves) {
    startLevelWave(s, s.wave + 1);
    return;
  }
  if (l.boss && s.boss === null) {
    s.arrival = 0;
    s.formation = null; // the level's waves are done: no slots for a boss round
    s.rageTicks = 0; // and no formation left to rage over its patriarch (spec §2)
    spawnBoss(s, l.boss);
    return;
  }
  s.arrival = 0;
  s.cleared = true;
  s.events.push({ tick: s.tick, type: 'level_cleared' });
}
