import {
  currentLevelId, LEGACY_LEVEL_COUNT, LEVEL_COUNT, LEVELS_PER_REEF, REEFS, type CampaignProgress, type CrabType,
} from '@sea-invaders/core';

/**
 * Throws unless `table` has exactly `REEFS` entries: every reef-indexed table
 * below is checked at module load, so a table left short after the campaign grows fails at import
 * time instead of silently reading past its end deep in a render.
 */
function assertReefTable(name: string, table: readonly unknown[]): void {
  if (table.length !== REEFS) throw new Error(`${name} must have ${REEFS} entries, has ${table.length}`);
}

/**
 * Reef 1..10 display names, shared by the campaign map, LevelIntro and BossIntro.
 */
export const REEF_NAMES = [
  'Kelp Shallows', 'Coral Ridge', 'Sunlit Trench', 'Crimson Deep', 'The Void',
  'Sunken Bastion', 'Glacier Reach', 'Corsair Cove', 'Stormbreak Shelf', 'The Hollow Throne',
] as const;
assertReefTable('REEF_NAMES', REEF_NAMES);

/**
 * Campaign-map accent colour per reef. Deliberately distinct from
 * `REEF_PROGRESS` in `ui/tokens.ts`, which other screens (result, HUD) keep using unchanged.
 */
export const REEF_ACCENT = [
  '#5497D5', '#43B4CA', '#FFC526', '#F48252', '#9945FF',
  '#55E9AB', '#7FD4FF', '#FFC526', '#F4604F', '#B57BFF',
] as const;
assertReefTable('REEF_ACCENT', REEF_ACCENT);

/** The crab kind each reef introduces, with the capitalised display name shown in stat tiles. */
export const REEF_NEW_KIND: readonly { kind: CrabType; name: string }[] = [
  { kind: 'normal', name: 'Normal' },
  { kind: 'armored', name: 'Armored' },
  { kind: 'swift', name: 'Swift' },
  { kind: 'heavy', name: 'Heavy' },
  { kind: 'elder', name: 'Elder' },
  { kind: 'warden', name: 'Warden' },
  { kind: 'herald', name: 'Herald' },
  { kind: 'bubbler', name: 'Bubbler' },
  { kind: 'bombardier', name: 'Bombardier' },
  { kind: 'patriarch', name: 'Patriarch' },
];
assertReefTable('REEF_NEW_KIND', REEF_NEW_KIND);

/**
 * The first reef with a veteran crab: where the first, five-reef campaign
 * ends and the second begins. Derived from the core's own counts, never hard-coded, so it stays
 * right if either one ever changes.
 */
export const FIRST_VETERAN_REEF = LEGACY_LEVEL_COUNT / LEVELS_PER_REEF + 1;

/**
 * "New enemy this reef" copy for the level sheet: reef 1 is just "Crab"
 * since it has no prior reef to contrast with; every later reef reads "<Name> crab".
 */
export function reefNewEnemyCopy(reef: number): string {
  const kind = REEF_NEW_KIND[reef - 1]!;
  return reef === 1 ? 'Crab' : `${kind.name} crab`;
}

/**
 * Boss ability per reef, shown on the boss sheet ("Meteor" renamed to "Sunfire" to respect the
 * ocean lore — no meteors underwater).
 */
export const BOSS_ABILITY = [
  'Regen', 'Shield', 'Sunfire', 'Rage', 'Freeze',
  'Bulwark', 'Crystals', 'Boarding', 'Stormlanes', 'Mirror',
] as const;
assertReefTable('BOSS_ABILITY', BOSS_ABILITY);

/**
 * Two-line lore legend per reef, shown in the level/boss sheet's info panel (index = reef − 1).
 */
export const REEF_LEGENDS = [
  "The invasion began in the kelp. Emerald Warlord's scouts probe the reef's edge, and only Octopi is awake to answer.",
  'Azure Leviathan claimed the coral for its armored legions. Every ridge you clear is a home given back.',
  'Sunlight still reaches the trench, and Solar Kraken turns it into a rain of fire. Its quickest crabs loose the most shots.',
  "Red water, no sun. Crimson Behemoth feeds its rage on the reef's fear, and its crabs carry shots that hit twice as hard.",
  'Beyond the last light waits Void Sovereign, who tears the sea itself. Win here, and the ocean is free.',
  'The ocean was free for one tide. Then the old guard rose from the drowned fort, shields first.',
  'Cold water, colder orders. The Castellan grows his walls out of the sea itself.',
  'Gold buys crews, and the Corsair has plenty of both. Sink the crew, keep the loot.',
  'The Tyrant does not aim. He chooses where you may stand.',
  'The last of them studied you the whole way down. Every trick you own, he owns too.',
] as const;
assertReefTable('REEF_LEGENDS', REEF_LEGENDS);

/** A vertical (or horizontal, for `glow`) colour ramp: colours in order with matching stops (0..1). */
interface Gradient {
  colors: readonly string[];
  positions: readonly number[];
}

