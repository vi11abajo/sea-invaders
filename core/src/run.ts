import { SHIP } from './config';
import type { LevelSpec } from './levels';

export type RunMode = 'daily' | 'practice' | 'campaign';

export interface RunConfig {
  mode: RunMode;
  /** Present only for campaign levels (and practice replays of them). */
  level?: LevelSpec;
  /** Lives the ship starts with: reef lives in the campaign, SHIP.lives otherwise. */
  lives: number;
  features: { boosts: boolean };
}

export const DAILY_RUN: RunConfig = Object.freeze({ mode: 'daily', lives: SHIP.lives, features: Object.freeze({ boosts: true }) }) as RunConfig;
export const PRACTICE_RUN: RunConfig = Object.freeze({ mode: 'practice', lives: SHIP.lives, features: Object.freeze({ boosts: true }) }) as RunConfig;
