import { LEVELS_PER_REEF, type CampaignProgress } from '@sea-invaders/core';

/** Reef 1..5 display names: spec §7. Shared by the campaign list, the reef screen, LevelIntro and BossIntro. */
export const REEF_NAMES = ['Kelp Shallows', 'Coral Ridge', 'Sunlit Trench', 'Crimson Deep', 'The Void'] as const;

/** Two-line lore legend per reef (owner copy, 2026-09-13), shown on the reef card and again atop its reef screen. */
export const REEF_LEGENDS = [
  "The invasion began in the kelp. Emerald Warlord's scouts probe the reef's edge, and only Octopi is awake to answer.",
  'Azure Leviathan claimed the coral for its armored legions. Every ridge you clear is a home given back.',
  'Sunlight still reaches the trench, and Solar Kraken turns it into a rain of fire. Its fast swimmers guard the light.',
  "Red water, no sun. Crimson Behemoth feeds its rage on the reef's fear, and its crabs fan out in every direction.",
  'Beyond the last light waits Void Sovereign, who tears the sea itself. Win here, and the ocean is free.',
] as const;

export interface ReefProgress {
  /** Levels cleared within this reef, 0..6, counted straight from the `cleared` array. */
  cleared: number;
  /** All 6 of this reef's levels are cleared. */
  reefCleared: boolean;
  /** A reef past the one currently being played: its levels show locked on the reef screen. */
  locked: boolean;
  /** The reef currently being played, and not yet fully cleared. */
  current: boolean;
}

/**
 * Per-reef progress derived from the `cleared` array, never from `progress.reef`/`progress.level`
 * alone: those two only point at the *next* level to play, and can lag behind what's actually
 * cleared — a reef loss rewinds them to that reef's first level even though earlier levels in it
 * stay cleared, and clearing level 30 leaves them pointing at reef 5 / level 6 forever.
 */
export function reefProgress(progress: CampaignProgress, reef: number): ReefProgress {
  const first = (reef - 1) * LEVELS_PER_REEF;
  let cleared = 0;
  for (let i = 0; i < LEVELS_PER_REEF; i++) {
    if (progress.cleared[first + i]) cleared++;
  }
  const reefCleared = cleared === LEVELS_PER_REEF;
  const locked = reef > progress.reef;
  const current = reef === progress.reef && !reefCleared;
  return { cleared, reefCleared, locked, current };
}
