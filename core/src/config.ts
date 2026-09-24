import { clamp, idiv } from './fixed';
import type { CrabType } from './levels';
import type { BoostType, BulletKind, OctopiVariant, TableBossKind } from './types';

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

/**
 * Per-variant overrides layered onto the OCTOPI defaults above; `base` has none. Each override is
 * read through its own `...For` accessor below, which hands back the unmodified default for every
 * variant without it — so a run of `base` or of the first three champions takes exactly the path it
 * always took.
 */
export const VARIANTS: Record<Exclude<OctopiVariant, 'base'>, {
  fireInterval?: number; lives?: number; piercing?: boolean;
  shellPerWave?: boolean; lifeEvery?: number; lifeCap?: number; livesPerRun?: number;
  lowLifeFireBonusPct?: number; lowLifeFullAt?: number; enemyShotPct?: number; boostDurationPct?: number;
}> = {
  harpoon: { fireInterval: 6 },
  anchor: { lives: 1 },
  trident: { piercing: true },
  noob: { shellPerWave: true },        // Shell
  coraluna: { lifeEvery: 120, lifeCap: 5, livesPerRun: 1 }, // Coral growth
  shoupe: { lowLifeFireBonusPct: 60, lowLifeFullAt: 5 }, // Last stand
  hex: { enemyShotPct: 70 },           // Hex
  kakashi: { boostDurationPct: 133 },  // Copy
};

/** Octopi's fire cadence for `variant`, absent any active RAPID_FIRE boost (harpoon fires every 6 ticks, others the base 8). */
export function fireIntervalFor(variant: OctopiVariant): number {
  return variant === 'base' ? OCTOPI.fireInterval : (VARIANTS[variant].fireInterval ?? OCTOPI.fireInterval);
}

/** Extra lives `variant` grants on top of `RunConfig.lives` at run start (anchor only). */
export function bonusLivesFor(variant: OctopiVariant): number {
  return variant === 'base' ? 0 : (VARIANTS[variant].lives ?? 0);
}

/** Whether `variant` tags every player shot with the PIERCING bit regardless of boosts (trident only). */
export function piercingFor(variant: OctopiVariant): boolean {
  return variant !== 'base' && Boolean(VARIANTS[variant].piercing);
}

/**
 * Whether `variant` wears a one-hit shell that comes back at the start of every wave and of every
 * boss fight (noob's Shell); false for everyone else.
 */
export function shellPerWaveFor(variant: OctopiVariant): boolean {
  return variant !== 'base' && Boolean(VARIANTS[variant].shellPerWave);
}

/**
 * `variant`'s Coral growth (coraluna's): one life for every `every` kills (120), at most `perRun`
 * times a run (1) and never to more than `cap` lives (5); null for every variant without it.
 */
export function coralGrowthFor(variant: OctopiVariant): { every: number; cap: number; perRun: number } | null {
  if (variant === 'base') return null;
  const { lifeEvery: every, lifeCap: cap, livesPerRun: perRun } = VARIANTS[variant];
  if (every === undefined || cap === undefined || perRun === undefined) return null;
  return { every, cap, perRun };
}

/**
 * How much faster `variant` fires with `lives` lives left, in percent of its ordinary fire rate
 * (shoupe's Last stand): the whole `lowLifeFireBonusPct` on the last life, falling in equal steps
 * to nothing at `lowLifeFullAt` lives and above — for shoupe +60 / +45 / +30 / +15 / +0 % at
 * 1 / 2 / 3 / 4 / 5+ lives. It is read with the lives Octopi has at each shot, so the bonus rises
 * as lives fall and falls again when a life comes back. null = no Last stand, and then the
 * ordinary `fireIntervalFor` cadence holds throughout, untouched by any sub-tick carry.
 */
