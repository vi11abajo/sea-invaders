import { describe, expect, it } from 'vitest';
import {
  ALL_FORMATIONS, CRAB, FIELD_W, FORMATIONS, FORMATION_BEHAVIOUR, FORMATION_TEMPLATES, INITIAL_INPUT,
  LEVELS, MARCH_MARGIN, REFORM_TARGET, WHIRLPOOL_RINGS, createGame, formationGapX, formationPositions,
  step, type Formation, type FormationBehaviour,
} from '../src';

const HALF = CRAB.size / 2;
const inside = (p: { x: number; y: number }) =>
  p.x - HALF >= 0 && p.x + HALF <= FIELD_W && Number.isInteger(p.x) && Number.isInteger(p.y);

/** Crab count per template: the eight of spec §2 and the nine of the second campaign's spec §3. */
const COUNTS: Record<Formation, number> = {
  classic: 36, fish: 29, diamond: 32, ring: 28, jellyfish: 48, octopus: 42, shell: 34, wreck: 30,
  trident: 30, anchor: 30, turtle: 34, crown: 34, starfish: 30,
  whirlpool: 28, claws: 32, manta: 36, spearhead: 18,
};

/** The behaviour each silhouette marches with, spec §3: three live, the rest march. */
const BEHAVIOURS: Record<Formation, FormationBehaviour> = {
  classic: 'march', fish: 'march', diamond: 'march', ring: 'march', jellyfish: 'march',
  octopus: 'march', shell: 'march', wreck: 'march', trident: 'march', anchor: 'march',
  turtle: 'march', crown: 'march', starfish: 'march', spearhead: 'march',
  whirlpool: 'rotate', claws: 'split', manta: 'reform',
};

/** The tighter row gap a 7-row template uses, spec §2. */
const TALL_GAP_Y = 560;
/** The tightest row gap, used by an 8-row template so its bottom row lands on the old grid's, spec §2. */
const TALLEST_GAP_Y = 500;
/** Where the old six-row grid's bottom row sat, and the deepest any silhouette may settle. */
const DEEPEST_ROW_Y = 5000;

