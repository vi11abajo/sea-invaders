import { idiv } from './fixed';
import type { CrabType } from './levels';
import type { BoostType, BulletKind, OctopiVariant } from './types';

/**
 * Gameplay constants in milli-units and ticks. The playfield is fixed and
 * identical on every device so that ranked runs are comparable.
 */
export const FIELD_W = 5625; // 5.625 units
export const FIELD_H = 11250; // 11.25 units

export const OCTOPI = {
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

/** Per-variant overrides layered onto the OCTOPI defaults above (spec §4); `base` has none. */
export const VARIANTS: Record<Exclude<OctopiVariant, 'base'>, { fireInterval?: number; lives?: number; piercing?: boolean }> = {
  harpoon: { fireInterval: 6 },
  anchor: { lives: 1 },
  trident: { piercing: true },
};

/** Octopi's fire cadence for `variant`, absent any active RAPID_FIRE boost (spec §4: harpoon fires every 6 ticks, others the base 8). */
export function fireIntervalFor(variant: OctopiVariant): number {
  return variant === 'base' ? OCTOPI.fireInterval : (VARIANTS[variant].fireInterval ?? OCTOPI.fireInterval);
}

/** Extra lives `variant` grants on top of `RunConfig.lives` at run start (spec §4: anchor only). */
export function bonusLivesFor(variant: OctopiVariant): number {
  return variant === 'base' ? 0 : (VARIANTS[variant].lives ?? 0);
}

/** Whether `variant` tags every player shot with the PIERCING bit regardless of boosts (spec §4: trident only). */
export function piercingFor(variant: OctopiVariant): boolean {
  return variant !== 'base' && Boolean(VARIANTS[variant].piercing);
}

/**
 * Game-speed tuning in percent of the original speeds (100 = unchanged, below 100 slower, above
 * faster). Change these knobs rather than the values they scale: every derived speed follows.
 * Owner tuning 2026-09-13: Octopi's shots -20 %, crab movement -10 %, crab fire rate -10 %.
 * Any change alters every replay, so it ships with a CORE_VERSION bump and regenerated goldens.
 */
export const TUNING = {
  /** How fast Octopi's shots fly: scales `UNTUNED_SPEED.octopiShot` into `SHOT.speed`. */
  octopiShotPct: 80,
  /** How fast crabs move: the formation march (see `marchSteps`) and diver dives (`DIVER.speed`). */
  crabMovePct: 90,
  /** How often crabs fire: scales the per-tick fire chance (see `fireChance`). */
  crabFirePct: 90,
} as const;

/** The original speeds, in units/tick, that the `TUNING` knobs scale. */
export const UNTUNED_SPEED = { octopiShot: 240, diver: 220 } as const;

/** `base` scaled to `pct` percent, rounded towards zero (integer-only like the rest of the core). */
export function scalePct(base: number, pct: number): number {
  return idiv(base * pct, 100);
}

/** Player shot; `speed` is `UNTUNED_SPEED.octopiShot` scaled by `TUNING.octopiShotPct`. */
export const SHOT = { w: 120, h: 360, speed: scalePct(UNTUNED_SPEED.octopiShot, TUNING.octopiShotPct) } as const;

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

/**
 * Colour a crab is drawn with, by type (spec §14 amendment): graded like the bosses, one colour
 * index per type, cosmetic only. `spawnFormation` assigns this directly and draws no colours.
 */
export const TYPE_COLOUR: Record<CrabType, number> = {
  normal: 0, // green
  armored: 1, // blue
  swift: 4, // yellow
  fanner: 3, // red
  diver: 2, // violet
};

/**
 * Enemy shot fired by each crab type when chosen to fire (spec §14 amendment): `null` means the
 * chosen crab fires nothing that tick (the shooter and fire-chance RNG draws still happen).
 * `fanner`'s `count: 3` fires the same fanned spread as before, now data-driven by type.
 */
export const CRAB_SHOTS: Record<CrabType, { kind: BulletKind; speed: number; count: 1 | 3 } | null> = {
  normal: { kind: 'crab', speed: 110, count: 1 },
  armored: { kind: 'heavy', speed: 80, count: 1 },
  swift: { kind: 'fast', speed: 150, count: 1 },
  fanner: { kind: 'crab', speed: 110, count: 3 },
  diver: null,
};

/**
 * A `diver`-type crab leaves formation every `interval` ticks for `ticks` ticks, closing at `speed`
 * units/tick: `UNTUNED_SPEED.diver` scaled by `TUNING.crabMovePct`.
 */
export const DIVER = { interval: 360, ticks: 90, speed: scalePct(UNTUNED_SPEED.diver, TUNING.crabMovePct) } as const;

/** Half-angle in degrees between a fanner's outer shots and its straight aim. */
export const FANNER_SPREAD = 20;

export type BoostRarity = 'common' | 'rare' | 'epic' | 'legendary';

/** Rarity roll order, common to legendary (spec §5.2). */
export const RARITY_ORDER: BoostRarity[] = ['common', 'rare', 'epic', 'legendary'];

/** One boost type per rarity, in the legacy web engine's `DISTRIBUTION` order. */
export const RARITY_LISTS: Record<BoostRarity, BoostType[]> = {
  common: ['RAPID_FIRE', 'ICE_FREEZE', 'HEALTH_BOOST', 'POINTS_FREEZE'],
  rare: ['SHIELD_BARRIER', 'AUTO_TARGET', 'INVINCIBILITY', 'MULTI_SHOT', 'SCORE_MULTIPLIER'],
  epic: ['WAVE_BLAST', 'COIN_SHOWER', 'GRAVITY_WELL', 'PIERCING_BULLETS'],
  legendary: ['RANDOM_CHAOS', 'SPEED_TAMER'],
};

/**
 * Rarity and duration (ticks; 0 instant, -1 until consumed) per boost type (spec §5.2).
 * RANDOM_CHAOS's `duration` here is unused: its actual timer is rolled in `activateBoost`
 * (`600 + rngBoosts.nextInt(301)`, i.e. 600-900 ticks), applied to whichever boost it picks.
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
  WAVE_BLAST: { rarity: 'epic', duration: 0 },
  COIN_SHOWER: { rarity: 'epic', duration: 0 },
  GRAVITY_WELL: { rarity: 'epic', duration: 600 },
  PIERCING_BULLETS: { rarity: 'epic', duration: 600 },
  RANDOM_CHAOS: { rarity: 'legendary', duration: 600 },
  SPEED_TAMER: { rarity: 'legendary', duration: -1 },
};

/** Drop spawn and lifecycle constants (spec §5.1; legacy `SPAWN`). */
export const DROP = { chance: 3, fall: 60, size: 600, ttl: 600 } as const;

/** Common boss model: spec §4.1. */
export const BOSS = {
  /** 66% of FIELD_W. */
  width: 3700,
  /** width * 0.8. */
  height: 2960,
  top: 700,
  speed: 15,
  baseHp: 200,
  hpStep: 100,
  transitionTicks: 120,
  attackBase: 120,
  attackJitter: 61,
  scoreBase: 10000,
  decayEvery: 150,
} as const;

/** Boss bullets: same base speed as crab shots, radius scaled from legacy BULLET_SIZE 10px. */
export const BOSS_SHOT = { speed: 110, radius: 96 } as const;

/**
 * Campaign-only wave arrival (spec §14 amendment): a level wave spawns `drop` units above its
 * slots and descends at `speed` units/tick for `ticks` ticks (30 * 50 = 1500, landing exactly on
 * the slots) with no enemy fire. Daily/practice never trigger this.
 */
export const ARRIVAL = { ticks: 30, drop: 1500, speed: 50 } as const;

/** HEALTH_BOOST's life cap (spec C9, legacy `game-constants.js` `MAX_LIVES`). */
export const MAX_LIVES = 100;

/**
 * GRAVITY_WELL's centre roll and its pull on enemy fire (spec C1, legacy `boost-manager.js:317-336`
 * `activateBoost` and `boost-effects.js:203-247` `applyGravityWellEffect`): the centre is a seeded
 * random point inset `margin` from the field edges, re-rolled while within `minDist` of Octopi, up
 * to `maxAttempts` rolls (the last one stands regardless); every enemy shot is redirected at `speed`
 * units/tick towards the centre, and one within `absorb` units of it is removed.
 */
export const WELL = { margin: 1835, minDist: 3670, maxAttempts: 8, speed: 147, absorb: 550 } as const;

/**
 * The wave-mode score-decay clock (spec C7, legacy `game-constants.js` decay wired through
 * `updateScoreMultiplier`): the percentage applied to a crab kill's points falls 1% every `every`
 * ticks (1700ms at 60 ticks/s) elapsed with no boss active and POINTS_FREEZE inactive, floored at
 * `floorPct`.
 */
export const SCORE_DECAY = { every: 102, floorPct: 1 } as const;
