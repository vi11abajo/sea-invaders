import { describe, expect, it } from 'vitest';
import { CRAB, FIELD_W, formationPositions } from '../src';

const HALF = CRAB.size / 2;
const inside = (p: { x: number; y: number }) => p.x - HALF >= 0 && p.x + HALF <= FIELD_W && Number.isInteger(p.x) && Number.isInteger(p.y);

describe('formationPositions', () => {
  it('grid matches the legacy wave layout', () => {
    const g = formationPositions('grid', 3, 6);
    expect(g).toHaveLength(18);
    expect(g[0]).toEqual({ x: 812, y: 1500 });
    expect(g[17]).toEqual({ x: 4812, y: 2900 });
  });
  it('wedge widens towards the bottom', () => {
    const rows = [0, 1, 2].map((r) => formationPositions('wedge', 3, 6).filter((p) => p.y === 1500 + r * 700).length);
    expect(rows).toEqual([2, 4, 6]);
  });
  it('wall is two rows with half spacing', () => {
    const w = formationPositions('wall', 2, 8);
    expect(w).toHaveLength(16);
    expect(new Set(w.map((p) => p.y))).toEqual(new Set([1500, 1850]));
  });
  it('checker leaves every other cell empty', () => {
    expect(formationPositions('checker', 4, 6)).toHaveLength(12);
  });
  it('columns leave a two-cell gap in the middle', () => {
    const xs = formationPositions('columns', 4, 6).map((p) => p.x);
    expect(xs.some((x) => x > 2400 && x < 3200)).toBe(false);
  });
  it('ring places rows*cols on an ellipse plus a centre', () => {
    expect(formationPositions('ring', 3, 6)).toHaveLength(19);
  });
  it('every formation stays inside the field on integers', () => {
    for (const f of ['grid', 'wedge', 'wall', 'checker', 'columns', 'ring'] as const) {
      for (const p of formationPositions(f, 6, 8)) expect(inside(p)).toBe(true);
    }
  });
  it('an 8-column row compresses spacing to fit; a 6-column row keeps CRAB.gapX', () => {
    const row0 = formationPositions('wall', 2, 8)
      .filter((p) => p.y === 1500)
      .map((p) => p.x)
      .sort((a, b) => a - b);
    expect(row0.every((x) => x >= 265 && x <= 5360)).toBe(true);
    for (let i = 1; i < row0.length; i++) expect(row0[i]! - row0[i - 1]!).toBe(727);
    const g = formationPositions('grid', 3, 6);
    expect(g[1]!.x - g[0]!.x).toBe(800);
  });
});