export function lowLifeFireBonusPctFor(variant: OctopiVariant, lives: number): number | null {
  if (variant === 'base') return null;
  const { lowLifeFireBonusPct: bonusPct, lowLifeFullAt: fullAt } = VARIANTS[variant];
  if (bonusPct === undefined || fullAt === undefined) return null;
  // Clamped so a life count outside 1..fullAt can neither exceed the whole bonus nor go negative:
  // HEALTH_BOOST stacks lives far above fullAt, and a run at zero lives is over before it fires.
  const missing = clamp(fullAt - lives, 0, fullAt - 1);
  return idiv(bonusPct * missing, fullAt - 1);
}

/** The percentage of its speed every enemy shot moves at against `variant` (hex, 70); 100 unless overridden. */
export function enemyShotPctFor(variant: OctopiVariant): number {
  return variant === 'base' ? 100 : (VARIANTS[variant].enemyShotPct ?? 100);
}

/** The percentage of its duration a timed boost lasts for `variant` (kakashi's Copy, 133); 100 unless overridden. */
export function boostDurationPctFor(variant: OctopiVariant): number {
  return variant === 'base' ? 100 : (VARIANTS[variant].boostDurationPct ?? 100);
}

/** `base` scaled to `pct` percent, rounded towards zero (integer-only like the rest of the core). */
export function scalePct(base: number, pct: number): number {
  return idiv(base * pct, 100);
}

/**
 * The game's reference speeds, in percent of the original speeds: Octopi's shots at 80 %, crab
 * movement at 90 %, crab fire rate at 90 %. This is the speed the game shipped with at core 13, and
 * it is treated as 1.0: every `TUNING` knob is measured against it, so a balance change reads as a
 * step away from the game players know.
 */
export const BASE_SPEED_PCT = { octopiShot: 80, crabMove: 90, crabFire: 90 } as const;

/**
 * Game-speed tuning in percent of the reference speed (`BASE_SPEED_PCT`): 100 = the speed the game
 * shipped with at core 13, below 100 slower (50 halves it), above faster. Change these knobs rather
 * than the values they scale: every derived speed follows through `SPEED_PCT`.
 * Any change alters every replay, so the release carries a CORE_VERSION bump and regenerated goldens.
 */
export const TUNING = {
  /** How fast Octopi's shots fly: feeds `SPEED_PCT.octopiShot`, and through it `SHOT.speed`. */
  octopiShotPct: 100,
  /**
   * How fast crabs move: the formation march only (see `marchSteps`). A wave's arrival descent
   * runs at `ARRIVAL.speed` raw, which this knob does not touch.
   */
  crabMovePct: 100,
  /** How often crabs fire: scales the per-tick fire chance (see `fireChance`). */
  crabFirePct: 100,
} as const;

/**
 * The speeds the simulation actually runs at, in percent of the original speeds: each reference
 * speed scaled by its knob. With every knob at 100 this is exactly `BASE_SPEED_PCT`, so the derived
 * values below are bit-identical to the ones the reference was measured from.
 */
export const SPEED_PCT = {
  octopiShot: scalePct(BASE_SPEED_PCT.octopiShot, TUNING.octopiShotPct),
  crabMove: scalePct(BASE_SPEED_PCT.crabMove, TUNING.crabMovePct),
  crabFire: scalePct(BASE_SPEED_PCT.crabFire, TUNING.crabFirePct),
} as const;

/** The original speeds, in units/tick, that `SPEED_PCT` scales. */
export const UNTUNED_SPEED = { octopiShot: 240 } as const;

/** Player shot; `speed` is `UNTUNED_SPEED.octopiShot` scaled by `SPEED_PCT.octopiShot`. */
export const SHOT = { w: 120, h: 360, speed: scalePct(UNTUNED_SPEED.octopiShot, SPEED_PCT.octopiShot) } as const;

export const ENEMY_SHOT = {
  radius: 96,
  speed: 110,
  /** Wave-1 fire chance per tick, in 1/1000. */
  perMille: 20,
} as const;

