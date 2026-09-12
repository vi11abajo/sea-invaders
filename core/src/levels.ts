export type Formation = 'grid' | 'wedge' | 'wall' | 'checker' | 'columns' | 'ring';
export type CrabType = 'normal' | 'armored' | 'swift' | 'fanner' | 'diver';

export interface LevelSpec {
  id: number;
  reef: number;
  index: number;
  waves: number;
  formation: Formation;
  rows: number;
  cols: number;
  kinds: CrabType[];
  speedOffset: number;
  fireOffset: number;
  boss?: 1 | 2 | 3 | 4 | 5;
}

/**
 * Crab-kind pools, one per reef (spec §14 amendment, table v2): each reef's own new kind is listed
 * first (repeated) so the column cycle favours it over the pool's older kinds.
 */
const K1: CrabType[] = ['normal'];
const K2: CrabType[] = ['armored', 'armored', 'normal'];
const K3: CrabType[] = ['swift', 'swift', 'armored', 'normal'];
const K4: CrabType[] = ['fanner', 'fanner', 'swift', 'armored', 'normal'];
const K5: CrabType[] = ['diver', 'fanner', 'fanner', 'swift', 'armored', 'normal'];

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
  waves: number,
  formation: Formation,
  rows: number,
  cols: number,
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
    waves,
    formation,
    rows,
    cols,
    kinds,
    speedOffset: 3 * (reef - 1) + indexOffset,
    fireOffset: 8 * (reef - 1) + 3 * indexOffset,
    ...(boss === undefined ? {} : { boss }),
  };
}

/** The 30-level campaign table v2, transcribed verbatim from Task 23's brief. Data only: balance changes edit rows, never code. */
export const LEVELS: readonly LevelSpec[] = [
  row(1, 2, 'grid', 4, 6, K1),
  row(2, 2, 'wedge', 4, 6, K1),
  row(3, 3, 'wall', 2, 7, K1),
  row(4, 3, 'checker', 5, 6, K1),
  row(5, 4, 'columns', 5, 6, K1),
  row(6, 0, 'grid', 0, 0, K1, 1),

  row(7, 3, 'grid', 4, 6, K2),
  row(8, 3, 'ring', 4, 6, K2),
  row(9, 3, 'wedge', 5, 6, K2),
  row(10, 4, 'wall', 2, 8, K2),
  row(11, 4, 'checker', 6, 6, K2),
  row(12, 0, 'grid', 0, 0, K2, 2),

  row(13, 3, 'columns', 5, 6, K3),
  row(14, 4, 'grid', 5, 6, K3),
  row(15, 4, 'ring', 5, 6, K3),
  row(16, 4, 'wedge', 6, 6, K3),
  row(17, 5, 'wall', 2, 8, K3),
  row(18, 0, 'grid', 0, 0, K3, 3),

  row(19, 4, 'checker', 6, 6, K4),
  row(20, 4, 'columns', 6, 6, K4),
  row(21, 5, 'grid', 6, 6, K4),
  row(22, 5, 'ring', 5, 6, K4),
  row(23, 5, 'wedge', 6, 6, K4),
  row(24, 0, 'grid', 0, 0, K4, 4),

  row(25, 4, 'wall', 2, 8, K5),
  row(26, 5, 'checker', 6, 6, K5),
  row(27, 5, 'columns', 6, 6, K5),
  row(28, 5, 'grid', 6, 6, K5),
  row(29, 5, 'ring', 6, 6, K5),
  row(30, 0, 'grid', 0, 0, K5, 5),
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
