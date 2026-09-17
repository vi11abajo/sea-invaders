import { describe, expect, it } from 'vitest';
import {
  CRAB, FIELD_W, FORMATIONS, FORMATION_TEMPLATES, INITIAL_INPUT, LEVELS, MARCH_MARGIN, createGame,
  formationPositions, step, type Formation,
} from '../src';

const HALF = CRAB.size / 2;
const inside = (p: { x: number; y: number }) =>
  p.x - HALF >= 0 && p.x + HALF <= FIELD_W && Number.isInteger(p.x) && Number.isInteger(p.y);

/** Crab count per template, spec §2. */
const COUNTS: Record<Formation, number> = {
  classic: 36, fish: 29, diamond: 32, ring: 28, jellyfish: 48, octopus: 42, shell: 34, wreck: 30,
};

/** The tighter row gap a template of 7 rows or more uses, spec §2. */
const TALL_GAP_Y = 560;

describe('formation templates', () => {
  it('names all eight silhouettes', () => {
    expect([...FORMATIONS]).toEqual(['classic', 'fish', 'diamond', 'ring', 'jellyfish', 'octopus', 'shell', 'wreck']);
  });

  it('is at most 8 cells wide and 8 rows tall, with every row the same width and only . or a tier digit', () => {
    for (const f of FORMATIONS) {
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
    for (const f of FORMATIONS) {
      expect({ [f]: formationPositions(f).length }).toEqual({ [f]: COUNTS[f] });
    }
  });

  it('classic is the 6x6 grid with row tiers 4,3,2,1,0,0', () => {
    expect(FORMATION_TEMPLATES.classic).toEqual(['444444', '333333', '222222', '111111', '000000', '000000']);
    const p = formationPositions('classic');
    expect(p).toHaveLength(36);
    expect(p[0]).toEqual({ x: 812, y: 1500, tier: 4 });
    expect(p[5]).toEqual({ x: 4812, y: 1500, tier: 4 });
    expect(p[35]).toEqual({ x: 4812, y: 1500 + 5 * CRAB.gapY, tier: 0 });
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

  it('uses the 560 row gap for a template of 7 rows or more and CRAB.gapY below that', () => {
    for (const f of FORMATIONS) {
      const expected = FORMATION_TEMPLATES[f].length >= 7 ? TALL_GAP_Y : CRAB.gapY;
      const ys = [...new Set(formationPositions(f).map((p) => p.y))].sort((a, b) => a - b);
      expect({ [f]: ys[1]! - ys[0]! }).toEqual({ [f]: expected });
      expect({ [f]: ys[0] }).toEqual({ [f]: CRAB.startY });
    }
  });

  it('places every cell inside the field on integers, carrying its template tier', () => {
    for (const f of FORMATIONS) {
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
    for (const f of FORMATIONS) {
      const positions = formationPositions(f);
      const top = Math.min(...positions.map((p) => p.y));
      const bottom = Math.max(...positions.map((p) => p.y));
      expect({ [f]: positions.filter((p) => p.y === top).every((p) => p.tier === 4) }).toEqual({ [f]: true });
      expect({ [f]: positions.filter((p) => p.y === bottom).every((p) => p.tier === 0) }).toEqual({ [f]: true });
    }
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
