import { idiv } from './fixed';
import type { BossKind } from './types';

/**
 * The eight silhouettes of the first campaign (unchanged) plus the nine of the second
 * ("Reefs 6-10"): five more static shapes, the three living ones — `whirlpool` rotates,
 * `claws` splits, `manta` reforms — and `spearhead`, the shape a reforming wave falls back into.
 * `spearhead` is a template only: `FORMATIONS` leaves it out, so no level chain can list it.
 */
export type Formation =
  | 'classic' | 'fish' | 'diamond' | 'ring' | 'jellyfish' | 'octopus' | 'shell' | 'wreck'
  | 'trident' | 'anchor' | 'turtle' | 'crown' | 'starfish'
  | 'whirlpool' | 'claws' | 'manta' | 'spearhead';

/**
 * The five legacy kinds (reefs 1-5, unchanged) plus the five veteran kinds of reefs 6-10 (the
 * "Reefs 6-10" design): warden, herald, bubbler, bombardier and patriarch, each with the skill
 * `sim/veterans.ts` gives it. `REEF_ROSTERS` is where a veteran actually enters a reef's
 * pool, and `ALL_KINDS` is where the daily/practice grid does.
 */
export type CrabType =
  | 'normal' | 'armored' | 'swift' | 'heavy' | 'elder'
  | 'warden' | 'herald' | 'bubbler' | 'bombardier' | 'patriarch';

export interface LevelSpec {
  id: number;
  reef: number;
  index: number;
  waves: number;
  /** The first wave's silhouette, the level's headline (shown on the Level-start screen). */
  formation: Formation;
  /** The silhouette of every wave in order (`waves` entries, all distinct): the level's headline first, then a fixed shuffle (no repeats within a level). */
  formations: readonly Formation[];
  kinds: CrabType[];
  speedOffset: number;
  fireOffset: number;
  boss?: BossKind;
  /**
   * Per-wave roster override (reefs 6-10 only): when present, wave `w` fields
   * `rosters[w-1]` instead of `kinds`. Only the first level of a reef (index 1) carries one — waves
   * 1 and 3 the previous reef's roster, waves 2 and 4 the reef's own, so its new veteran is
   * introduced gently rather than filling the very first wave. Every other row leaves this
   * `undefined` and `startLevelWave` falls back to `kinds` for every wave.
   */
  rosters?: readonly (readonly CrabType[])[];
}

/**
 * The five crab kinds in tier order, weakest first. A reef's pool is the first `reef` of
 * them, so reef 1 fields nothing but green crabs and reef 5 has one kind per formation tier; the
 * daily and practice waves widen through the same list, one kind per wave.
 */
export const REEF_KINDS: readonly CrabType[] = ['normal', 'armored', 'swift', 'heavy', 'elder'];

/** The pool a reef draws its tiers from: the first `reef` kinds of `REEF_KINDS`. */
function reefKinds(reef: number): CrabType[] {
  return REEF_KINDS.slice(0, reef);
}

const K1 = reefKinds(1);
const K2 = reefKinds(2);
const K3 = reefKinds(3);
const K4 = reefKinds(4);
const K5 = reefKinds(5);

/**
 * The five reefs 6-10 rosters, tier 0 (bottom row) through tier 4 (top row) left to
 * right: each reef keeps its predecessor's veteran and its own new one, so a reef's headline
 * mechanic always sits on the top tier. Five kinds per roster means `TIER_KINDS[5]` — the identity
 * row — is what actually spreads them over a silhouette's tiers.
 */
const K6: CrabType[] = ['normal', 'armored', 'heavy', 'elder', 'warden'];
const K7: CrabType[] = ['armored', 'swift', 'elder', 'warden', 'herald'];
const K8: CrabType[] = ['armored', 'heavy', 'warden', 'herald', 'bubbler'];
const K9: CrabType[] = ['swift', 'elder', 'warden', 'bubbler', 'bombardier'];
const K10: CrabType[] = ['elder', 'warden', 'herald', 'bombardier', 'patriarch'];

