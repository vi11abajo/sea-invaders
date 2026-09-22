import type { Rng } from './rng';
import type { FormationBehaviour } from './formations';
import type { CrabType, Formation } from './levels';
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
  // The veteran and boss-6..10 shot kinds (spec §2 / §5.1): appended, so no old index moves. Each
  // one that has a motion of its own carries it in `updateEnemyShots` — the bubbler's drifting
  // bubble, the bombardier's bursting charge, the Corsair's boomerang `axe` and the Tyrant's homing
  // `orb`; `firewall`, `shard`, `bolt` and `needle` fly the straight line they were cast on.
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
  /**
   * Ticks left until a patriarch's next revive (spec §2), armed at spawn by `armRallies` with
   * `RALLY_EVERY + RALLY_STAGGER * k` for the k-th patriarch of the wave and reset to `RALLY_EVERY`
   * after every rally. Neutral value: 0.
   */
  rallyTimer: number;
  /** The squad this crab belongs to (the boss squads of spec §5.1); 0 = none. Neutral value: 0. */
  squad: number;
  /**
   * A squad crab's own place in its squad's tiny grid, packed as `row * SQUAD_CELL_STRIDE + col`
   * (spec §5.1). A squad crab holds no formation slot (`slot` stays -1 — there is no wave to revive
   * into), so this is the only thing that says which crabs stand next to each other, which is what
   * the herald's aura reads. Neutral value: -1, for every crab that marches with a wave.
   */
  cell: number;
  /**
   * Ticks left of a revived crab's rally mark (spec §7, frame flag bit 2): `REVIVED_TICKS` the
   * moment a patriarch rallies it back, counting down to 0. Purely a renderer cue — nothing in the
   * simulation reads it. Neutral value: 0.
   */
  revived: number;
}

/**
 * One place in a formation, as an offset from the formation origin (spec §3). `row`/`col` are the
 * template's own coordinates, so a later task can read a slot's neighbourhood off them; `type` is
 * the kind that slot fields, which is what a revived crab would come back as.
 */
export interface FormationSlot {
  x: number;
  y: number;
  row: number;
  col: number;
  tier: number;
  type: CrabType;
}

/**
 * The live shape of a campaign wave (spec §3). Daily and practice waves have none — they keep
 * `GameState.formation = null` and every crab's `slot` at -1, and nothing about them changed.
 *
 * `ox`/`oy` is the point the slot offsets hang off: the field centre at `CRAB.startY` when the wave
 * spawns, carried along by the arrival descent and then by every march step and step-down, so
 * `ox + slot.x` names a crab's place at any moment. A `split` wave is the exception — its two
 * halves march apart and no single point describes both, so it leaves the origin where its arrival
 * ended and steers by `dirL`/`dirR` instead.
 */
export interface FormationState {
  /** The wave's own silhouette; it keeps its name after a reform, the slots below do not. */
  name: Formation;
  behaviour: FormationBehaviour;
  /** Slot offsets in spawn order, replaced by the spearhead's when the wave reforms. */
  slots: FormationSlot[];
  ox: number;
  oy: number;
  /** `split` only: the direction of the left half, 1 = right, -1 = left. */
  dirL: number;
  /** `split` only: the direction of the right half. */
  dirR: number;
  /**
   * `rotate` only: how far the wave is into its current ring step, in `MARCH_STEP_UNITS` — the
   * rotation counts march steps and slows with them, so this is not a clock. 0 when the crabs sit
   * exactly on their slots.
   */
  rotateTick: number;
  /** `reform` only: whether the wave has already fallen back into the spearhead. */
  reformed: boolean;
  /** A reform glide's remaining distance in `MARCH_STEP_UNITS`; 0 when the crabs are settled. */
  glideTicks: number;
}

export type BossPhaseState = 'fighting' | 'transition';

/** Every boss of both campaigns: 1..5 are the first campaign's, 6..10 the reefs 6-10 five (spec §5). */
export type BossKind = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/**
 * The bosses whose hit points, phases and score come from `BOSS_TABLE` rather than from the legacy
 * `baseHp + hpStep*(kind-1)` / `maxPhases = kind` / `scoreBase*kind` formulas (spec §5).
 */
export type TableBossKind = 6 | 7 | 8 | 9 | 10;

export interface BossState {
  kind: BossKind;
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
  // The eight fields below belong to the bosses of reefs 6-10 (spec §5.2). Every one of them is 0
  // (`[0, 0, 0]` for `mirror`) at spawn and stays there for the whole of a kind-1..5 fight: nothing
  // in the first campaign's five hooks reads or writes one.
  /** Templar: 1 while the shell shield is up (player shots bounce off it), 0 while it is down. */
  shieldUp: number;
  /** Ticks left of a telegraphed wind-up before the attack it announces lands. */
  windup: number;
  /** Templar: the firewall slot the next wall leaves open (with the slot to its right). */
  gapSlot: number;
  /** Huntsman: the x his sight line was fixed on; the needle flies at it however Octopi moves after. */
  aimX: number;
  /** Huntsman: ticks the sight line is still shown for. */
  aimTicks: number;
  /** Shots still to come in a staggered burst. */
  burst: number;
  /** Huntsman: ticks left of each mirrored boost class, in order offence, defence, control. */
  mirror: [number, number, number];
  /** Tyrant: ticks left of the window after a strike in which he takes double damage. */
  discharged: number;
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

/**
 * One living squad of crabs a boss fights alongside (spec §5.1). Its crabs are the ones in
 * `GameState.crabs` carrying this `id` in `Crab.squad`; the squad itself only has to remember which
 * way it is marching, because it never descends and never changes shape.
 */
export interface Squad {
  /** 1 and up; `Crab.squad` holds it, and 0 means "no squad". */
  id: number;
  /** March direction: 1 = right, -1 = left. */
  dir: number;
}

/** The arena objects a boss can raise (spec §5.1). `crystal` is the Frost Castellan's. */
export type ObstacleKind = 'crystal';

/** A box standing on the arena that eats shots from both sides (spec §5.1). `x`/`y` is its centre. */
export interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Player shots left before it shatters; an enemy shot never costs it one. */
  hp: number;
  kind: ObstacleKind;
}

