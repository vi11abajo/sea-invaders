import { BOSS } from '../config';
import { scoreDecayPct } from '../sim/boosts';
import { crabFlags, hasHerald } from '../sim/veterans';
import { BOOST_INDEX, KIND_INDEX, OBSTACLE_INDEX, TYPE_INDEX, type GameState } from '../types';

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
  // The reefs 6-10 flags (spec §7), appended so every older field keeps its place. All four stay 0
  // for the whole of a fight with a boss of the first campaign.
  /** Templar: 1 while the shell shield is up and player shots bounce off it. */
  shieldUp: 0 | 1;
  /** Corsair: 1 while his spikes reflect player fire back down the field. */
  reflecting: 0 | 1;
  /** Tyrant: 1 while he is discharged from his own strike and takes double damage. */
  discharged: 0 | 1;
  /** Templar: the firewall slot the next wall leaves open (with the slot to its right). */
  gapSlot: number;
}

/**
 * Ints packed per crab in `Frame.crabs` (spec §7 ruling R3): x, y, kind, typeIndex, hp, flags. All
 * four flag bits are live (spec §7): bit 0 the warden's shield up, bit 1 heralded by a herald's
 * aura, bit 2 revived by a patriarch within the last `REVIVED_TICKS` ticks, bit 3 the formation
 * raging over a fallen patriarch. A consumer must never assume 5 ints per crab any more — use this
 * constant.
 */
export const CRAB_STRIDE = 6;

/** Ints packed per arena object in `Frame.obstacles` (spec §7): x, y, w, h, hp, kindIndex. */
export const OBSTACLE_STRIDE = 6;

/** Ints packed per lightning lane in `Frame.lanes` (spec §7): lane, ticksLeft. */
export const LANE_STRIDE = 2;

/** Ints packed per sight line in `Frame.aim` (spec §7): fromX, fromY, toX, decoy, ticksLeft. */
export const AIM_STRIDE = 5;

/** Plain-number copy of what the renderer needs; safe to hand to the UI thread every frame. */
export interface Frame {
  tick: number;
  octopi: { x: number; y: number; invuln: number };
  lives: number;
  /** `CRAB_STRIDE`-int groups: x, y, kind, typeIndex, hp, flags (1 shield up, 2 heralded, 4 revived, 8 raging). */
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
  // The reefs 6-10 arrays (spec §7), appended so every older field keeps its name and place. All
  // three are empty and `chill` is 0 for the whole of the first campaign.
  /** `OBSTACLE_STRIDE`-int groups: x, y, w, h, hp, kindIndex. */
  obstacles: number[];
  /** `LANE_STRIDE`-int groups: lane, ticksLeft. */
  lanes: number[];
  /** `AIM_STRIDE`-int groups: fromX, fromY, toX, decoy (1 for a decoy's line), ticksLeft. */
  aim: number[];
  /** Ticks left of the cold snap slowing Octopi (spec §5.2); 0 when it is not in effect. */
  chill: number;
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
  obstacles: [],
  lanes: [],
  aim: [],
  chill: 0,
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
    shieldUp: b.shieldUp > 0 ? 1 : 0,
    // The Corsair's spikes run on his own `effectTicks`, exactly as Crimson's rage does above.
    reflecting: b.kind === 8 && b.effectTicks > 0 ? 1 : 0,
    discharged: b.discharged > 0 ? 1 : 0,
    gapSlot: b.gapSlot,
  };
}

export function snapshot(s: GameState): Frame {
  const crabs: number[] = [];
  const aura = hasHerald(s); // hoisted: a wave with no herald never looks a neighbourhood up
  for (const c of s.crabs) crabs.push(c.x, c.y, c.kind, TYPE_INDEX[c.type], c.hp, crabFlags(s, c, aura));
  const shots: number[] = [];
  for (const b of s.shots) shots.push(b.x, b.y);
  const enemyShots: number[] = [];
  for (const b of s.enemyShots) enemyShots.push(b.x, b.y, KIND_INDEX[b.kind]);
  const drops: number[] = [];
  for (const d of s.drops) drops.push(d.x, d.y, BOOST_INDEX[d.boost]);
  const boosts: number[] = [];
  for (const a of s.boosts.active) boosts.push(BOOST_INDEX[a.type], a.ticksLeft);
  const obstacles: number[] = [];
  for (const o of s.obstacles) obstacles.push(o.x, o.y, o.w, o.h, o.hp, OBSTACLE_INDEX[o.kind]);
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
    obstacles,
    // Copies, not the state's own arrays: a frame is handed to the UI thread every tick.
    lanes: [...s.lanes],
    aim: [...s.aims],
    chill: s.chillTicks,
  };
}
