import { ARRIVAL, CRAB, CRAB_TYPES, FIELD_W, SHIP, TYPE_COLOUR } from './config';
import { idiv } from './fixed';
import { formationPositions } from './formations';
import type { CrabType, Formation } from './levels';
import { Rng } from './rng';
import type { RunConfig } from './run';
import { spawnBoss } from './sim/boss';
import type { GameState, Input } from './types';

/** Where the ship starts; also the input a replay assumes before its first recorded change. */
export const INITIAL_INPUT: Input = Object.freeze({ x: idiv(FIELD_W, 2), y: SHIP.startY });

export function createGame(seed: string, run: RunConfig): GameState {
  const s: GameState = {
    tick: 0,
    wave: 0,
    waveTotal: 0,
    score: 0,
    kills: 0,
    over: false,
    dir: 1,
    ship: { x: INITIAL_INPUT.x, y: INITIAL_INPUT.y, cooldown: SHIP.fireInterval, invuln: 0, lives: run.lives },
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
  };
  if (run.level) {
    if (run.level.waves > 0) startLevelWave(s, 1);
    else spawnBoss(s, run.level.boss!);
  } else {
    spawnWave(s, 1);
  }
  return s;
}

/** Replaces the crabs with wave `wave`: 6 columns, 3 to 5 rows, one random kind per row. */
export function spawnWave(s: GameState, wave: number): void {
  const rows = Math.min(2 + wave, 5);
  const x0 = idiv(FIELD_W - (CRAB.cols - 1) * CRAB.gapX, 2);
  s.wave = wave;
  s.crabs = [];
  for (let r = 0; r < rows; r++) {
    const kind = s.rngWaves.nextInt(CRAB.kinds);
    for (let c = 0; c < CRAB.cols; c++) {
      const x = x0 + c * CRAB.gapX;
      const y = CRAB.startY + r * CRAB.gapY;
      s.crabs.push({ x, y, kind, type: 'normal', hp: 1, dive: 0, homeX: x, homeY: y });
    }
  }
  s.dir = s.rngWaves.nextInt(2) === 0 ? 1 : -1;
  s.waveTotal = s.crabs.length;
}

/**
 * Replaces the crabs with a named formation of mixed crab kinds (the campaign's spawn path).
 * Types cycle through `kinds` over the positions sorted by y descending then x ascending (an
 * explicit tie-break), so a pool that ends in 'swift' places swift crabs on the rows closest to
 * the player. Colour is a fixed cosmetic per type (`TYPE_COLOUR`, spec §14 amendment) rather than
 * drawn: the only RNG draw here is the direction draw, so the draw count no longer depends on
 * `rows` or the formation's shape.
 */
export function spawnFormation(
  s: GameState,
  spec: { formation: Formation; rows: number; cols: number; kinds: CrabType[] },
): void {
  const { formation, rows, cols, kinds } = spec;
  const positions = formationPositions(formation, rows, cols);

  const typeOrder = [...positions].sort((a, b) => (b.y - a.y) || (a.x - b.x));
  const typeByPos = new Map<string, CrabType>();
  typeOrder.forEach((p, i) => typeByPos.set(`${p.x},${p.y}`, kinds[i % kinds.length]!));

  s.crabs = positions.map((p) => {
    const type = typeByPos.get(`${p.x},${p.y}`)!;
    return {
      x: p.x,
      y: p.y,
      kind: TYPE_COLOUR[type],
      type,
      hp: CRAB_TYPES[type].hp,
      dive: 0,
      homeX: p.x,
      homeY: p.y,
    };
  });
  s.dir = s.rngWaves.nextInt(2) === 0 ? 1 : -1;
  s.waveTotal = s.crabs.length;
}

/**
 * Starts wave `wave` of the current level: rows grow by one every 2 waves, capped at 6. The
 * formation spawns `ARRIVAL.drop` units above its slots and descends into them over
 * `ARRIVAL.ticks` (spec §14 amendment); `nextWave`/`createGame` route every level wave through
 * here, so level 1 wave 1 arrives too.
 */
export function startLevelWave(s: GameState, wave: number): void {
  const l = s.run.level!;
  const rows = Math.min(6, l.rows + Math.floor((wave - 1) / 2));
  s.wave = wave;
  spawnFormation(s, { formation: l.formation, rows, cols: l.cols, kinds: l.kinds });
  for (const c of s.crabs) {
    c.y -= ARRIVAL.drop;
    c.homeY -= ARRIVAL.drop;
  }
  s.arrival = ARRIVAL.ticks;
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
