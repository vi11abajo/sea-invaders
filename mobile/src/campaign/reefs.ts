import { currentLevelId, LEVELS_PER_REEF, REEFS, type CampaignProgress, type CrabType } from '@sea-invaders/core';

/** Reef 1..5 display names: spec §7. Shared by the campaign map, LevelIntro and BossIntro. */
export const REEF_NAMES = ['Kelp Shallows', 'Coral Ridge', 'Sunlit Trench', 'Crimson Deep', 'The Void'] as const;

/**
 * Campaign-map accent colour per reef (owner design 2026-09-13, `CampaignMap.dc.html`'s `REEFS`
 * table). Deliberately distinct from `REEF_PROGRESS` in `ui/tokens.ts`, which other screens
 * (result, HUD) keep using unchanged.
 */
export const REEF_ACCENT = ['#5497D5', '#43B4CA', '#FFC526', '#F48252', '#9945FF'] as const;

/** The crab kind each reef introduces, with the capitalised display name shown in stat tiles. */
export const REEF_NEW_KIND: readonly { kind: CrabType; name: string }[] = [
  { kind: 'normal', name: 'Normal' },
  { kind: 'armored', name: 'Armored' },
  { kind: 'swift', name: 'Swift' },
  { kind: 'heavy', name: 'Heavy' },
  { kind: 'elder', name: 'Elder' },
];

/**
 * "New enemy this reef" copy for the level sheet (owner copy, 2026-09-13): reef 1 is just "Crab"
 * since it has no prior reef to contrast with; every later reef reads "<Name> crab".
 */
export function reefNewEnemyCopy(reef: number): string {
  const kind = REEF_NEW_KIND[reef - 1]!;
  return reef === 1 ? 'Crab' : `${kind.name} crab`;
}

/**
 * Boss ability per reef, shown on the boss sheet (owner ruling, 2026-09-13): the mock's "Meteor"
 * is rendered as "Sunfire" to respect the ocean lore (no meteors underwater).
 */
export const BOSS_ABILITY = ['Regen', 'Shield', 'Sunfire', 'Rage', 'Freeze'] as const;

/**
 * Two-line lore legend per reef (owner copy, 2026-09-13), shown in the level/boss sheet's info
 * panel (index = reef − 1).
 */
export const REEF_LEGENDS = [
  "The invasion began in the kelp. Emerald Warlord's scouts probe the reef's edge, and only Octopi is awake to answer.",
  'Azure Leviathan claimed the coral for its armored legions. Every ridge you clear is a home given back.',
  'Sunlight still reaches the trench, and Solar Kraken turns it into a rain of fire. Its quickest crabs loose the most shots.',
  "Red water, no sun. Crimson Behemoth feeds its rage on the reef's fear, and its crabs carry shots that hit twice as hard.",
  'Beyond the last light waits Void Sovereign, who tears the sea itself. Win here, and the ocean is free.',
] as const;

/** A vertical (or horizontal, for `glow`) colour ramp: colours in order with matching stops (0..1). */
interface Gradient {
  colors: readonly string[];
  positions: readonly number[];
}

export interface ReefWorld {
  /** Full-screen background water gradient, top -> bottom. */
  bg: Gradient;
  /** The top water-light glow band, left -> right (three colours, per `CampaignMap.dc.html`). */
  glow: readonly string[];
  /** The two skewed light rays, each already carrying its own alpha. */
  ray: string;
  ray2: string;
  /** Seabed dome fill gradient, top -> bottom. */
  floor: Gradient;
  /** Every third flora bar (index 0, 3, 6) uses this accent; the rest use `REEF_ACCENT`. */
  floraAccent: string;
}

/** Per-reef map world, transcribed from `CampaignMap.dc.html`'s `REEFS` table (reefs 1..5 only — reef 6 is not built). */
export const REEF_WORLD: readonly ReefWorld[] = [
  {
    bg: { colors: ['#123E4A', '#0B2733', '#06141B'], positions: [0, 0.45, 1] },
    glow: ['#43B4CA', '#28E0B9', '#5497D5'],
    ray: 'rgba(255,255,255,0.26)',
    ray2: 'rgba(40,224,185,0.3)',
    floor: { colors: ['#1E5C7A', '#06141B', '#06141B'], positions: [0, 0.75, 1] },
    floraAccent: '#55E9AB',
  },
  {
    bg: { colors: ['#0E2F55', '#0A2039', '#05101C'], positions: [0, 0.5, 1] },
    glow: ['#5497D5', '#43B4CA', '#8752F3'],
    ray: 'rgba(84,151,213,0.34)',
    ray2: 'rgba(255,255,255,0.2)',
    floor: { colors: ['#1B4A6E', '#05101C', '#05101C'], positions: [0, 0.75, 1] },
    floraAccent: '#CA9FF5',
  },
  {
    bg: { colors: ['#2A5E63', '#123A42', '#07171C'], positions: [0, 0.45, 1] },
    glow: ['#FFC526', '#CFF15E', '#28E0B9'],
    ray: 'rgba(255,197,38,0.34)',
    ray2: 'rgba(207,241,94,0.3)',
    floor: { colors: ['#2E6B62', '#07171C', '#07171C'], positions: [0, 0.75, 1] },
    floraAccent: '#CFF15E',
  },
  {
    bg: { colors: ['#3A0F16', '#1C0710', '#0A0206'], positions: [0, 0.5, 1] },
    glow: ['#F48252', '#9945FF', '#F48252'],
    ray: 'rgba(244,130,82,0.34)',
    ray2: 'rgba(153,69,255,0.26)',
    floor: { colors: ['#5A1620', '#0A0206', '#0A0206'], positions: [0, 0.75, 1] },
    floraAccent: '#F48252',
  },
  {
    bg: { colors: ['#14001D', '#07010C', '#000000'], positions: [0, 0.55, 1] },
    glow: ['#9945FF', '#8752F3', '#5497D5'],
    ray: 'rgba(153,69,255,0.4)',
    ray2: 'rgba(40,224,185,0.22)',
    floor: { colors: ['#241036', '#000000', '#000000'], positions: [0, 0.75, 1] },
    floraAccent: '#CA9FF5',
  },
];

export type LevelState = 'current' | 'cleared' | 'locked';

/**
 * The one true state for level id `1..30` — the map's nodes and both sheets all derive their
 * state from this, so they can never disagree (fix round 1, 2026-09-13). `currentLevelId` only
 * takes priority while the campaign isn't finished:
 * - A reef loss resets `progress.level` to 1 but keeps `cleared[]` as-is, so `currentLevelId` can
 *   point at a level that's already `cleared` (e.g. levels 1-3 cleared, then a loss on level 4
 *   resets to level 1 — level 1 must still read as the level to play next, not a replay).
 * - Clearing level 30 leaves `currentLevelId` stuck at 30 forever (`applyLevelResult`'s
 *   `campaign_complete` branch pins `reef`/`level` at the last row) — once `cleared[29]` is true
 *   no level is "current" any more; level 30 itself reads as `cleared`.
 */
export function levelState(progress: CampaignProgress, id: number): LevelState {
  const campaignComplete = progress.cleared[REEFS * LEVELS_PER_REEF - 1] === true;
  if (!campaignComplete && id === currentLevelId(progress)) return 'current';
  return progress.cleared[id - 1] ? 'cleared' : 'locked';
}

export interface ReefProgress {
  /** Levels cleared within this reef, 0..6, counted straight from the `cleared` array. */
  cleared: number;
  /** All 6 of this reef's levels are cleared. */
  reefCleared: boolean;
  /** A reef past the one currently being played: its levels show locked on the map. */
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
