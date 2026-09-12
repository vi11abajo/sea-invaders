import { BOSS } from '../config';
import { BOOST_INDEX, KIND_INDEX, TYPE_INDEX, type GameState } from '../types';

export interface BossFrame {
  kind: number;
  hp: number;
  maxHp: number;
  phase: number;
  maxPhases: number;
  shieldHp: number;
  x: number;
  y: number;
  w: number;
  h: number;
  transition: 0 | 1;
  rage: 0 | 1;
  /** Ticks of Void's temporal freeze remaining, 0 when not in effect. */
  freeze: number;
}

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
  boss: BossFrame | null;
  /** x, y, typeIndex triples. */
  drops: number[];
  /** typeIndex, ticksLeft pairs. */
  boosts: number[];
  /** SHIELD_BARRIER hits left. */
  shield: number;
  /** GRAVITY_WELL's pull point, or null when no well is active. */
  well: { x: number; y: number } | null;
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
  well: null,
};

function bossFrame(s: GameState): BossFrame | null {
  const b = s.boss;
  if (!b) return null;
  return {
    kind: b.kind,
    hp: b.hp,
    maxHp: b.maxHp,
    phase: b.phase,
    maxPhases: b.maxPhases,
    shieldHp: b.shieldHp,
    x: b.x,
    y: b.y,
    w: BOSS.width,
    h: BOSS.height,
    transition: b.state === 'transition' ? 1 : 0,
    rage: b.kind === 4 && b.effectTicks > 0 ? 1 : 0,
    freeze: b.kind === 5 ? b.effectTicks : 0,
  };
}

export function snapshot(s: GameState): Frame {
  const crabs: number[] = [];
  for (const c of s.crabs) crabs.push(c.x, c.y, c.kind, TYPE_INDEX[c.type], c.hp);
  const shots: number[] = [];
  for (const b of s.shots) shots.push(b.x, b.y);
  const enemyShots: number[] = [];
  for (const b of s.enemyShots) enemyShots.push(b.x, b.y, KIND_INDEX[b.kind]);
  const drops: number[] = [];
  for (const d of s.drops) drops.push(d.x, d.y, BOOST_INDEX[d.boost]);
  const boosts: number[] = [];
  for (const a of s.boosts.active) boosts.push(BOOST_INDEX[a.type], a.ticksLeft);
  return {
    tick: s.tick,
    ship: { x: s.ship.x, y: s.ship.y, invuln: s.ship.invuln },
    lives: s.ship.lives,
    crabs,
    shots,
    enemyShots,
    boss: bossFrame(s),
    drops,
    boosts,
    shield: s.boosts.shield,
    well: s.boosts.well ? { x: s.boosts.well.x, y: s.boosts.well.y } : null,
  };
}
