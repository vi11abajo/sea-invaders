import { CRAB, FIELD_W } from './config';
import { idiv } from './fixed';
import type { Formation } from './levels';

export interface Pos {
  x: number;
  y: number;
  /** Template row, 0 at the top. */
  row: number;
  /**
   * Template column, counted from the template's own column 0 — not from its first used column, so
   * two cells one gap apart are always one column apart whichever rows they sit on. The herald's aura
   * reads neighbourhoods straight off `row`/`col`.
   */
  col: number;
  /** Template tier, 0 on the bottom row up to 4 on the top one; `spawnFormation` turns it into a kind. */
  tier: number;
}

/**
 * How a wave carrying a silhouette moves. `march` is the classic block of core v10 and
 * every static silhouette keeps it, byte for byte; the three living behaviours are separate code
 * paths in `sim/living.ts` that only ever run for their own shape.
 */
export type FormationBehaviour = 'march' | 'rotate' | 'split' | 'reform';

/**
 * Horizontal room a formation keeps on each side of the field so it can march before bouncing.
 * Without it an 8-wide silhouette (gap compressed to fit exactly) touched both edges at once, hit
 * the wall test every tick and stepped down 250 units per tick — the "wall falls on Octopi" bug on
 * level 10.
 */
export const MARCH_MARGIN = 400;

/**
 * Where a formation's slot offsets hang off: the field's centre line at the top row's
 * depth, which is exactly where `formationPositions` centres every template. A wave's origin
 * marches with it, so a reform can drop the spearhead onto the origin and land it where the wave
 * actually stands.
 */
export const FORMATION_ORIGIN = { x: idiv(FIELD_W, 2), y: CRAB.startY } as const;

/** A template of this many rows uses `TALL_GAP_Y`, so it still fits the field. */
const TALL_ROWS = 7;
/** Rows in the tallest template used by any silhouette; it uses `TALLEST_GAP_Y`. */
const TALLEST_ROWS = 8;
/** Row gap for a 7-row template; shorter ones keep `CRAB.gapY`. */
const TALL_GAP_Y = 560;
/**
 * Row gap for an 8-row template (`jellyfish`, `octopus`). Chosen so the bottom row settles at
 * `CRAB.startY + 7 * 500` = 5000, exactly where the old six-row grid's bottom row sat: no
 * silhouette reaches deeper towards Octopi's ceiling than the game ever did before core v8.
 */
const TALLEST_GAP_Y = 500;

/**
 * The silhouettes a campaign wave takes the field in (the first eight from the first campaign, the
 * nine the second campaign adds). Each is a block of equal-width rows, `.` for an empty cell and a
 * digit for a crab's tier — 4 on the top row down to 0 on the bottom, which `spawnFormation` reads
 * off as the kind through the level's reef pool. The drawings are the data: a shape change edits
 * these strings and nothing else.
 */
export const FORMATION_TEMPLATES: Record<Formation, readonly string[]> = {
  classic: [
    '444444',
    '333333',
    '222222',
    '111111',
    '000000',
    '000000',
  ],
  fish: [
    '...4444.',
    '2.333.33',
    '22111111',
    '2.000000',
    '...0000.',
  ],
  diamond: [
    '...44...',
    '..3333..',
    '.222222.',
    '11000011',
    '.000000.',
    '..0000..',
    '...00...',
  ],
  ring: [
    '..4444..',
    '.33..33.',
    '22....22',
    '11....11',
    '00....00',
    '.00..00.',
    '..0000..',
  ],
  jellyfish: [
    '..4444..',
    '.333333.',
    '22222222',
    '11111111',
    '00.00.00',
    '00.00.00',
    '00.00.00',
    '.0.00.0.',
  ],
  octopus: [
    '..4444..',
    '.333333.',
    '22222222',
    '11111111',
    '0.0..0.0',
    '0.0..0.0',
    '.0.00.0.',
    '0.0..0.0',
  ],
  shell: [
    '...44...',
    '..3333..',
    '.222222.',
    '11111111',
    '00.00.00',
    '.000000.',
    '...00...',
  ],
  wreck: [
    '...4....',
    '...33...',
    '...222..',
    '...1111.',
    '00000000',
    '.0000000',
    '..00000.',
  ],
  trident: [
    '4..44..4',
    '4..44..4',
    '33.33.33',
    '.333333.',
    '..2222..',
    '...11...',
    '...00...',
    '...00...',
  ],
  anchor: [
    '...44...',
    '..4..4..',
    '...44...',
    '.333333.',
    '...22...',
    '1..11..1',
    '00.00.00',
    '.000000.',
  ],
  turtle: [
    '...44...',
    '3.3333.3',
    '.222222.',
    '.222222.',
    '.111111.',
    '0.0000.0',
    '...00...',
  ],
  crown: [
    '4..44..4',
    '33.33.33',
    '22222222',
    '11111111',
    '00000000',
  ],
  starfish: [
    '...44...',
    '...33...',
    '22222222',
    '.111111.',
    '..1111..',
    '.00..00.',
    '00....00',
  ],
  whirlpool: [
    '..4444..',
    '.4....4.',
    '3..33..3',
    '3.3..3.3',
    '2.2..2.2',
    '2..22..2',
    '.1....1.',
    '..0000..',
  ],
  claws: [
    '.44..44.',
    '33333333',
    '22....22',
    '22....22',
    '11111111',
    '.00..00.',
  ],
  manta: [
    '4..44..4',
    '33333333',
    '22222222',
    '.111111.',
    '..1111..',
    '...00...',
    '...00...',
    '...00...',
  ],
  spearhead: [
    '.444444.',
    '..3333..',
    '..2222..',
    '...11...',
    '...00...',
  ],
};

