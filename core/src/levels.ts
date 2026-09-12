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

/** Crab-kind pools, one per reef: spec §3.4. */
const K1: CrabType[] = ['normal'];
const K2: CrabType[] = [...K1, 'armored'];
const K3: CrabType[] = [...K2, 'swift'];
const K4: CrabType[] = [...K3, 'fanner'];
const K5: CrabType[] = [...K4, 'diver'];

/**
 * Builds one level row: `reef`/`index` come from `id` (6 levels per reef, boss on the sixth), and
 * `speedOffset`/`fireOffset` come from `reef` per spec §3.4. Boss rows pass `waves: 0` and the
 * K-pool of their reef so the row still type-checks even though no wave is spawned from it.
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
  return {
    id,
    reef,
    index,
    waves,
    formation,
    rows,
    cols,
    kinds,
    speedOffset: 2 * (reef - 1),
    fireOffset: 6 * (reef - 1),
    ...(boss === undefined ? {} : { boss }),
  };
}

/** The 30-level campaign table, transcribed verbatim from design spec §3.4. Data only: balance changes edit rows, never code. */
export const LEVELS: readonly LevelSpec[] = [
  row(1, 1, 'grid', 3, 5, K1),
  row(2, 2, 'wedge', 3, 6, K1),
  row(3, 2, 'wall', 2, 6, K2),
  row(4, 3, 'checker', 4, 6, K2),
  row(5, 3, 'columns', 4, 6, K2),
  row(6, 0, 'grid', 0, 0, K1, 1),

  row(7, 2, 'grid', 4, 6, K2),
  row(8, 2, 'ring', 3, 6, K3),
  row(9, 3, 'wedge', 4, 6, K3),
  row(10, 3, 'wall', 2, 7, K3),
  row(11, 3, 'checker', 5, 6, K3),
  row(12, 0, 'grid', 0, 0, K2, 2),

  row(13, 2, 'columns', 4, 6, K3),
  row(14, 3, 'grid', 5, 6, K4),
  row(15, 3, 'ring', 4, 6, K4),
  row(16, 3, 'wedge', 5, 6, K4),
  row(17, 4, 'wall', 2, 8, K4),
  row(18, 0, 'grid', 0, 0, K3, 3),

  row(19, 3, 'checker', 5, 6, K4),
  row(20, 3, 'columns', 5, 6, K5),
  row(21, 3, 'grid', 5, 6, K5),
  row(22, 4, 'ring', 4, 6, K5),
  row(23, 4, 'wedge', 5, 6, K5),
  row(24, 0, 'grid', 0, 0, K4, 4),

  row(25, 3, 'wall', 2, 8, K5),
  row(26, 4, 'checker', 6, 6, K5),
  row(27, 4, 'columns', 6, 6, K5),
  row(28, 4, 'grid', 6, 6, K5),
  row(29, 4, 'ring', 5, 6, K5),
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
