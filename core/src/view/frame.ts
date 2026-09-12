import { KIND_INDEX, TYPE_INDEX, type GameState } from '../types';

/** Plain-number copy of what the renderer needs; safe to hand to the UI thread every frame. */
export interface Frame {
  tick: number;
  ship: { x: number; y: number; invuln: number };
  lives: number;
  /** x, y, kind, typeIndex, hp quintuples. */
  crabs: number[];
  /** x, y pairs. */
  shots: number[];
  /** x, y, kindIndex triples. */
  enemyShots: number[];
  /** Filled in Task 5. */
  boss: null;
  /** Filled in Task 11. */
  drops: number[];
  /** Filled in Task 11. */
  boosts: number[];
  /** Filled in Task 11. */
  shield: number;
}

export const EMPTY_FRAME: Frame = {
  tick: 0,
  ship: { x: 0, y: 0, invuln: 0 },
  lives: 0,
  crabs: [],
  shots: [],
  enemyShots: [],
  boss: null,
  drops: [],
  boosts: [],
  shield: 0,
};

export function snapshot(s: GameState): Frame {
  const crabs: number[] = [];
  for (const c of s.crabs) crabs.push(c.x, c.y, c.kind, TYPE_INDEX[c.type], c.hp);
  const shots: number[] = [];
  for (const b of s.shots) shots.push(b.x, b.y);
  const enemyShots: number[] = [];
  for (const b of s.enemyShots) enemyShots.push(b.x, b.y, KIND_INDEX[b.kind]);
  return {
    tick: s.tick,
    ship: { x: s.ship.x, y: s.ship.y, invuln: s.ship.invuln },
    lives: s.ship.lives,
    crabs,
    shots,
    enemyShots,
    boss: null,
    drops: [],
    boosts: [],
    shield: 0,
  };
}
