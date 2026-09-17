import { CRAB, FIELD_W } from './config';
import { idiv } from './fixed';
import type { Formation } from './levels';

export interface Pos {
  x: number;
  y: number;
  /** Template tier, 0 on the bottom row up to 4 on the top one; `spawnFormation` turns it into a kind. */
  tier: number;
}

/**
 * Horizontal room a formation keeps on each side of the field so it can march before bouncing.
 * Without it an 8-wide silhouette (gap compressed to fit exactly) touched both edges at once, hit
 * the wall test every tick and stepped down 250 units per tick — the "wall falls on Octopi" bug on
 * level 10.
 */
export const MARCH_MARGIN = 400;

/** A template of this many rows uses `TALL_GAP_Y`, so it still fits the field. */
const TALL_ROWS = 7;
/** Rows in the tallest template the spec allows; it uses `TALLEST_GAP_Y`. */
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
 * The eight silhouettes a campaign wave marches in (spec §2). Each is a block of equal-width rows,
 * `.` for an empty cell and a digit for a crab's tier — 4 on the top row down to 0 on the bottom,
 * which `spawnFormation` reads off as the kind through the level's reef pool. The drawings are the
 * data: a shape change edits these strings and nothing else.
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
};

/** Every silhouette, in the order the spec lists them. */
export const FORMATIONS: readonly Formation[] = Object.keys(FORMATION_TEMPLATES) as Formation[];

/**
 * Turns a silhouette into crab slots, row by row and left to right (spec §2). The template's used
 * width — last used column minus first used column, plus one — sets the column gap: `CRAB.gapX`
 * unless that would leave less than `MARCH_MARGIN` on each side of the field, in which case it
 * compresses (6 wide keeps 800, 8 wide drops to 613). The block is centred on the field, and rows
 * sit `CRAB.gapY` apart, `TALL_GAP_Y` at `TALL_ROWS` rows and `TALLEST_GAP_Y` at `TALLEST_ROWS`,
 * which keeps the deepest row of every silhouette at or above the old grid's. Integers only,
 * and no RNG: the shape is the same every wave of every run.
 */
export function formationPositions(formation: Formation): Pos[] {
  const rows = FORMATION_TEMPLATES[formation];
  let firstCol = Number.MAX_SAFE_INTEGER;
  let lastCol = -1;
  for (const row of rows) {
    for (let c = 0; c < row.length; c++) {
      if (row[c] === '.') continue;
      if (c < firstCol) firstCol = c;
      if (c > lastCol) lastCol = c;
    }
  }
  const w = lastCol - firstCol + 1;
  const gapX = Math.min(CRAB.gapX, idiv(FIELD_W - CRAB.size - 2 * MARCH_MARGIN, Math.max(1, w - 1)));
  const x0 = idiv(FIELD_W - (w - 1) * gapX, 2);
  const tallGapY = rows.length >= TALLEST_ROWS ? TALLEST_GAP_Y : TALL_GAP_Y;
  const gapY = rows.length >= TALL_ROWS ? tallGapY : CRAB.gapY;
  const out: Pos[] = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!;
    for (let c = 0; c < row.length; c++) {
      const cell = row[c]!;
      if (cell === '.') continue;
      out.push({ x: x0 + (c - firstCol) * gapX, y: CRAB.startY + r * gapY, tier: cell.charCodeAt(0) - 48 });
    }
  }
  return out;
}
