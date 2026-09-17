import { ARRIVAL, CRAB, CRAB_TYPES, FIELD_W, OCTOPI, TYPE_COLOUR, bonusLivesFor, fireIntervalFor } from './config';
import { idiv } from './fixed';
import { formationPositions } from './formations';
import { dailyPool, kindForTier, type CrabType, type Formation } from './levels';
import { Rng } from './rng';
import type { RunConfig } from './run';
import { spawnBoss } from './sim/boss';
import type { GameState, Input } from './types';

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
    scoreDecay: 0,
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
 */
export function spawnWave(s: GameState, wave: number): void {
  const rows = Math.min(2 + wave, 5);
  const pool = dailyPool(wave);
  const x0 = idiv(FIELD_W - (CRAB.cols - 1) * CRAB.gapX, 2);
  s.wave = wave;
  s.crabs = [];
  s.scoreDecay = 0; // spec C7: the score-decay clock resets at every wave start
  for (let r = 0; r < rows; r++) {
    const type = pool[s.rngWaves.nextInt(pool.length)]!;
    for (let c = 0; c < CRAB.cols; c++) {
      const x = x0 + c * CRAB.gapX;
      const y = CRAB.startY + r * CRAB.gapY;
      s.crabs.push({ x, y, kind: TYPE_COLOUR[type], type, hp: CRAB_TYPES[type].hp });
    }
  }
  s.dir = s.rngWaves.nextInt(2) === 0 ? 1 : -1;
  s.waveTotal = s.crabs.length;
}

/**
 * Replaces the crabs with a silhouette (the campaign's spawn path, spec §2). The template gives
 * every cell a tier, 0 on the bottom row up to 4 on the top, and `kindForTier` spreads the level's
 * reef pool over those tiers — so a reef-1 wave is all green, and a reef-5 wave has one kind per
 * tier, with the toughest crabs furthest from Octopi. Nothing here is drawn: the direction draw is
 * the only RNG draw, whatever the silhouette.
 */
export function spawnFormation(
  s: GameState,
  spec: { formation: Formation; kinds: readonly CrabType[] },
): void {
  s.crabs = formationPositions(spec.formation).map((p) => {
    const type = kindForTier(spec.kinds, p.tier);
    return { x: p.x, y: p.y, kind: TYPE_COLOUR[type], type, hp: CRAB_TYPES[type].hp };
  });
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
    spawnBoss(s, l.boss);
    return;
  }
  s.arrival = 0;
  s.cleared = true;
  s.events.push({ tick: s.tick, type: 'level_cleared' });
}
