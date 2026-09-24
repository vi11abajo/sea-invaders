import { OCTOPI } from './config';
import type { LevelSpec } from './levels';
import type { OctopiVariant } from './types';

export type RunMode = 'daily' | 'practice' | 'campaign';

export interface RunConfig {
  mode: RunMode;
  /** Present only for campaign levels (and practice replays of them). */
  level?: LevelSpec;
  /** Lives Octopi starts with: reef lives in the campaign, OCTOPI.lives otherwise. */
  lives: number;
  features: { boosts: boolean };
  /** The champion (bought or earned) for this run, or 'base': only ever non-'base' for a campaign run. */
  octopi: OctopiVariant;
}

export const DAILY_RUN: RunConfig = Object.freeze({ mode: 'daily', lives: OCTOPI.lives, features: Object.freeze({ boosts: true }), octopi: 'base' }) as RunConfig;
export const PRACTICE_RUN: RunConfig = Object.freeze({ mode: 'practice', lives: OCTOPI.lives, features: Object.freeze({ boosts: true }), octopi: 'base' }) as RunConfig;
