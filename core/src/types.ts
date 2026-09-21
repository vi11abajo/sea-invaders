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
  | 'heavy'
  // The veteran and boss-6..10 shot kinds (spec §2 / §5.1): appended, so no old index moves. Their
  // own motion (zigzag bubble, bursting charge, homing orb, aimed needle, ...) is a later task's
  // work — for now any bullet with one of these kinds just flies straight like `crab`/`heavy` do.
  | 'bubble' | 'charge' | 'firewall' | 'shard' | 'axe' | 'bolt' | 'orb' | 'needle';

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
  /** Colour index in [0, CRAB.kinds); `TYPE_COLOUR[type]`, cosmetic only. */
  kind: number;
  type: CrabType;
  /** Hit points left, counting down from `CRAB_TYPES[type].hp`. */
  hp: number;
  /**
   * The living-formation slot this crab occupies, an index into `GameState.formation.slots`; -1
   * when unslotted (spec §3 — a later task's field, `march` waves never set it). Neutral value: -1.
   */
  slot: number;
  /** Warden's rune shield (spec §2): 1 while up, 0 while broken. Neutral value: 0, except a spawned warden starts at 1. */
  shield: 0 | 1;
  /** Ticks until a broken warden shield restores itself (spec §2). Neutral value: 0. */
  shieldTimer: number;
  /** How many times a patriarch has revived a fallen crab of its wave, capped at 3 (spec §2). Neutral value: 0. */
  rallies: number;
  /** Ticks left in a patriarch's revive cadence (spec §2). Neutral value: 0. */
  rallyTimer: number;
  /** The squad this crab belongs to (a later task's boss squads, spec §5.1); 0 = none. Neutral value: 0. */
  squad: number;
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
  | {
      tick: number;
      type:
        | 'wave_cleared' | 'level_cleared' | 'boss_spawn' | 'boss_phase' | 'boss_dead' | 'shield_break' | 'player_hit' | 'revived'
        // Veteran-skill events (spec §2): names only, nothing emits them yet — a later task wires in
        // the shield, aura, bubble, charge, rally and rage skills that raise these.
        | 'crab_shield_break' | 'crab_shield_up' | 'bubble_pop' | 'charge_burst' | 'crab_rallied' | 'formation_rage'
    }
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

/**
 * Index of each CrabType in the state hash and the view frame, in declaration order: 0..4 the five
 * legacy kinds (unchanged), 5..9 the veterans, appended (spec §2 — `TYPE_COLOUR` mirrors the same
 * indices for the sprite colour).
 */
export const TYPE_INDEX: Record<CrabType, number> = {
  normal: 0, armored: 1, swift: 2, heavy: 3, elder: 4,
  warden: 5, herald: 6, bubbler: 7, bombardier: 8, patriarch: 9,
};

/**
 * Index of each BulletKind in the state hash and the view frame, in declaration order. The `fast`
 * kind went with the swift crab's own shot in core v8, so the list was 14 long, not 15, before the
 * veteran and boss-6..10 kinds appended eight more (spec §2 / §5.1); any consumer keying off these
 * numbers (the app's bullet drawing) needs the same list, old indices never moving.
 */
export const KIND_INDEX: Record<BulletKind, number> = {
  crab: 0, straight: 1, zigzag: 2, large: 3, wave: 4, ring: 5, explosive: 6, fragment: 7,
  meteor: 8, berserk: 9, spiral: 10, gravity: 11, clone: 12,
  heavy: 13,
  bubble: 14, charge: 15, firewall: 16, shard: 17, axe: 18, bolt: 19, orb: 20, needle: 21,
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