/** The five rosters above, keyed by reef: what other code (and this file's own tests) reads them by. */
export const REEF_ROSTERS: Readonly<Record<6 | 7 | 8 | 9 | 10, readonly CrabType[]>> = {
  6: K6, 7: K7, 8: K8, 9: K9, 10: K10,
};

/**
 * The kind index a formation cell of each tier 0..4 takes from a pool of `n` kinds: an explicit
 * table, not a formula. The row for four kinds is a deliberate exception — reef 4's tiers 3 and 4
 * are both `heavy`, because the red crab's two-life shot is that reef's headline mechanic, where a
 * plain round-half-up split would have put red on the top tier alone.
 */
const TIER_KINDS: Record<1 | 2 | 3 | 4 | 5, readonly number[]> = {
  1: [0, 0, 0, 0, 0],
  2: [0, 0, 1, 1, 1],
  3: [0, 1, 1, 2, 2],
  4: [0, 1, 2, 3, 3],
  5: [0, 1, 2, 3, 4],
};

/**
 * The kind a formation cell of tier `t` (0 at the bottom row, 4 at the top) gets from `kinds`:
 * `TIER_KINDS` row for the pool's size, read at `t`. A one-kind pool paints every tier the same;
 * a five-kind pool gives tier and kind one for one.
 */
export function kindForTier(kinds: readonly CrabType[], tier: number): CrabType {
  const row = TIER_KINDS[kinds.length as 1 | 2 | 3 | 4 | 5];
  return kinds[row[tier]!]!;
}

/**
 * Every crab kind a daily or practice wave may ever draw a row from, in the order the pool widens
 * through them: the five legacy kinds, then the five veterans in reef order.
 */
export const ALL_KINDS: readonly CrabType[] = [...REEF_KINDS, 'warden', 'herald', 'bubbler', 'bombardier', 'patriarch'];

/**
 * Waves between two veterans joining the daily/practice pool from wave 6 on: the warden at wave 6,
 * then the herald, bubbler, bombardier and patriarch every `DAILY_VETERAN_EVERY` waves after
 * (8, 10, 12, 14). Widened from 1 (a new veteran every wave) to smooth the climb a daily/practice
 * run takes after wave 5: the same five veterans still arrive, just spread over twice as many
 * waves, so the pool no longer widens faster than a player can adjust to it. The top of the pool —
 * all ten kinds — still lands from wave 14 on, one wave earlier than the fire ramp reaches its own
 * cap (see `fireRamp` in `sim/crabs.ts`), so the daily/practice ceiling is unchanged, only later.
 */
export const DAILY_VETERAN_EVERY = 2;

/**
 * The crab kinds a daily or practice wave may draw a row from: wave 1
 * is green only and each wave adds the next kind of `ALL_KINDS` — the five legacy ones first, then
 * one new veteran every `DAILY_VETERAN_EVERY` waves from wave 6 on — stopping once it has all ten
 * from wave 14 on. Waves 1-5 are exactly the pre-reefs-6-10 behaviour (`REEF_KINDS.slice(0, wave)`),
 * since `ALL_KINDS` starts with `REEF_KINDS` itself. Colours mean the same thing here as in the
 * campaign.
 */
export function dailyPool(wave: number): CrabType[] {
  const w = Math.max(wave, 1);
  const legacy = REEF_KINDS.length; // 5: waves 1-5 unchanged
  const n = w <= legacy ? w : legacy + 1 + idiv(w - legacy - 1, DAILY_VETERAN_EVERY);
  return ALL_KINDS.slice(0, Math.min(n, ALL_KINDS.length));
}

