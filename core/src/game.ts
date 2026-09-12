import { CRAB, FIELD_W, SHIP } from './config';
import { idiv } from './fixed';
import { Rng } from './rng';
import type { RunConfig } from './run';
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
  };
  spawnWave(s, 1);
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
 * Advances past a cleared wave. Without a campaign level this is the endless behaviour unchanged;
 * with one, Task 3 replaces this branch, but Task 1 already marks the clear with an event.
 */
export function nextWave(s: GameState): void {
  if (s.run.level) {
    s.events.push({ tick: s.tick, type: 'wave_cleared' });
  }
  spawnWave(s, s.wave + 1);
}