export type GameEvent =
  | {
      tick: number;
      type:
        | 'wave_cleared' | 'level_cleared' | 'boss_spawn' | 'boss_phase' | 'boss_dead' | 'shield_break' | 'player_hit' | 'revived'
        // Veteran-skill events (spec §2): names only, nothing emits them yet — a later task wires in
        // the shield, aura, bubble, charge, rally and rage skills that raise these.
        | 'crab_shield_break' | 'crab_shield_up' | 'bubble_pop' | 'charge_burst' | 'crab_rallied' | 'formation_rage'
        // Raised once, by a `reform` wave falling back into the spearhead (spec §3).
        | 'formation_reform'
        // The reefs 6-10 boss events (spec §5). `squad_popped` is raised here — once per squad that
        // still had a crab standing when its boss died; every other name below belongs to one of
        // the five boss tasks and nothing raises it yet.
        | 'squad_popped'
        | 'boss_block' | 'boss_windup' | 'crew_looted' | 'boss_discharged'
        | 'lane_warning' | 'lane_strike' | 'boss_aim' | 'boss_reflect'
        | 'crystal_raised' | 'crystal_shatter'
    }
  /** An arena object shattered by player fire (spec §5.1), at the position it stood on. */
  | { tick: number; type: 'obstacle_destroyed'; x: number; y: number }
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
  /** The campaign wave's slots and living state (spec §3); null for daily, practice and boss rounds. */
  formation: FormationState | null;
  /** Ticks elapsed on the wave-mode score-decay clock (spec C7); reset at every wave start. */
  scoreDecay: number;
  /**
   * Ticks left of the formation's rage after a patriarch of it died (spec §2): while it is above 0
   * the wave marches and fires half again as fast. Refreshed, never stacked, and cleared at every
   * wave start — the rage belongs to the formation that lost its patriarch, not to the run.
   */
  rageTicks: number;
  /**
   * The kind each row of a daily or practice grid wave spawned with, in row order (spec §2): a
   * patriarch's rally has to know what a fallen grid cell was, and a grid row's kind is the whole of
   * that answer (`spawnWave` paints a row in one kind). Empty for a campaign wave, which carries a
   * kind per cell in `formation.slots`, and for a boss round.
   */
  gridRows: CrabType[];
  /**
   * The squads marching beside a boss right now (spec §5.1), in the order they were raised. Empty
   * outside a boss fight and for every boss of the first campaign.
   */
  squads: Squad[];
  /** The arena objects standing right now (spec §5.1). Empty for every boss of the first campaign. */
  obstacles: Obstacle[];
  /**
   * The Storm Tyrant's lanes, flat `[lane, ticksLeft]` pairs (spec §5.2): a lane warns for
   * `ticksLeft` ticks and then strikes. Empty until that boss's own task fills it.
   */
  lanes: number[];
  /**
   * The Abyssal Huntsman's sight lines, flat `[fromX, fromY, toX, decoy, ticksLeft]` groups (spec
   * §5.2) — the state the frame's `aim` array is built from. Empty until that boss's own task fills
   * it; a decoy's line carries `decoy = 1` and never fires.
   */
  aims: number[];
  /**
   * Ticks left of the Frost Castellan's cold snap (spec §5.2): while it is above 0 Octopi's per-axis
   * step cap is two thirds of `OCTOPI.maxStep`. 0 the rest of the time, and nothing but that boss
   * can ever raise it.
   */
  chillTicks: number;
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

/** Index of each ObstacleKind in the state hash and the view frame, in declaration order. */
export const OBSTACLE_INDEX: Record<ObstacleKind, number> = { crystal: 0 };

/**
 * How many columns a squad's cell packing leaves room for (spec §5.1): `Crab.cell` is
 * `row * SQUAD_CELL_STRIDE + col`, one int instead of a second and third `Crab` field. Eight is a
 * comfortable ceiling — the widest squad template is five crabs across — and it keeps the two
 * accessors below a shift and a mask in spirit while staying plain integer arithmetic.
 */
export const SQUAD_CELL_STRIDE = 8;

/** The packed cell of the squad place at `row`, `col`. */
export function squadCell(row: number, col: number): number {
  return row * SQUAD_CELL_STRIDE + col;
}

/** The row of a packed squad cell; -1 for the neutral cell of a crab that is in no squad. */
export function squadCellRow(cell: number): number {
  return cell < 0 ? -1 : Math.trunc(cell / SQUAD_CELL_STRIDE);
}

/** The column of a packed squad cell; -1 for the neutral cell of a crab that is in no squad. */
export function squadCellCol(cell: number): number {
  return cell < 0 ? -1 : cell % SQUAD_CELL_STRIDE;
}

/** Index of each FormationBehaviour in the state hash, in declaration order. */
export const BEHAVIOUR_INDEX: Record<FormationBehaviour, number> = { march: 0, rotate: 1, split: 2, reform: 3 };

/** Index of each OctopiVariant in the replay header byte, in declaration order. */
export const VARIANT_INDEX: Record<OctopiVariant, number> = { base: 0, harpoon: 1, anchor: 2, trident: 3 };