describe('formation templates', () => {
  it('names every silhouette a level may chain, and keeps the reform target out of that list', () => {
    expect([...FORMATIONS]).toEqual([
      'classic', 'fish', 'diamond', 'ring', 'jellyfish', 'octopus', 'shell', 'wreck',
      'trident', 'anchor', 'turtle', 'crown', 'starfish', 'whirlpool', 'claws', 'manta',
    ]);
    expect(FORMATIONS).not.toContain(REFORM_TARGET);
    expect([...ALL_FORMATIONS]).toEqual([...FORMATIONS, REFORM_TARGET]);
  });

  it('gives whirlpool, claws and manta their living behaviour and everything else the march', () => {
    for (const f of ALL_FORMATIONS) expect({ f, b: FORMATION_BEHAVIOUR[f] }).toEqual({ f, b: BEHAVIOURS[f] });
  });

  it('is at most 8 cells wide and 8 rows tall, with every row the same width and only . or a tier digit', () => {
    for (const f of ALL_FORMATIONS) {
      const rows = FORMATION_TEMPLATES[f];
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.length).toBeLessThanOrEqual(8);
      for (const row of rows) {
        expect(row.length).toBe(rows[0]!.length);
        expect(row.length).toBeLessThanOrEqual(8);
        expect(row).toMatch(/^[.0-4]+$/);
      }
    }
  });

  it('holds the crab count the spec gives it', () => {
    for (const f of ALL_FORMATIONS) {
      expect({ [f]: formationPositions(f).length }).toEqual({ [f]: COUNTS[f] });
    }
  });

  it('fields all five tiers', () => {
    for (const f of ALL_FORMATIONS) {
      const tiers = [...new Set(formationPositions(f).map((p) => p.tier))].sort((a, b) => a - b);
      expect({ [f]: tiers }).toEqual({ [f]: [0, 1, 2, 3, 4] });
    }
  });

  it('classic is the 6x6 grid with row tiers 4,3,2,1,0,0', () => {
    expect(FORMATION_TEMPLATES.classic).toEqual(['444444', '333333', '222222', '111111', '000000', '000000']);
    const p = formationPositions('classic');
    expect(p).toHaveLength(36);
    expect(p[0]).toEqual({ x: 812, y: 1500, row: 0, col: 0, tier: 4 });
    expect(p[5]).toEqual({ x: 4812, y: 1500, row: 0, col: 5, tier: 4 });
    expect(p[35]).toEqual({ x: 4812, y: 1500 + 5 * CRAB.gapY, row: 5, col: 5, tier: 0 });
  });

  it('counts a cell\'s column from the template\'s own column 0, not from the first used one', () => {
    for (const f of ALL_FORMATIONS) {
      const rows = FORMATION_TEMPLATES[f];
      const cells: Array<[number, number]> = [];
      for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < rows[r]!.length; c++) if (rows[r]![c] !== '.') cells.push([r, c]);
      }
      expect({ [f]: formationPositions(f).map((p) => [p.row, p.col]) }).toEqual({ [f]: cells });
    }
  });

  it('spaces the columns of a cell by the template gap `formationGapX` reports', () => {
    for (const f of ALL_FORMATIONS) {
      const gap = formationGapX(f);
      const positions = formationPositions(f);
      const first = positions[0]!;
      for (const p of positions) {
        expect({ [f]: p.x - first.x }).toEqual({ [f]: (p.col - first.col) * gap });
      }
    }
  });

  it('keeps CRAB.gapX for a 6-wide template and compresses an 8-wide one to 613, inside MARCH_MARGIN', () => {
    const classicRow = formationPositions('classic').filter((p) => p.y === CRAB.startY).map((p) => p.x);
    expect(classicRow[1]! - classicRow[0]!).toBe(CRAB.gapX);

    const wide = formationPositions('shell').filter((p) => p.tier === 1).map((p) => p.x).sort((a, b) => a - b);
    expect(wide).toHaveLength(8);
    for (let i = 1; i < wide.length; i++) expect(wide[i]! - wide[i - 1]!).toBe(613);
    expect(wide[0]! - HALF).toBeGreaterThanOrEqual(MARCH_MARGIN);
    expect(FIELD_W - (wide[wide.length - 1]! + HALF)).toBeGreaterThanOrEqual(MARCH_MARGIN);
  });

  it('uses 500 at 8 rows, 560 at 7 and CRAB.gapY below that, and never settles below the old grid', () => {
    for (const f of ALL_FORMATIONS) {
      const rows = FORMATION_TEMPLATES[f].length;
      const expected = rows >= 8 ? TALLEST_GAP_Y : rows >= 7 ? TALL_GAP_Y : CRAB.gapY;
      const ys = [...new Set(formationPositions(f).map((p) => p.y))].sort((a, b) => a - b);
      expect({ [f]: ys[1]! - ys[0]! }).toEqual({ [f]: expected });
      expect({ [f]: ys[0] }).toEqual({ [f]: CRAB.startY });
      expect({ [f]: ys[ys.length - 1]! <= DEEPEST_ROW_Y }).toEqual({ [f]: true });
    }
  });

  it('lands the bottom row of an 8-row template on the old six-row grid, exactly', () => {
    for (const f of ALL_FORMATIONS.filter((x) => FORMATION_TEMPLATES[x].length === 8)) {
      const ys = formationPositions(f).map((p) => p.y);
      expect({ [f]: Math.max(...ys) }).toEqual({ [f]: DEEPEST_ROW_Y });
    }
    expect(Math.max(...formationPositions('classic').map((p) => p.y))).toBe(DEEPEST_ROW_Y);
  });

  it('places every cell inside the field on integers, carrying its template tier', () => {
    for (const f of ALL_FORMATIONS) {
      const rows = FORMATION_TEMPLATES[f];
      const positions = formationPositions(f);
      let i = 0;
      for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < rows[r]!.length; c++) {
          const cell = rows[r]![c]!;
          if (cell === '.') continue;
          const p = positions[i++]!;
          expect(inside(p)).toBe(true);
          expect(p.tier).toBe(Number(cell));
        }
      }
      expect(i).toBe(positions.length);
    }
  });

  it('runs its tiers from 4 at the top row down to 0 at the bottom', () => {
    for (const f of ALL_FORMATIONS) {
      const positions = formationPositions(f);
      const top = Math.min(...positions.map((p) => p.y));
      const bottom = Math.max(...positions.map((p) => p.y));
      expect({ [f]: positions.filter((p) => p.y === top).every((p) => p.tier === 4) }).toEqual({ [f]: true });
      expect({ [f]: positions.filter((p) => p.y === bottom).every((p) => p.tier === 0) }).toEqual({ [f]: true });
    }
  });
});