/**
 * Builds one level row: `reef`/`index` come from `id` (6 levels per reef, boss on the sixth).
 * `speedOffset`/`fireOffset` ramp both across reefs and across a reef's own levels, by one of two
 * formulas depending which campaign `reef` falls in: reefs 1-5 keep the
 * first campaign's own `3*(reef-1) + (index-1)` and
 * `8*(reef-1) + 3*(index-1)`; reefs 6-10 use the second campaign's `14 + 2*(reef-6) +
 * (index-1)` and `40 + 5*(reef-6) + 2*(index-1)`. Either way a boss row (index 6) drops the
 * `(index-1)` term and uses only the reef base. Boss rows pass `waves: 0` and the K-pool of their
 * reef so the row still type-checks even though no wave is spawned from it.
 *
 * `rosters`, present only on the first level of a reef 6-10, overrides `kinds` per wave;
 * every other row leaves it undefined and `startLevelWave` falls back to `kinds` for every wave.
 */
function row(
  id: number,
  formations: readonly Formation[],
  kinds: CrabType[],
  boss?: BossKind,
  rosters?: readonly (readonly CrabType[])[],
): LevelSpec {
  const reef = Math.floor((id - 1) / 6) + 1;
  const index = ((id - 1) % 6) + 1;
  const indexOffset = boss === undefined ? index - 1 : 0;
  const offsets = reef <= 5
    ? { speedOffset: 3 * (reef - 1) + indexOffset, fireOffset: 8 * (reef - 1) + 3 * indexOffset }
    : { speedOffset: 14 + 2 * (reef - 6) + indexOffset, fireOffset: 40 + 5 * (reef - 6) + 2 * indexOffset };
  return {
    id,
    reef,
    index,
    waves: formations.length,
    formation: formations[0] ?? 'classic',
    formations,
    kinds,
    ...offsets,
    ...(boss === undefined ? {} : { boss }),
    ...(rosters === undefined ? {} : { rosters }),
  };
}

/**
 * The 60-level campaign table: the first campaign's 30 rows (byte-identical since core
 * v10) followed by reefs 6-10's 30, both transcribed verbatim. Data only: balance changes
 * edit rows, never code. A row lists its waves' silhouettes in order - the first is the level's
 * headline, the rest a fixed shuffle drawn once (no repeats within a
 * level, and no two neighbouring levels opening their second wave alike) - so a row carries no size
 * — the template's own shape sets the crab count.
 */
