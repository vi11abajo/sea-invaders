export type Formation = 'classic' | 'fish' | 'diamond' | 'ring' | 'jellyfish' | 'octopus' | 'shell' | 'wreck';
export type CrabType = 'normal' | 'armored' | 'swift' | 'heavy' | 'elder';

export interface LevelSpec {
  id: number;
  reef: number;
  index: number;
  waves: number;
  /** The first wave's silhouette, the level's headline (shown on the Level-start screen). */
  formation: Formation;
  /** The silhouette of every wave in order (`waves` entries, all distinct): the level's headline first, then a fixed shuffle (owner ruling 2026-09-17: no repeats within a level). */
  formations: readonly Formation[];
  kinds: CrabType[];
  speedOffset: number;
  fireOffset: number;
  boss?: 1 | 2 | 3 | 4 | 5;
}

/**
 * The five crab kinds in tier order, weakest first (spec §2). A reef's pool is the first `reef` of
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
 * The kind index a formation cell of each tier 0..4 takes from a pool of `n` kinds (spec §2,
 * amended 2026-09-17): an explicit table, not a formula. The row for four kinds is the amendment
 * — reef 4's tiers 3 and 4 are both `heavy`, because the red crab's two-life shot is that reef's
 * headline mechanic and the round-half-up formula it replaces fielded red on the top tier alone.
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
 * The crab kinds a daily or practice wave may draw a row from (spec §2): wave 1 is green only and
 * each wave adds the next kind, up to all five from wave 5 on. Colours mean the same thing here as
 * in the campaign.
 */
export function dailyPool(wave: number): CrabType[] {
  return REEF_KINDS.slice(0, Math.min(Math.max(wave, 1), REEF_KINDS.length));
}

/**
 * Builds one level row: `reef`/`index` come from `id` (6 levels per reef, boss on the sixth).
 * `speedOffset`/`fireOffset` ramp both across reefs and across a reef's own levels (spec §14
 * amendment, table v2): `3*(reef-1) + (index-1)` and `8*(reef-1) + 3*(index-1)` for a regular row;
 * a boss row (index 6) drops the `(index-1)` term and uses only the reef base. Boss rows pass
 * `waves: 0` and the K-pool of their reef so the row still type-checks even though no wave is
 * spawned from it.
 */
function row(
  id: number,
  formations: readonly Formation[],
  kinds: CrabType[],
  boss?: 1 | 2 | 3 | 4 | 5,
): LevelSpec {
  const reef = Math.floor((id - 1) / 6) + 1;
  const index = ((id - 1) % 6) + 1;
  const indexOffset = boss === undefined ? index - 1 : 0;
  return {
    id,
    reef,
    index,
    waves: formations.length,
    formation: formations[0] ?? 'classic',
    formations,
    kinds,
    speedOffset: 3 * (reef - 1) + indexOffset,
    fireOffset: 8 * (reef - 1) + 3 * indexOffset,
    ...(boss === undefined ? {} : { boss }),
  };
}

/**
 * The 30-level campaign table, transcribed verbatim from spec §2. Data only: balance changes edit
 * rows, never code. A row lists its waves' silhouettes in order - the first is the level's headline,
 * the rest a fixed shuffle drawn once (owner ruling 2026-09-17: no repeats within a level, and no
 * two neighbouring levels opening their second wave alike) - so a row carries no size —
 * the template's own shape sets the crab count.
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
