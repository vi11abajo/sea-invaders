import type { GameState } from '../types';

/** Plain-number copy of what the renderer needs; safe to hand to the UI thread every frame. */
export interface Frame {
  tick: number;
  ship: { x: number; y: number; invuln: number };
  /** x, y, kind triples. */
  crabs: number[];
  /** x, y pairs. */
  shots: number[];
  /** x, y pairs. */
  enemyShots: number[];
}

export const EMPTY_FRAME: Frame = { tick: 0, ship: { x: 0, y: 0, invuln: 0 }, crabs: [], shots: [], enemyShots: [] };

export function snapshot(s: GameState): Frame {
  const crabs: number[] = [];
  for (const c of s.crabs) crabs.push(c.x, c.y, c.kind);
  const shots: number[] = [];
  for (const b of s.shots) shots.push(b.x, b.y);
  const enemyShots: number[] = [];
  for (const b of s.enemyShots) enemyShots.push(b.x, b.y);
  return { tick: s.tick, ship: { x: s.ship.x, y: s.ship.y, invuln: s.ship.invuln }, crabs, shots, enemyShots };
}