export const LEVELS: readonly LevelSpec[] = [
  row(1, ['classic', 'shell'], K1),
  row(2, ['fish', 'ring'], K1),
  row(3, ['diamond', 'jellyfish', 'octopus'], K1),
  row(4, ['jellyfish', 'wreck', 'octopus'], K1),
  row(5, ['wreck', 'fish', 'ring', 'classic'], K1),
  row(6, [], K1, 1),

  row(7, ['classic', 'ring', 'shell'], K2),
  row(8, ['shell', 'wreck', 'classic'], K2),
  row(9, ['fish', 'ring', 'diamond'], K2),
  row(10, ['ring', 'fish', 'jellyfish', 'shell'], K2),
  row(11, ['octopus', 'shell', 'jellyfish', 'classic'], K2),
  row(12, [], K2, 2),

  row(13, ['diamond', 'ring', 'octopus'], K3),
  row(14, ['classic', 'jellyfish', 'ring', 'shell'], K3),
  row(15, ['wreck', 'fish', 'classic', 'diamond'], K3),
  row(16, ['jellyfish', 'shell', 'diamond', 'fish'], K3),
  row(17, ['ring', 'classic', 'octopus', 'shell', 'wreck'], K3),
  row(18, [], K3, 3),

  row(19, ['fish', 'octopus', 'wreck', 'classic'], K4),
  row(20, ['shell', 'fish', 'jellyfish', 'ring'], K4),
  row(21, ['octopus', 'ring', 'classic', 'fish'], K4),
  row(22, ['wreck', 'octopus', 'fish', 'diamond', 'shell'], K4),
  row(23, ['classic', 'fish', 'jellyfish', 'ring', 'diamond'], K4),
  row(24, [], K4, 4),

  row(25, ['jellyfish', 'octopus', 'classic', 'fish'], K5),
  row(26, ['shell', 'wreck', 'ring', 'classic', 'jellyfish'], K5),
  row(27, ['diamond', 'classic', 'shell', 'ring', 'wreck'], K5),
  row(28, ['octopus', 'shell', 'ring', 'jellyfish', 'wreck'], K5),
  row(29, ['wreck', 'fish', 'diamond', 'classic', 'octopus'], K5),
  row(30, [], K5, 5),

  // Reef 6: the warden joins K5's five. Level 31, the reef's first, eases it in — waves 1
  // and 3 still field K5 (the previous reef's pool), waves 2 and 4 already field K6.
  row(31, ['wreck', 'octopus', 'crown', 'turtle'], K6, undefined, [K5, K6, K5, K6]),
  row(32, ['manta', 'octopus', 'wreck', 'ring', 'trident'], K6),
  row(33, ['whirlpool', 'anchor', 'ring', 'classic', 'diamond'], K6),
  row(34, ['shell', 'ring', 'jellyfish', 'claws', 'turtle'], K6),
  row(35, ['wreck', 'fish', 'whirlpool', 'ring', 'turtle'], K6),
  row(36, [], K6, 6),

  // Reef 7: the herald joins. Level 37 eases it in against K6.
  row(37, ['trident', 'shell', 'wreck', 'turtle'], K7, undefined, [K6, K7, K6, K7]),
  row(38, ['diamond', 'anchor', 'turtle', 'wreck', 'trident'], K7),
  row(39, ['manta', 'crown', 'starfish', 'fish', 'jellyfish'], K7),
  row(40, ['classic', 'claws', 'starfish', 'diamond', 'wreck'], K7),
  row(41, ['jellyfish', 'starfish', 'anchor', 'manta', 'fish'], K7),
  row(42, [], K7, 7),

  // Reef 8: the bubbler joins. Level 43 eases it in against K7.
  row(43, ['diamond', 'turtle', 'octopus', 'crown'], K8, undefined, [K7, K8, K7, K8]),
  row(44, ['diamond', 'fish', 'classic', 'trident', 'claws'], K8),
  row(45, ['anchor', 'ring', 'octopus', 'whirlpool', 'crown'], K8),
  row(46, ['ring', 'anchor', 'shell', 'wreck', 'claws'], K8),
  row(47, ['classic', 'fish', 'trident', 'turtle', 'whirlpool'], K8),
  row(48, [], K8, 8),

  // Reef 9: the bombardier joins. Level 49 eases it in against K8.
  row(49, ['fish', 'crown', 'trident', 'jellyfish'], K9, undefined, [K8, K9, K8, K9]),
  row(50, ['shell', 'wreck', 'turtle', 'anchor', 'fish'], K9),
  row(51, ['shell', 'jellyfish', 'whirlpool', 'crown', 'anchor'], K9),
  row(52, ['crown', 'ring', 'jellyfish', 'classic', 'whirlpool'], K9),
  row(53, ['octopus', 'crown', 'shell', 'jellyfish', 'manta'], K9),
  row(54, [], K9, 9),

  // Reef 10: the patriarch joins. Level 55 eases it in against K9.
  row(55, ['anchor', 'octopus', 'turtle', 'crown'], K10, undefined, [K9, K10, K9, K10]),
  row(56, ['anchor', 'jellyfish', 'ring', 'trident', 'crown'], K10),
  row(57, ['claws', 'diamond', 'shell', 'crown', 'manta'], K10),
  row(58, ['trident', 'manta', 'anchor', 'whirlpool', 'shell'], K10),
  row(59, ['manta', 'trident', 'jellyfish', 'octopus', 'wreck'], K10),
  row(60, [], K10, 10),
];

/** Looks up a level by id; throws on an unknown id (a replay or caller bug). */
export function levelById(id: number): LevelSpec {
  const l = LEVELS.find((l) => l.id === id);
  if (!l) throw new Error(`unknown level id ${id}`);
  return l;
}

/** Per-level seed derived from the run seed, so each level's RNG streams are independent of the others. */
export function levelSeed(runSeed: string, id: number): string {
  return `${runSeed}:level:${id}`;
}