export interface ReefWorld {
  /** Full-screen background water gradient, top -> bottom. */
  bg: Gradient;
  /** The top water-light glow band, left -> right (three colours). */
  glow: readonly string[];
  /** The two skewed light rays, each already carrying its own alpha. */
  ray: string;
  ray2: string;
  /** Seabed dome fill gradient, top -> bottom. */
  floor: Gradient;
  /** Every third flora bar (index 0, 3, 6) uses this accent; the rest use `REEF_ACCENT`. */
  floraAccent: string;
}

/**
 * Per-reef map world: reefs 6-10 read deeper and darker than the first five, each built around its
 * own reef: `floraAccent` is that reef's `REEF_ACCENT`, and one `glow` colour is that reef's boss
 * tint (`game/bossPalette.ts`'s `BOSS_HEX`). The five new entries' hex values are starting points,
 * tuned on device, the way the first five once were.
 */
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
  // Reef 6, Sunken Bastion: drowned stone, green-grey over near-black.
  {
    bg: { colors: ['#1A322B', '#0D1A16', '#050A08'], positions: [0, 0.45, 1] },
    glow: ['#2FBF71', '#55E9AB', '#3E5C52'],
    ray: 'rgba(47,191,113,0.3)',
    ray2: 'rgba(85,233,171,0.22)',
    floor: { colors: ['#274A3F', '#050A08', '#050A08'], positions: [0, 0.75, 1] },
    floraAccent: '#55E9AB',
  },
  // Reef 7, Glacier Reach: glacial pale blue and white light over deep navy.
  {
    bg: { colors: ['#0F2C4D', '#081A30', '#020814'], positions: [0, 0.45, 1] },
    glow: ['#4AA8FF', '#DFF3FF', '#7FD4FF'],
    ray: 'rgba(74,168,255,0.34)',
    ray2: 'rgba(223,243,255,0.26)',
    floor: { colors: ['#1B4468', '#020814', '#020814'], positions: [0, 0.75, 1] },
    floraAccent: '#7FD4FF',
  },
  // Reef 8, Corsair Cove: amber/gold light over dark teal.
  {
    bg: { colors: ['#123B3E', '#0A2426', '#03100F'], positions: [0, 0.45, 1] },
    glow: ['#FFB52E', '#FFC526', '#2E6B62'],
    ray: 'rgba(255,181,46,0.34)',
    ray2: 'rgba(255,197,38,0.26)',
    floor: { colors: ['#1E5450', '#03100F', '#03100F'], positions: [0, 0.75, 1] },
    floraAccent: '#FFC526',
  },
  // Reef 9, Stormbreak Shelf: storm grey with red lightning light.
  {
    bg: { colors: ['#1E242A', '#12161A', '#05060A'], positions: [0, 0.45, 1] },
    glow: ['#FF4D4D', '#F4604F', '#5C6B78'],
    ray: 'rgba(255,77,77,0.34)',
    ray2: 'rgba(150,160,170,0.22)',
    floor: { colors: ['#2A3238', '#05060A', '#05060A'], positions: [0, 0.75, 1] },
    floraAccent: '#F4604F',
  },
  // Reef 10, The Hollow Throne: violet over black, the darkest of all.
  {
    bg: { colors: ['#0A0012', '#050009', '#000000'], positions: [0, 0.55, 1] },
    glow: ['#B066FF', '#B57BFF', '#2C0A45'],
    ray: 'rgba(176,102,255,0.4)',
    ray2: 'rgba(181,123,255,0.22)',
    floor: { colors: ['#150022', '#000000', '#000000'], positions: [0, 0.75, 1] },
    floraAccent: '#B57BFF',
  },
];
assertReefTable('REEF_WORLD', REEF_WORLD);

export type LevelState = 'current' | 'cleared' | 'locked';

/**
 * The one true state for level id `1..LEVEL_COUNT` — the map's nodes and both sheets all derive
 * their state from this, so they can never disagree. `currentLevelId`
 * only takes priority while the campaign isn't finished:
 * - A reef loss resets `progress.level` to 1 but keeps `cleared[]` as-is, so `currentLevelId` can
 *   point at a level that's already `cleared` (e.g. levels 1-3 cleared, then a loss on level 4
 *   resets to level 1 — level 1 must still read as the level to play next, not a replay).
 * - Once the campaign's last level is cleared no level is "current" any more and it reads as
 *   `cleared`: `applyLevelResult`'s `campaign_complete` branch leaves the pointer stuck on the last
 *   row forever.
 */
export function levelState(progress: CampaignProgress, id: number): LevelState {
  const campaignComplete = progress.cleared[LEVEL_COUNT - 1] === true;
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
 * stay cleared, and clearing the campaign's last level carries them past the last reef.
 */
export function reefProgress(progress: CampaignProgress, reef: number): ReefProgress {
  const first = (reef - 1) * LEVELS_PER_REEF;
  let cleared = 0;
  for (let i = 0; i < LEVELS_PER_REEF; i++) {
    if (progress.cleared[first + i]) cleared++;
  }
  const reefCleared = cleared === LEVELS_PER_REEF;
  // A reef the player has fully cleared is never locked, wherever the pointer stands (a merge or a
  // reef-lost reset can leave the pointer behind cleared reefs).
  const locked = reef > progress.reef && !reefCleared;
  const current = reef === progress.reef && !reefCleared;
  return { cleared, reefCleared, locked, current };
}
