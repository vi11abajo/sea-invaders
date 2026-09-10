import type { Rng } from './rng';

/** Ship target in integer milli-units, as produced by the touch layer. */
export interface Input {
  x: number;
  y: number;
}

export interface Ship {
  x: number;
  y: number;
  /** Ticks until the next automatic shot. */
  cooldown: number;
  /** Remaining invulnerability ticks after a hit. */
  invuln: number;
  lives: number;
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Crab {
  x: number;
  y: number;
  /** Colour/type index in [0, CRAB.kinds). */
  kind: number;
}

export interface GameState {
  tick: number;
  wave: number;
  /** Crabs spawned in the current wave; drives the speed-up curve. */
  waveTotal: number;
  score: number;
  kills: number;
  over: boolean;
  /** Formation direction: 1 = right, -1 = left. */
  dir: number;
  ship: Ship;
  shots: Bullet[];
  enemyShots: Bullet[];
  crabs: Crab[];
  rngWaves: Rng;
  rngFire: Rng;
}
