import { CRAB, FIELD_W, SHIP } from './config';
import { idiv } from './fixed';
import { Rng } from './rng';
import type { GameState, Input } from './types';

/** Where the ship starts; also the input a replay assumes before its first recorded change. */
export const INITIAL_INPUT: Input = Object.freeze({ x: idiv(FIELD_W, 2), y: SHIP.startY });

export function createGame(seed: string): GameState {
  const s: GameState = {
    tick: 0,
    wave: 0,
    waveTotal: 0,
    score: 0,
    kills: 0,
    over: false,
    dir: 1,
    ship: { x: INITIAL_INPUT.x, y: INITIAL_INPUT.y, cooldown: SHIP.fireInterval, invuln: 0, lives: SHIP.lives },
    shots: [],
    enemyShots: [],
    crabs: [],
    rngWaves: new Rng(`${seed}/waves`),
    rngFire: new Rng(`${seed}/fire`),
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
      s.crabs.push({ x: x0 + c * CRAB.gapX, y: CRAB.startY + r * CRAB.gapY, kind });
    }
  }
  s.dir = s.rngWaves.nextInt(2) === 0 ? 1 : -1;
  s.waveTotal = s.crabs.length;
}
