import { CRAB, FIELD_W } from './config';
import { idiv } from './fixed';
import type { Formation } from './levels';
import { icos, isin } from './trig';

export interface Pos { x: number; y: number }

/**
 * Centred grid; the ring places its points on an ellipse using the integer sine table in trig.ts.
 * Column spacing compresses below CRAB.gapX only when a row would otherwise overflow FIELD_W (wide
 * formations up to 8 columns, e.g. the level table's `wall 2x8` rows) — never widens it, so grid 3x6
 * still matches spawnWave's fixed CRAB.gapX layout exactly.
 */
export function formationPositions(formation: Formation, rows: number, cols: number): Pos[] {
  const gapX = Math.min(CRAB.gapX, idiv(FIELD_W - CRAB.size, Math.max(1, cols - 1)));
  const x0 = idiv(FIELD_W - (cols - 1) * gapX, 2);
  const at = (r: number, c: number, gapY: number = CRAB.gapY): Pos => ({ x: x0 + c * gapX, y: CRAB.startY + r * gapY });
  const out: Pos[] = [];
  switch (formation) {
    case 'grid':
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push(at(r, c));
      break;
    case 'wedge':
      for (let r = 0; r < rows; r++) {
        const n = Math.max(1, cols - 2 * (rows - 1 - r));
        const start = idiv(cols - n, 2);
        for (let c = start; c < start + n; c++) out.push(at(r, c));
      }
      break;
    case 'wall':
      for (let r = 0; r < 2; r++) for (let c = 0; c < cols; c++) out.push(at(r, c, idiv(CRAB.gapY, 2)));
      break;
    case 'checker':
      for (let r = 0; r < rows; r++) for (let c = r % 2; c < cols; c += 2) out.push(at(r, c));
      break;
    case 'columns': {
      const half = idiv(cols + 1, 2);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (c < half - 1 || c > half) out.push(at(r, c));
      break;
    }
    case 'ring': {
      const n = rows * cols;
      const rx = idiv((cols - 1) * gapX, 2);
      const ry = idiv((rows - 1) * CRAB.gapY, 2);
      const cx = idiv(FIELD_W, 2);
      const cy = CRAB.startY + ry;
      for (let i = 0; i < n; i++) {
        const deg = idiv(i * 360, n);
        out.push({ x: cx + idiv(rx * icos(deg), 1000), y: cy + idiv(ry * isin(deg), 1000) });
      }
      out.push({ x: cx, y: cy });
      break;
    }
  }
  return out;
}