export const CRAB = {
  /** About 9.4% of the field width. */
  size: 530,
  /**
   * Sprite-colour count: 5 legacy + 5 veteran kinds (the "Reefs 6-10" design). Nothing in
   * core/src draws a random colour or keys a colour modulo off this number — the daily/practice
   * spawn (`spawnWave` in game.ts) draws its kind from `dailyPool`'s own length, and the campaign
   * spawn (`spawnFormation`) never draws a colour at all — so raising it here changes no existing
   * simulation output; it only tells the app how many sprite colours to expect.
   */
  kinds: 10,
  cols: 6,
  gapX: 800,
  gapY: 700,
  startY: 1500,
  /** Horizontal speed per tick at the start of wave 1. */
  baseSpeed: 6,
  stepDown: 250,
  points: 10,
} as const;

/**
 * Hit points and score per crab kind: the five legacy kinds (unchanged) plus the five
 * veteran kinds of reefs 6-10. `normal` matches CRAB.points and 1 hp, unchanged from
 * wave-mode behaviour; armored survives one hit and elder two, and the app draws the damage. The
 * veterans enter a reef's pool through `levels.ts`'s `REEF_ROSTERS` and the daily/practice grid
 * through `ALL_KINDS` (core v11).
 */
export const CRAB_TYPES = {
  normal: { hp: 1, points: 10 },
  armored: { hp: 2, points: 25 },
  swift: { hp: 1, points: 15 },
  heavy: { hp: 1, points: 20 },
  elder: { hp: 3, points: 40 },
  warden: { hp: 2, points: 35 },
  herald: { hp: 3, points: 50 },
  bubbler: { hp: 2, points: 45 },
  bombardier: { hp: 2, points: 60 },
  patriarch: { hp: 5, points: 100 },
} as const;

/**
 * Colour a crab is drawn with, by kind: one colour index per kind, cosmetic only, and
 * the sprites are keyed off it. `spawnFormation` and `spawnWave` assign it directly, drawing no
 * colours. The veterans take colours 5..9, green through violet, in reef order (warden, herald,
 * bubbler, bombardier, patriarch) — old indices 0..4 never move.
 */
export const TYPE_COLOUR: Record<CrabType, number> = {
  normal: 0, // green
  armored: 1, // blue
  swift: 4, // yellow
  heavy: 3, // red
  elder: 2, // violet
  warden: 5, // green veteran
  herald: 6, // blue veteran
  bubbler: 7, // yellow veteran
  bombardier: 8, // red veteran
  patriarch: 9, // violet veteran
};

/**
 * The shot each crab kind fires when it is the one chosen to fire: every kind fires
 * exactly one aimed shot. Among the legacy kinds only the red `heavy` crab fires anything but the
 * plain crab shot — faster, wider (`shotRadius`) and worth two lives (`shotDamage`). Among the
 * veterans, warden/herald/patriarch fire the same plain crab shot; bubbler fires a `bubble` and
 * bombardier a `charge` — both still just fly straight and aimed like any other crab shot, without
 * their own motion (zigzag bubble, bursting charge) or distinct `shotRadius`/`shotDamage` cases.
 */
export const CRAB_SHOTS: Record<CrabType, { kind: BulletKind; speed: number; damage: 1 | 2 }> = {
  normal: { kind: 'crab', speed: 110, damage: 1 },
  armored: { kind: 'crab', speed: 110, damage: 1 },
  swift: { kind: 'crab', speed: 110, damage: 1 },
  heavy: { kind: 'heavy', speed: 140, damage: 2 },
  elder: { kind: 'crab', speed: 110, damage: 1 },
  warden: { kind: 'crab', speed: 110, damage: 1 },
  herald: { kind: 'crab', speed: 110, damage: 1 },
  bubbler: { kind: 'bubble', speed: 60, damage: 1 },
  bombardier: { kind: 'charge', speed: 100, damage: 2 },
  patriarch: { kind: 'crab', speed: 110, damage: 1 },
};

/**
 * How likely each kind is to be the crab that fires. The per-tick chance that *some*
 * crab fires is unchanged (`fireChance`); this only picks which one, by weight over the live crabs,
 * so a yellow or violet crab (legacy or veteran) fires twice as often as a green one and a red one
 * half as often.
 */