describe('the whirlpool rings', () => {
  /** The two ring orders of spec §3, transcribed here so a reordering has to be deliberate. */
  const OUTER: ReadonlyArray<readonly [number, number]> = [
    [0, 2], [0, 3], [0, 4], [0, 5], [1, 6], [2, 7], [3, 7], [4, 7], [5, 7], [6, 6],
    [7, 5], [7, 4], [7, 3], [7, 2], [6, 1], [5, 0], [4, 0], [3, 0], [2, 0], [1, 1],
  ];
  const INNER: ReadonlyArray<readonly [number, number]> = [
    [2, 3], [3, 2], [4, 2], [5, 3], [5, 4], [4, 5], [3, 5], [2, 4],
  ];

  it('travel the cells in the order the spec lists them, one for one', () => {
    expect(WHIRLPOOL_RINGS.outer.map((cell) => [...cell])).toEqual(OUTER.map((cell) => [...cell]));
    expect(WHIRLPOOL_RINGS.inner.map((cell) => [...cell])).toEqual(INNER.map((cell) => [...cell]));
  });

  it('cover the whirlpool template exactly and disjointly', () => {
    const cells = formationPositions('whirlpool').map((p) => `${p.row},${p.col}`);
    const ringed = [...WHIRLPOOL_RINGS.outer, ...WHIRLPOOL_RINGS.inner].map(([r, c]) => `${r},${c}`);
    expect({ outer: WHIRLPOOL_RINGS.outer.length, inner: WHIRLPOOL_RINGS.inner.length })
      .toEqual({ outer: 20, inner: 8 });
    expect(new Set(ringed).size).toEqual(ringed.length);
    expect([...ringed].sort()).toEqual([...cells].sort());
  });

  it('runs the outer ring clockwise and the inner one the other way', () => {
    const [firstR, firstC] = WHIRLPOOL_RINGS.outer[0]!;
    const [secondR, secondC] = WHIRLPOOL_RINGS.outer[1]!;
    expect({ firstR, secondR, rightwards: secondC > firstC }).toEqual({ firstR: 0, secondR: 0, rightwards: true });
    const [innerR, innerC] = WHIRLPOOL_RINGS.inner[0]!;
    const [nextR, nextC] = WHIRLPOOL_RINGS.inner[1]!;
    expect({ down: nextR > innerR, leftwards: nextC < innerC }).toEqual({ down: true, leftwards: true });
  });
});

describe('wide formations march', () => {
  it('an 8-wide formation marches sideways after arriving instead of stepping down every tick (level 10 bug)', () => {
    const s = createGame('wall-march', { mode: 'campaign', level: LEVELS[9]!, lives: 5, features: { boosts: true }, octopi: 'base' });
    for (let t = 0; t < 30; t++) step(s, INITIAL_INPUT); // arrival
    const y0 = s.crabs[0]!.y;
    const x0 = s.crabs[0]!.x;
    for (let t = 0; t < 20; t++) step(s, INITIAL_INPUT);
    expect(s.crabs[0]!.y).toBe(y0);
    expect(s.crabs[0]!.x).not.toBe(x0);
    expect(s.over).toBe(false);
  });
});
