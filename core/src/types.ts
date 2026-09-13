import type { Rng } from './rng';
import type { CrabType } from './levels';
import type { RunConfig } from './run';

/** Octopi target in integer milli-units, as produced by the touch layer. */
export interface Input {
  x: number;
  y: number;
}

export interface Octopi {
  x: number;
  y: number;
  /** Ticks until the next automatic shot. */
  cooldown: number;
  /** Remaining invulnerability ticks after a hit. */
  invuln: number;
  lives: number;
}

/**
 * Paid gameplay variant for a run (spec §4): `base` is the free, unmodified Octopi. Never a
 * simulation input beyond `RunConfig.octopi` — every effect (fire cadence, starting lives, the
 * piercing bit) is applied once in `createGame`/`updateShots` from that field.
 */
export type OctopiVariant = 'base' | 'harpoon' | 'anchor' | 'trident';

export type BulletKind =
  | 'crab' | 'straight' | 'zigzag' | 'large' | 'wave' | 'ring' | 'explosive' | 'fragment'
  | 'meteor' | 'berserk' | 'spiral' | 'gravity' | 'clone'
  | 'heavy' | 'fast';

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Player shots: 'crab' is never used; enemy shots default to 'crab'. */
  kind: BulletKind;
  /** Kind-specific counter (zigzag flip timer, explosive fuse, pierce bit for player shots). */
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
  | 'SHIELD_BARRIER' | 'AUTO_TARGET' | 'INVINCIBILITY' | 'MULTI_SHOT' | 'SCORE_MULTIPLIER'
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
  | { tick: number; type: 'wave_cleared' | 'level_cleared' | 'boss_spawn' | 'boss_phase' | 'boss_dead' | 'shield_break' | 'player_hit' | 'revived' }
  | { tick: number; type: 'boss_ability'; name: 'regen' | 'shield' | 'meteor' | 'rage' | 'freeze' }
  | { tick: number; type: 'boss_teleport'; fromX: number; toX: number }
  | { tick: number; type: 'boss_clone'; leftX: number; rightX: number }
  | { tick: number; type: 'meteor_warning'; x: number }
  | { tick: number; type: 'boost_drop' | 'boost_pickup' | 'boost_expire'; boost: BoostType }
  | { tick: number; type: 'player_freeze'; ticks: number }
  | { tick: number; type: 'wave_start'; wave: number };

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
  octopi: Octopi;
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
  /** Ticks left in a campaign wave's arrival descent; 0 when idle. Daily/practice never set this. */
  arrival: number;
  /** Ticks elapsed on the wave-mode score-decay clock (spec C7); reset at every wave start. */
  scoreDecay: number;
}

/** Index of each CrabType in the state hash and the view frame, in declaration order. */
export const TYPE_INDEX: Record<CrabType, number> = { normal: 0, armored: 1, swift: 2, fanner: 3, diver: 4 };

/** Index of each BulletKind in the state hash and the view frame, in declaration order. */
export const KIND_INDEX: Record<BulletKind, number> = {
  crab: 0, straight: 1, zigzag: 2, large: 3, wave: 4, ring: 5, explosive: 6, fragment: 7,
  meteor: 8, berserk: 9, spiral: 10, gravity: 11, clone: 12,
  heavy: 13, fast: 14,
};

/**
 * Index of each BoostType in the state hash, in declaration order. RICOCHET was removed from the
 * game entirely (owner decision, Phase 3A.1 lane C) — the indices below are contiguous over the
 * remaining 15 boosts, not the old 16; any consumer keying off these numbers (the mobile app's drop
 * icon/HUD-name maps) needs the same renumbering.
 */
export const BOOST_INDEX: Record<BoostType, number> = {
  RAPID_FIRE: 0, ICE_FREEZE: 1, HEALTH_BOOST: 2, POINTS_FREEZE: 3,
  SHIELD_BARRIER: 4, AUTO_TARGET: 5, INVINCIBILITY: 6, MULTI_SHOT: 7, SCORE_MULTIPLIER: 8,
  WAVE_BLAST: 9, COIN_SHOWER: 10, GRAVITY_WELL: 11, PIERCING_BULLETS: 12,
  RANDOM_CHAOS: 13, SPEED_TAMER: 14,
};

/** Index of each OctopiVariant in the replay header byte, in declaration order. */
export const VARIANT_INDEX: Record<OctopiVariant, number> = { base: 0, harpoon: 1, anchor: 2, trident: 3 };