export const FIRE_WEIGHT: Record<CrabType, number> = {
  normal: 2,
  armored: 2,
  swift: 4,
  heavy: 1,
  elder: 4,
  warden: 2,
  herald: 2,
  bubbler: 3,
  bombardier: 1,
  patriarch: 4,
};

export type BoostRarity = 'common' | 'rare' | 'epic' | 'legendary';

/** Rarity roll order, common to legendary. */
export const RARITY_ORDER: BoostRarity[] = ['common', 'rare', 'epic', 'legendary'];

/** One boost type per rarity, in the legacy web engine's `DISTRIBUTION` order. */
export const RARITY_LISTS: Record<BoostRarity, BoostType[]> = {
  common: ['RAPID_FIRE', 'ICE_FREEZE', 'HEALTH_BOOST', 'POINTS_FREEZE'],
  rare: ['SHIELD_BARRIER', 'AUTO_TARGET', 'INVINCIBILITY', 'MULTI_SHOT', 'SCORE_MULTIPLIER'],
  epic: ['WAVE_BLAST', 'COIN_SHOWER', 'GRAVITY_WELL', 'PIERCING_BULLETS'],
  legendary: ['RANDOM_CHAOS', 'SPEED_TAMER'],
};

/**
 * Rarity and duration (ticks; 0 instant, -1 until consumed) per boost type.
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

/** Drop spawn and lifecycle constants (legacy `SPAWN`). */
export const DROP = { chance: 3, fall: 60, size: 600, ttl: 600 } as const;

/** Common boss model. */
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
 * Hit points, phases and score base of the bosses of reefs 6-10. The first campaign's
 * five are deliberately absent: they keep taking their numbers from `BOSS.baseHp`/`BOSS.hpStep`,
 * `maxPhases = kind` and `BOSS.scoreBase * kind`, and `bossStats` is the one place that chooses.
 * `score` is the *whole* base (what `scoreBase * kind` yields for a legacy boss), before the fight's
 * own decay and SCORE_MULTIPLIER.
 */
export const BOSS_TABLE: Readonly<Record<TableBossKind, Readonly<{ hp: number; phases: number; score: number }>>> = {
  6: { hp: 700, phases: 2, score: 12000 },
  7: { hp: 800, phases: 3, score: 14000 },
  8: { hp: 900, phases: 3, score: 16000 },
  9: { hp: 1000, phases: 4, score: 18000 },
  10: { hp: 1200, phases: 4, score: 20000 },
};

/**
 * Campaign-only wave arrival: a level wave spawns `drop` units above its
 * slots and descends at `speed` units/tick for `ticks` ticks (30 * 50 = 1500, landing exactly on
 * the slots) with no enemy fire. Daily/practice never trigger this.
 */
export const ARRIVAL = { ticks: 30, drop: 1500, speed: 50 } as const;

/** The Tide: a paid revive brings Octopi back with this many lives. */
export const TIDE_REVIVE_LIVES = 3;

/** HEALTH_BOOST's life cap. */
export const MAX_LIVES = 100;

/**
 * GRAVITY_WELL's centre roll and its pull on enemy fire: the centre is a seeded
 * random point inset `margin` from the field edges, re-rolled while within `minDist` of Octopi, up
 * to `maxAttempts` rolls (the last one stands regardless); every enemy shot is redirected at `speed`
 * units/tick towards the centre, and one within `absorb` units of it is removed.
 */
export const WELL = { margin: 1835, minDist: 3670, maxAttempts: 8, speed: 147, absorb: 550 } as const;

/**
 * The wave-mode score-decay clock: the percentage applied to a crab kill's points falls 1% every `every`
 * ticks (1700ms at 60 ticks/s) elapsed with no boss active and POINTS_FREEZE inactive, floored at
 * `floorPct`.
 */
export const SCORE_DECAY = { every: 102, floorPct: 1 } as const;
