import type { Rng } from './rng';
import type { CrabType } from './levels';
import type { RunConfig } from './run';

/** Ship target in integer milli-units, as produced by the touch layer. */
export interface Input {
  x: number;
  y: number;
}

export interface Ship {
  x: number;
  y: number;
  /** Ticks until the next automatic shot. */
  cooldown: number;
  /** Remaining invulnerability ticks after a hit. */
  invuln: number;
  lives: number;
}

export type BulletKind =
  | 'crab' | 'straight' | 'zigzag' | 'large' | 'wave' | 'ring' | 'explosive' | 'fragment'
  | 'meteor' | 'berserk' | 'spiral' | 'gravity' | 'clone';

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Player shots: 'crab' is never used; enemy shots default to 'crab'. */
  kind: BulletKind;
  /** Kind-specific counter (zigzag flip timer, explosive fuse, ricochet bounces, pierce count). */
  data: number;
}

export interface Crab {
  x: number;
  y: number;
  /** Colour index in [0, CRAB.kinds). */
  kind: number;
  type: CrabType;
  hp: number;
  /** Diver: ticks left in the current dive (0 = in formation). Ignored for other types. */
  dive: number;
  /** Diver: formation slot to return to. */
  homeX: number;
  homeY: number;
}

export type BossPhaseState = 'fighting' | 'transition';

export interface BossState {
  kind: 1 | 2 | 3 | 4 | 5;
  hp: number;
  maxHp: number;
  phase: number;
  maxPhases: number;
  x: number;
  y: number;
  /** Horizontal velocity in units/tick, sign = direction. */
  vx: number;
  state: BossPhaseState;
  transitionTicks: number;
  attackTimer: number;
  secondaryTimer: number;
  abilityTimer: number;
  /** Ticks since the fight began; drives the score decay. */
  fightTicks: number;
  shieldHp: number;
  /** Emerald: ticks until regeneration may fire again. */
  regenCooldown: number;
  /** Crimson: ticks of rage left. Void/temporal freeze: ticks the player's shots stay frozen. */
  effectTicks: number;
  /** Void: spiral phase in degrees. */
  spiral: number;
  /** Pending delayed casts as [ticksLeft, castId] pairs. */
  pending: number[];
}

export type BoostType =
  | 'RAPID_FIRE' | 'ICE_FREEZE' | 'HEALTH_BOOST' | 'POINTS_FREEZE'
  | 'SHIELD_BARRIER' | 'AUTO_TARGET' | 'INVINCIBILITY' | 'MULTI_SHOT' | 'SCORE_MULTIPLIER' | 'RICOCHET'
  | 'WAVE_BLAST' | 'COIN_SHOWER' | 'GRAVITY_WELL' | 'PIERCING_BULLETS'
  | 'RANDOM_CHAOS' | 'SPEED_TAMER';

export interface ActiveBoost {
  type: BoostType;
  ticksLeft: number;
}

export interface BoostState {
  active: ActiveBoost[];
  /** SHIELD_BARRIER hits left. */
  shield: number;
  tamerStacks: number;
  well: { x: number; y: number } | null;
}

export interface Drop {
  x: number;
  y: number;
  boost: BoostType;
  ttl: number;
}

export type GameEvent =
  | { tick: number; type: 'wave_cleared' | 'level_cleared' | 'reef_lost' | 'boss_spawn' | 'boss_phase' | 'boss_dead' | 'shield_break' | 'player_hit' }
  | { tick: number; type: 'boss_ability'; name: 'regen' | 'shield' | 'meteor' | 'rage' | 'freeze' }
  | { tick: number; type: 'boss_teleport'; fromX: number; toX: number }
  | { tick: number; type: 'boss_clone'; leftX: number; rightX: number }
  | { tick: number; type: 'meteor_warning'; x: number }
  | { tick: number; type: 'boost_drop' | 'boost_pickup' | 'boost_expire'; boost: BoostType }
  | { tick: number; type: 'player_freeze'; ticks: number };

export interface GameState {
  tick: number;
  wave: number;
  /** Crabs spawned in the current wave; drives the speed-up curve. */
  waveTotal: number;
  score: number;
  kills: number;
  over: boolean;
  /** Formation direction: 1 = right, -1 = left. */
  dir: number;
  ship: Ship;
  shots: Bullet[];
  enemyShots: Bullet[];
  crabs: Crab[];
  rngWaves: Rng;
  rngFire: Rng;
  run: RunConfig;
  cleared: boolean;
  boss: BossState | null;
  boosts: BoostState;
  drops: Drop[];
  rngBoss: Rng;
  rngBoosts: Rng;
  events: GameEvent[];
}

/** Index of each CrabType in the state hash and the view frame, in declaration order. */
export const TYPE_INDEX: Record<CrabType, number> = { normal: 0, armored: 1, swift: 2, fanner: 3, diver: 4 };

/** Index of each BulletKind in the state hash and the view frame, in declaration order. */
export const KIND_INDEX: Record<BulletKind, number> = {
  crab: 0, straight: 1, zigzag: 2, large: 3, wave: 4, ring: 5, explosive: 6, fragment: 7,
  meteor: 8, berserk: 9, spiral: 10, gravity: 11, clone: 12,
};

/** Index of each BoostType in the state hash, in declaration order. */
export const BOOST_INDEX: Record<BoostType, number> = {
  RAPID_FIRE: 0, ICE_FREEZE: 1, HEALTH_BOOST: 2, POINTS_FREEZE: 3,
  SHIELD_BARRIER: 4, AUTO_TARGET: 5, INVINCIBILITY: 6, MULTI_SHOT: 7, SCORE_MULTIPLIER: 8, RICOCHET: 9,
  WAVE_BLAST: 10, COIN_SHOWER: 11, GRAVITY_WELL: 12, PIERCING_BULLETS: 13,
  RANDOM_CHAOS: 14, SPEED_TAMER: 15,
};
