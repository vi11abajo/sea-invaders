import { BOSS } from '../config';
import { scoreDecayPct } from '../sim/boosts';
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

/**
 * Ints packed per crab in `Frame.crabs` (spec §7 ruling R3): x, y, kind, typeIndex, hp, flags. Only
 * bit 0 of `flags` is meaningful yet (mirrors `Crab.shield`, spec §2's warden); the rest are 0 until
 * a later task's aura/revive/rage skills raise them (bit 1 heralded, bit 2 revived, bit 3 raging,
 * spec §7). A consumer must never assume 5 ints per crab any more — use this constant.
 */
export const CRAB_STRIDE = 6;

/** Plain-number copy of what the renderer needs; safe to hand to the UI thread every frame. */
export interface Frame {
  tick: number;
  octopi: { x: number; y: number; invuln: number };
  lives: number;
  /** `CRAB_STRIDE`-int groups: x, y, kind, typeIndex, hp, flags (bit 0 = shield up). */
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
  /** Ticks left in a campaign wave's arrival descent; 0 when idle. */
  arrival: number;
  /** The wave-mode score-decay percentage right now (spec C7), 100 down to 1. */
  scoreDecayPct: number;
}

export const EMPTY_FRAME: Frame = {
  tick: 0,
  octopi: { x: 0, y: 0, invuln: 0 },
  lives: 0,
  crabs: [],
  shots: [],
  enemyShots: [],
  boss: null,
  drops: [],
  boosts: [],
  shield: 0,
  well: null,
  arrival: 0,
  scoreDecayPct: 100,
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
  for (const c of s.crabs) crabs.push(c.x, c.y, c.kind, TYPE_INDEX[c.type], c.hp, c.shield);
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
    octopi: { x: s.octopi.x, y: s.octopi.y, invuln: s.octopi.invuln },
    lives: s.octopi.lives,
    crabs,
    shots,
    enemyShots,
    boss: bossFrame(s),
    drops,
    boosts,
    shield: s.boosts.shield,
    well: s.boosts.well ? { x: s.boosts.well.x, y: s.boosts.well.y } : null,
    arrival: s.arrival,
    scoreDecayPct: scoreDecayPct(s),
  };
}