/**
 * How each silhouette moves: the whirlpool turns on its two rings, the claws split into
 * halves that march apart, the manta falls back into the spearhead when it is halved. Everything
 * else — every shape of the first campaign, the five new static ones and the spearhead a reformed
 * wave ends up in — marches as the classic block.
 */
export const FORMATION_BEHAVIOUR: Record<Formation, FormationBehaviour> = {
  classic: 'march', fish: 'march', diamond: 'march', ring: 'march', jellyfish: 'march',
  octopus: 'march', shell: 'march', wreck: 'march',
  trident: 'march', anchor: 'march', turtle: 'march', crown: 'march', starfish: 'march',
  whirlpool: 'rotate', claws: 'split', manta: 'reform', spearhead: 'march',
};

/**
 * The shape a reforming wave falls back into. It is a template, never a wave's own
 * silhouette: it is missing from `FORMATIONS` on purpose, so no level chain can ever list it.
 */
export const REFORM_TARGET: Formation = 'spearhead';

/** Every template, including the reform target: the list a template-shape check walks. */
export const ALL_FORMATIONS: readonly Formation[] = Object.keys(FORMATION_TEMPLATES) as Formation[];

/** Every silhouette a level's wave chain may draw on, in the order `FORMATION_TEMPLATES` declares them. */
export const FORMATIONS: readonly Formation[] = ALL_FORMATIONS.filter((f) => f !== REFORM_TARGET);

/**
 * The gap between two neighbouring template columns of `formation`, in field units: `CRAB.gapX`
 * unless that would leave less than `MARCH_MARGIN` on each side of the field, in which case the
 * block compresses (6 wide keeps 800, 8 wide drops to 613). The claws' halves turn back half a gap
 * short of the centre line, so the split needs this number as well as `formationPositions` does.
 */
export function formationGapX(formation: Formation): number {
  const rows = FORMATION_TEMPLATES[formation];
  const w = usedWidth(rows).width;
  return Math.min(CRAB.gapX, idiv(FIELD_W - CRAB.size - 2 * MARCH_MARGIN, Math.max(1, w - 1)));
}

/**
 * Two rings over the whirlpool's cells as (row, col) pairs, in the order a crab travels them: the
 * outer one clockwise, the inner one the other way. Together they cover every cell of the
 * template exactly once — `sim/living.ts` checks that when it builds its rotation table.
 */
export const WHIRLPOOL_RINGS: {
  readonly outer: ReadonlyArray<readonly [number, number]>;
  readonly inner: ReadonlyArray<readonly [number, number]>;
} = {
  outer: [
    [0, 2], [0, 3], [0, 4], [0, 5], [1, 6], [2, 7], [3, 7], [4, 7], [5, 7], [6, 6],
    [7, 5], [7, 4], [7, 3], [7, 2], [6, 1], [5, 0], [4, 0], [3, 0], [2, 0], [1, 1],
  ],
  inner: [[2, 3], [3, 2], [4, 2], [5, 3], [5, 4], [4, 5], [3, 5], [2, 4]],
};

/** The first and last column a template actually uses, and how many columns that spans. */
function usedWidth(rows: readonly string[]): { firstCol: number; width: number } {
  let firstCol = Number.MAX_SAFE_INTEGER;
  let lastCol = -1;
  for (const row of rows) {
    for (let c = 0; c < row.length; c++) {
      if (row[c] === '.') continue;
      if (c < firstCol) firstCol = c;
      if (c > lastCol) lastCol = c;
    }
  }
  return { firstCol, width: lastCol - firstCol + 1 };
}

/**
 * Turns a silhouette into crab slots, row by row and left to right. The template's used
 * width — last used column minus first used column, plus one — sets the column gap: `CRAB.gapX`
 * unless that would leave less than `MARCH_MARGIN` on each side of the field, in which case it
 * compresses (6 wide keeps 800, 8 wide drops to 613). The block is centred on the field, and rows
 * sit `CRAB.gapY` apart, `TALL_GAP_Y` at `TALL_ROWS` rows and `TALLEST_GAP_Y` at `TALLEST_ROWS`,
 * which keeps the deepest row of every silhouette at or above the old grid's. Integers only,
 * and no RNG: the shape is the same every wave of every run.
 */
export function formationPositions(formation: Formation): Pos[] {
  const rows = FORMATION_TEMPLATES[formation];
  const { firstCol, width } = usedWidth(rows);
  const gapX = formationGapX(formation);
  const x0 = idiv(FIELD_W - (width - 1) * gapX, 2);
  const tallGapY = rows.length >= TALLEST_ROWS ? TALLEST_GAP_Y : TALL_GAP_Y;
  const gapY = rows.length >= TALL_ROWS ? tallGapY : CRAB.gapY;
  const out: Pos[] = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!;
    for (let c = 0; c < row.length; c++) {
      const cell = row[c]!;
      if (cell === '.') continue;
      out.push({
        x: x0 + (c - firstCol) * gapX,
        y: CRAB.startY + r * gapY,
        row: r,
        col: c,
        tier: cell.charCodeAt(0) - 48,
      });
    }
  }
  return out;
}
