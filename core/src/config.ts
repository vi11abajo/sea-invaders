import type { BoostType } from './types';

/**
 * Gameplay constants in milli-units and ticks. The playfield is fixed and
 * identical on every device so that ranked runs are comparable.
 */
export const FIELD_W = 5625; // 5.625 units
export const FIELD_H = 11250; // 11.25 units

export const SHIP = {
  /** Sprite box: 20% of the field width. */
  size: 1125,
  /** Hitbox radius: a 0.32-unit circle, 3–4x smaller than the sprite. */
  hitRadius: 160,
  /** Maximum movement per axis per tick. */
  maxStep: 250,
  minY: 5000,
  maxY: FIELD_H - 700,
  startY: FIELD_H - 1600,
  lives: 3,
  invulnTicks: 120,
  fireInterval: 8,
} as const;

export const SHOT = { w: 120, h: 360, speed: 240 } as const;

export const ENEMY_SHOT = {
  radius: 96,
  speed: 110,
  /** Wave-1 fire chance per tick, in 1/1000. */
  perMille: 20,
} as const;

export const CRAB = {
  /** About 9.4% of the field width. */
  size: 530,
  kinds: 5,
  cols: 6,
  gapX: 800,
  gapY: 700,
  startY: 1500,
  /** Horizontal speed per tick at the start of wave 1. */
  baseSpeed: 6,
  stepDown: 250,
  points: 10,
} as const;

/** Hit points and score per crab type. `normal` matches CRAB.points/1 hp, unchanged from wave-mode behaviour. */
export const CRAB_TYPES = {
  normal: { hp: 1, points: 10 },
  armored: { hp: 2, points: 25 },
  swift: { hp: 1, points: 15 },
  fanner: { hp: 1, points: 20 },
  diver: { hp: 1, points: 30 },
} as const;

/** A `diver`-type crab leaves formation every `interval` ticks for `ticks` ticks, closing at `speed` units/tick. */
export const DIVER = { interval: 360, ticks: 90, speed: 220 } as const;

/** Half-angle in degrees between a fanner's outer shots and its straight aim. */
export const FANNER_SPREAD = 20;

export type BoostRarity = 'common' | 'rare' | 'epic' | 'legendary';

/** Rarity roll order, common to legendary (spec §5.2). */
export const RARITY_ORDER: BoostRarity[] = ['common', 'rare', 'epic', 'legendary'];

/** One boost type per rarity, in the legacy `DISTRIBUTION` order (`boosts/boost-constants.js`). */
export const RARITY_LISTS: Record<BoostRarity, BoostType[]> = {
  common: ['RAPID_FIRE', 'ICE_FREEZE', 'HEALTH_BOOST', 'POINTS_FREEZE'],
  rare: ['SHIELD_BARRIER', 'AUTO_TARGET', 'INVINCIBILITY', 'MULTI_SHOT', 'SCORE_MULTIPLIER', 'RICOCHET'],
  epic: ['WAVE_BLAST', 'COIN_SHOWER', 'GRAVITY_WELL', 'PIERCING_BULLETS'],
  legendary: ['RANDOM_CHAOS', 'SPEED_TAMER'],
};

/**
 * Rarity and duration (ticks; 0 instant, -1 until consumed) per boost type (spec §5.2).
 * RANDOM_CHAOS's actual roll (600-900 ticks) is Task 15's; this base value is only a placeholder
 * for the table shape until then.
 */
export const BOOSTS: Record<BoostType, { rarity: BoostRarity; duration: number }> = {
  RAPID_FIRE: { rarity: 'common', duration: 600 },
  ICE_FREEZE: { rarity: 'common', duration: 600 },
  HEALTH_BOOST: { rarity: 'common', duration: 0 },
  POINTS_FREEZE: { rarity: 'common', duration: 600 },
  SHIELD_BARRIER: { rarity: 'rare', duration: -1 },
  AUTO_TARGET: { rarity: 'rare', duration: 466 },
  INVINCIBILITY: { rarity: 'rare', duration: 600 },
  MULTI_SHOT: { rarity: 'rare', duration: 600 },
  SCORE_MULTIPLIER: { rarity: 'rare', duration: 600 },
  RICOCHET: { rarity: 'rare', duration: 600 },
  WAVE_BLAST: { rarity: 'epic', duration: 0 },
  COIN_SHOWER: { rarity: 'epic', duration: 0 },
  GRAVITY_WELL: { rarity: 'epic', duration: 600 },
  PIERCING_BULLETS: { rarity: 'epic', duration: 600 },
  RANDOM_CHAOS: { rarity: 'legendary', duration: 600 },
  SPEED_TAMER: { rarity: 'legendary', duration: -1 },
};

/** Drop spawn and lifecycle constants (spec §5.1; legacy `SPAWN`). */
export const DROP = { chance: 7, fall: 60, size: 600, ttl: 600 } as const;

/** Common boss model: spec §4.1. */
export const BOSS = {
  /** 66% of FIELD_W. */
  width: 3700,
  /** width * 0.8. */
  height: 2960,
  top: 700,
  speed: 15,
  baseHp: 50,
  hpStep: 25,
  transitionTicks: 120,
  attackBase: 120,
  attackJitter: 61,
  scoreBase: 10000,
  decayEvery: 150,
} as const;

/** Boss bullets: same base speed as crab shots, radius scaled from legacy BULLET_SIZE 10px. */
export const BOSS_SHOT = { speed: 110, radius: 96 } as const;
