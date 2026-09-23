import { Canvas, Picture, Skia } from '@shopify/react-native-skia';
import {
  BOOST_INDEX, CRAB_SHOTS, CRAB_TYPES, DAILY_RUN, EMPTY_FRAME, FixedStepper, INITIAL_INPUT, LANE_STRIDE, PRACTICE_RUN, REPLAY_MODE, ReplayRecorder,
  OCTOPI, TIDE_REVIVE_LIVES, createGame, fitField, formatInt, revive, snapshot, step, touchToInput,
  type BoostType, type BossFrame, type Bullet, type BulletKind, type Crab, type Frame, type GameEvent, type Input, type OctopiVariant, type Replay,
  type ReplayMode, type RunConfig,
} from '@sea-invaders/core';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BackHandler, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';
import {
  hapticBossDead, hapticBossPhase, hapticBossSpawn, hapticBossTeleport, hapticBoostPickup, hapticChargeBurst, hapticLevelCleared,
  hapticLifeLost, hapticMeteorImpact, hapticMeteorWarning, hapticPlayerFreeze, hapticRage, hapticRevived,
  hapticRunOver, hapticShieldBreak, hapticWaveCleared, hapticWaveStart,
} from '../audio/haptics';
import { playSfx, type SfxId } from '../audio/sfx';
import { VARIANT_NAMES } from '../loadout/items';
import { ACCENT_BY_VARIANT, tintWithAlpha } from '../shop/tints';
import { Backdrop } from '../ui/Backdrop';
import { Txt } from '../ui/Txt';
import { COLORS, FONTS } from '../ui/tokens';
import { GameHud, type HudBadge, type HudBoost } from './GameHud';
import { PauseSheet, RevivedSheet } from './PauseSheet';
import { RESULT_POSE_SIZE, ResultView } from './ResultView';
import { EFFECT_CAP, drawFrame, effectExpired, type EffectEntry, type Effects, type WaveBlast } from './draw';
import { BASE_LOOK, lookKey } from './looks';
import { RunLookContext, RunOctopiContext, useOctopiLook } from './skins';
import { primeOctopiArt, useArtPair, usePreparedSprites, useSprites } from './sprites';

/** Milli-units between the finger and Octopi's centre, so the finger never covers Octopi. */
const FINGER_LIFT = 600;

const HINT = 'Drag anywhere — Octopi follows above your finger. Auto-fire.';

/** The champion badge's fill: the champion's accent at the alpha of the HUD's other tags (RAGE, FROZEN). */
const BADGE_ALPHA = 0.35;

/** How long the wave/phase banner and the pickup toast stay up, in rendered frames. */
const BANNER_FRAMES = 60;
const TOAST_FRAMES = 60;

/**
 * `BoostType` for each `BOOST_INDEX` slot. Placed by value rather than by relying on the object
 * literal's key declaration order, so a future reordering of `BOOST_INDEX` cannot silently mislabel
 * a slot.
 */
const BOOST_BY_INDEX = Object.entries(BOOST_INDEX).reduce<BoostType[]>((arr, [type, index]) => {
  arr[index] = type as BoostType;
  return arr;
}, []);

/** The bullet kinds crabs fire (mirrors core's own `crabs.ts:CRAB_SHOT_KINDS`); any other kind pushed onto `enemyShots` is a boss's. */
const CRAB_SHOT_KINDS = new Set(Object.values(CRAB_SHOTS).map((e) => e.kind));

/** Counts `bullets` by kind into `into` (cleared first, never reallocated: the frame loop reuses two maps). */
function countKinds(bullets: readonly Bullet[], into: Map<BulletKind, number>): Map<BulletKind, number> {
  into.clear();
  for (const b of bullets) into.set(b.kind, (into.get(b.kind) ?? 0) + 1);
  return into;
}

/** "RAPID_FIRE" -> "Rapid Fire". */
function titleCase(type: string): string {
  return type.split('_').map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
}

/**
 * Every reefs-6-10 event name (`GameEvent`'s own union, spec §5/§7). Declared with `Extract` rather
 * than as a bare literal union so a typo here — a literal that does not name a real `GameEvent`
 * member — shrinks the extracted type instead of silently widening it: the `Record`s below would then
 * carry an excess property and fail `tsc`, exactly the "a missing key fails tsc" ruling (R46) asks for.
 */
type ReefsEventType = Extract<
  GameEvent['type'],
  | 'crab_shield_break' | 'crab_shield_up' | 'bubble_pop' | 'charge_burst' | 'crab_rallied' | 'formation_rage'
  | 'formation_reform' | 'squad_popped' | 'boss_block' | 'boss_windup' | 'crew_looted' | 'boss_discharged'
  | 'lane_warning' | 'lane_strike' | 'boss_aim' | 'boss_reflect' | 'crystal_raised' | 'crystal_shatter'
  | 'obstacle_destroyed' | 'cold_snap'
>;

/**
 * Every reefs-6-10 event's own sound (ruling R46): a `Record`, not a `Partial`, so leaving one out
 * fails `tsc` rather than silently playing nothing. `undefined` marks a deliberate silence
 * (`formation_reform`, `squad_popped`: no sound of their own — nothing else in the run's own table A
 * gives a wave-reform or a squad-wipe a sound either).
 */
const REEFS_SFX: Record<ReefsEventType, SfxId | undefined> = {
  crab_shield_break: 'rune_break',
  crab_shield_up: 'rune_up',
  bubble_pop: 'bubble_pop',
  charge_burst: 'charge_burst',
  crab_rallied: 'rally',
  formation_rage: 'boss_rage',
  formation_reform: undefined,
  squad_popped: undefined,
  boss_block: 'boss_shield',
  boss_windup: 'boss_shot',
  crew_looted: 'boost_drop',
  boss_discharged: 'boss_hit',
  lane_warning: 'meteor_warning',
  lane_strike: 'lightning',
  boss_aim: 'needle',
  boss_reflect: 'boss_rage',
  crystal_raised: 'boss_shield',
  crystal_shatter: 'crystal_break',
  obstacle_destroyed: 'crystal_break',
  cold_snap: 'player_freeze',
};

/**
 * Every reefs-6-10 event's own haptic (ruling R46: "lane_strike, charge_burst, crystal_shatter,
 * formation_rage, boss_reflect get a haptic row"): the same exhaustive-`Record` shape as `REEFS_SFX`
 * above, `undefined` for the fifteen that get none — nothing frequent buzzes (the run's own rule for
 * table D), and these fifteen are either frequent (a shield up/down, a bubble, a rally) or minor
 * telegraphs already carried by their own sound. `charge_burst` is the one new `HapticId` this table
 * needs; the other four reuse an existing row exactly.
 */
const REEFS_HAPTIC: Record<ReefsEventType, HapticId | undefined> = {
  crab_shield_break: undefined,
  crab_shield_up: undefined,
  bubble_pop: undefined,
  charge_burst: 'charge_burst',
  crab_rallied: undefined,
  formation_rage: 'rage',
  formation_reform: undefined,
  squad_popped: undefined,
  boss_block: undefined,
  boss_windup: undefined,
  crew_looted: undefined,
  boss_discharged: undefined,
  lane_warning: undefined,
  lane_strike: 'meteor_impact',
  boss_aim: undefined,
  boss_reflect: 'shield_break',
  crystal_raised: undefined,
  crystal_shatter: 'shield_break',
  obstacle_destroyed: undefined,
  cold_snap: undefined,
};

/** `record` with every `undefined` value dropped, so the result is a valid `Partial<Record<K, V>>`. */
function definedEntries<K extends string, V>(record: Record<K, V | undefined>): Partial<Record<K, V>> {
  const out: Partial<Record<K, V>> = {};
  for (const key of Object.keys(record) as K[]) {
    const value = record[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * `GameEvent.type` -> sound id, for every event that plays the same sound every time (sound design
 * doc, table A). `boss_ability` and `boost_pickup` carry a payload that picks between several
 * sounds, so they are handled separately in the frame loop below rather than through this map.
 */
const SFX_FOR_EVENT: Partial<Record<GameEvent['type'], SfxId>> = {
  player_hit: 'player_hit',
  shield_break: 'shield_break',
  wave_start: 'wave_start',
  wave_cleared: 'wave_cleared',
  level_cleared: 'level_cleared',
  boss_spawn: 'boss_spawn',
  boss_phase: 'boss_phase',
  boss_dead: 'boss_dead',
  boss_teleport: 'boss_teleport',
  boss_clone: 'boss_clone',
  meteor_warning: 'meteor_warning',
  boost_drop: 'boost_drop',
  boost_expire: 'boost_expire',
  player_freeze: 'player_freeze',
  revived: 'revived',
  ...definedEntries(REEFS_SFX),
};

/** `boss_ability`'s `name` -> sound id (table A). */
const BOSS_ABILITY_SFX: Record<'regen' | 'shield' | 'meteor' | 'rage' | 'freeze', SfxId> = {
  regen: 'boss_regen',
  shield: 'boss_shield',
  meteor: 'meteor_impact',
  rage: 'boss_rage',
  freeze: 'boss_freeze',
};

/**
 * A row of the haptics design doc (table D) that fires from the run's frame loop. Kept as a string id
 * (rather than a direct function reference) so per-frame de-duplication works the same way as
 * `SfxId` does for sounds — two different moments never collapse into one just because they happen
 * to share the same underlying impact style.
 */
type HapticId =
  | 'life_lost' | 'shield_break' | 'boost_pickup' | 'wave_start' | 'wave_cleared' | 'level_cleared' | 'run_over'
  | 'boss_spawn' | 'boss_phase' | 'boss_dead' | 'meteor_warning' | 'meteor_impact' | 'rage' | 'boss_teleport'
  | 'player_freeze' | 'revived'
  // Reefs 6-10 (ruling R46): the one new id the ruling's "at most two" allows; every other reefs
  // event either gets none or reuses one of the ids already above.
  | 'charge_burst';

const HAPTIC_ACTIONS: Record<HapticId, () => void> = {
  life_lost: hapticLifeLost,
  shield_break: hapticShieldBreak,
  boost_pickup: hapticBoostPickup,
  wave_start: hapticWaveStart,
  wave_cleared: hapticWaveCleared,
  level_cleared: hapticLevelCleared,
  run_over: hapticRunOver,
  boss_spawn: hapticBossSpawn,
  boss_phase: hapticBossPhase,
  boss_dead: hapticBossDead,
  meteor_warning: hapticMeteorWarning,
  meteor_impact: hapticMeteorImpact,
  rage: hapticRage,
  boss_teleport: hapticBossTeleport,
  player_freeze: hapticPlayerFreeze,
  revived: hapticRevived,
  charge_burst: hapticChargeBurst,
};

/**
 * `GameEvent.type` -> haptic id, for every event with a haptic row in table D. Shots, ordinary kills,
 * a boss hit, boost expiry, `boss_clone` and `boost_drop` have no row there (nothing frequent buzzes)
 * and are deliberately left out, unlike `SFX_FOR_EVENT` above, which covers all of them.
 */
const HAPTIC_FOR_EVENT: Partial<Record<GameEvent['type'], HapticId>> = {
  player_hit: 'life_lost',
  shield_break: 'shield_break',
  wave_start: 'wave_start',
  wave_cleared: 'wave_cleared',
  level_cleared: 'level_cleared',
  boss_spawn: 'boss_spawn',
  boss_phase: 'boss_phase',
  boss_dead: 'boss_dead',
  boss_teleport: 'boss_teleport',
  meteor_warning: 'meteor_warning',
  player_freeze: 'player_freeze',
  revived: 'revived',
  ...definedEntries(REEFS_HAPTIC),
};

/** `boss_ability`'s `name` -> haptic id (table D: Solar's meteor and Crimson's rage only — Emerald's regen, Azure's shield and Void's freeze have no haptic row). */
const BOSS_ABILITY_HAPTIC: Partial<Record<'regen' | 'shield' | 'meteor' | 'rage' | 'freeze', HapticId>> = {
  meteor: 'meteor_impact',
  rage: 'rage',
};

/** Every boost's own pickup stinger, played INSTEAD of the generic `boost_pickup` pop (owner decision 2026-09-16: one sound per pickup). RANDOM_CHAOS has no stinger of its own, so it maps onto the generic pop. */
const BOOST_STINGER: Record<BoostType, SfxId> = {
  RAPID_FIRE: 'boost_rapid_fire',
  ICE_FREEZE: 'boost_ice_freeze',
  HEALTH_BOOST: 'boost_health_boost',
  POINTS_FREEZE: 'boost_points_freeze',
  SHIELD_BARRIER: 'boost_shield_barrier',
  AUTO_TARGET: 'boost_auto_target',
  INVINCIBILITY: 'boost_invincibility',
  MULTI_SHOT: 'boost_multi_shot',
  SCORE_MULTIPLIER: 'boost_score_multiplier',
  WAVE_BLAST: 'boost_wave_blast',
  COIN_SHOWER: 'boost_coin_shower',
  GRAVITY_WELL: 'boost_gravity_well',
  PIERCING_BULLETS: 'boost_piercing_bullets',
  RANDOM_CHAOS: 'boost_pickup',
  SPEED_TAMER: 'boost_speed_tamer',
};

/** Crabs that have taken at least one hit and survived (hp below their kind's max: armored or elder, since every other type has 1 hp and dies on the first). Comparing this count frame to frame is how `crab_armored_tok` is detected without per-crab identity tracking. */
function damagedCrabCount(crabs: readonly Crab[]): number {
  let count = 0;
  for (const c of crabs) if (c.hp < CRAB_TYPES[c.type].hp) count += 1;
  return count;
}

/**
 * `Frame.boosts` (flat typeIndex/ticksLeft pairs) into HUD chips. `tamerStacks` is read from the
 * live `GameState` (not `Frame`, which never carries it: `activateBoost` pushes a `-1`-duration
 * `active` entry once and re-applies `applyEffect` on every later pickup, so SPEED_TAMER's
 * `ticksLeft` stays -1 forever and its real count lives only in `state.boosts.tamerStacks`).
 */
function boostsFromFrame(flat: number[], tamerStacks: number): HudBoost[] {
  const list: HudBoost[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    const type = BOOST_BY_INDEX[flat[i]!];
    if (type === undefined) continue;
    const ticksLeft = flat[i + 1]!;
    const seconds = ticksLeft < 0 ? -1 : Math.ceil(ticksLeft / 60);
    const count = type === 'SPEED_TAMER' ? tamerStacks : undefined;
    list.push({ type, name: titleCase(type), seconds, count });
  }
  return list;
}

/**
 * The HUD badge of a run played with a champion (`AZUL` in Azul's accent); none for the base Octopi.
 * It names the champion, so the ability in play stays visible when a skin hides the champion's art
 * (design doc §5).
 */
function octopiBadge(octopi: OctopiVariant): HudBadge | undefined {
  if (octopi === 'base') return undefined;
  return { text: VARIANT_NAMES[octopi].toUpperCase(), color: tintWithAlpha(ACCENT_BY_VARIANT[octopi], BADGE_ALPHA) };
}

function sameBoss(a: BossFrame | null, b: BossFrame | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return (
    a.kind === b.kind && a.hp === b.hp && a.maxHp === b.maxHp && a.phase === b.phase &&
    a.maxPhases === b.maxPhases && a.shieldHp === b.shieldHp && a.rage === b.rage && a.freeze === b.freeze
  );
}

function sameBoosts(a: HudBoost[], b: HudBoost[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.type !== b[i]!.type || a[i]!.seconds !== b[i]!.seconds || a[i]!.count !== b[i]!.count) return false;
  }
  return true;
}

interface Hud {
  score: number;
  lives: number;
  wave: number;
  kills: number;
  over: boolean;
  fps: number;
  boss: BossFrame | null;
  boosts: HudBoost[];
  shield: number;
  /** "WAVE N" / "LEVEL N · WAVE 1" / "PHASE N", shown centre-screen for `BANNER_FRAMES` frames. */
  banner: string | null;
  /** A pickup's name, shown under the HUD for `TOAST_FRAMES` frames. */
  toast: string | null;
}

const START_HUD: Hud = {
  score: 0, lives: 3, wave: 1, kills: 0, over: false, fps: 0,
  boss: null, boosts: [], shield: 0, banner: null, toast: null,
};

export interface RunOutcome {
  replay: Replay;
  score: number;
  wave: number;
  kills: number;
  ticks: number;
  /** false when the player quit before the game ended. */
  over: boolean;
  /** Octopi lives remaining when the run ended. */
  livesLeft: number;
  /** True when a campaign level's win condition was met (`state.cleared`). */
  cleared: boolean;
}

/** A run held at the loss of its last life (see `onDown`). The first of `revive`/`end` settles it; later calls do nothing. */
export interface DownedRun {
  /**
   * Revives Octopi through the core (`revive(state)`: `TIDE_REVIVE_LIVES` lives, 2 s invulnerability, enemy shots
   * cleared) and holds the run, clock stopped, under `RevivedSheet` until the player taps Resume.
   * True when the run can go on.
   */
  revive: () => boolean;
  /** Ends the run as if it had never been held: the outcome goes to `onRunOver` and the result shows. */
  end: () => void;
}

interface GameScreenProps {
  /** Leaves the game, from the result screen or the system back button. */
  onExit: () => void;
  /** Fixed seed for ranked runs. Practice makes a fresh seed for every run. */
  seed?: string;
  mode?: ReplayMode;
  /** HUD label, e.g. "DAILY". */
  hudMode?: string;
  /** Small line under the default result's button. */
  note?: string;
  /**
   * Campaign level config; used verbatim for `createGame` and the replay's level id/lives/octopi, and
   * its octopi is badged in the HUD. Daily/practice runs omit it (the base Octopi).
   */
  run?: RunConfig;
  /** Called once when the run ends (game over or quit), with the finished replay. */
  onRunOver?: (outcome: RunOutcome) => void;
  /** Replaces the default result view. `playAgain` restarts with the same props. */
  renderResult?: (outcome: RunOutcome, playAgain: () => void) => ReactNode;
  /**
   * The world behind the run (`over` once the result shows), e.g. a campaign reef. The field is then
   * drawn without its solid fill so the world shows through; without it, the generic backdrop and a
   * solid dark field are used.
   */
  backdrop?: (over: boolean) => ReactNode;
  /**
   * Called when Octopi loses its last life (not when crabs reach the reef line, a level clears or
   * the run is quit). Return true to hold the run: the clock stops as in a pause, nothing is reported,
   * and the host settles it through `down.revive()` or `down.end()`. While held, System Back goes to
   * the `overlay`'s own handler. Omit it, or return false, and the run ends as usual.
   */
  onDown?: (down: DownedRun) => boolean;
  /** Drawn over the HUD while the run is on screen, e.g. the host's sheet over a held run. */
  overlay?: ReactNode;
}

/** A run of the game. Without `seed` it is practice on a fresh seed. Without `run` it is the daily/practice mapping from `mode`. */
export function GameScreen({ onExit, seed, mode = REPLAY_MODE.practice, hudMode = 'PRACTICE', note = 'Practice · unranked', run, onRunOver, renderResult, backdrop, onDown, overlay }: GameScreenProps) {
  const { width, height } = useWindowDimensions();
  const layout = useMemo(() => fitField(width, height), [width, height]);
  const fieldRect = useMemo(() => ({ x: layout.offsetX, y: layout.offsetY, width: layout.width, height: layout.height }), [layout]);
  const sprites = useSprites();
  // Daily and practice runs play the base Octopi (their configs are base), so they show the skin or
  // Octopi's own colours; a champion shows its own art unless a skin is equipped (design doc §2).
  const octopi = run?.octopi ?? 'base';
  const look = useOctopiLook(octopi);
  // Only the equipped look's pair is decoded, and only for a drawn look (design doc §5), never any
  // other of the 21 pairs; the answer is always this look's own (`useArtPair`).
  const pairState = useArtPair(look);
  const pair = typeof pairState === 'object' ? pairState : null;
  // The look the run plays: while a drawn look's pair is 'loading', `usePreparedSprites` holds the
  // run on "Loading…"; a pair that cannot be read or decoded plays the base Octopi instead of
  // holding the run there for good.
  const runLook = pairState === 'failed' ? BASE_LOOK : look;
  const prepared = usePreparedSprites(sprites, layout, runLook, pair);
  const badge = useMemo(() => octopiBadge(octopi), [octopi]);
  const frame = useSharedValue<Frame>(EMPTY_FRAME);
  /** The last WAVE_BLAST of this run, for its shock rings (view only, never fed back to the sim). */
  const blast = useSharedValue<WaveBlast | null>(null);
  /** The reefs 6-10 one-shot visuals of this run (ruling R45): one struct, capped at `EFFECT_CAP`. */
  const effects = useSharedValue<Effects>({ entries: [] });
  const input = useRef<Input>(INITIAL_INPUT);
  const paused = useRef(false);
  const quit = useRef(false);
  const [hud, setHud] = useState<Hud>(START_HUD);
  const [showPause, setShowPause] = useState(false);
  /** True from a revive until the player taps Resume: the clock stays stopped under `RevivedSheet`. */
  const awaitingResume = useRef(false);
  const [showRevived, setShowRevived] = useState(false);
  const [runIndex, setRunIndex] = useState(0);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const onRunOverRef = useRef(onRunOver);
  onRunOverRef.current = onRunOver;
  const onDownRef = useRef(onDown);
  onDownRef.current = onDown;
  /** True while the run is held at its last life, waiting for the host's `revive`/`end`. */
  const held = useRef(false);
  // Read through a ref inside the loop below so a layout change (which rebuilds `prepared`, the
  // pre-scaled sprites) never appears in the run effect's deps and never calls `createGame` again.
  const preparedRef = useRef(prepared);
  preparedRef.current = prepared;

  // The result screen's Octopi, made now from the front pose this run already decoded (the drawn
  // look's own Front, else the base sprite), so the pose is there the moment the run ends instead
  // of decoding the asset again at that point. A pair is only used under its own look's key.
  useEffect(() => {
    if (runLook.kind === 'art') {
      if (pair !== null && pair.key === lookKey(runLook)) primeOctopiArt(pair.front, runLook, RESULT_POSE_SIZE);
    } else if (sprites !== null) {
      primeOctopiArt(sprites.octopi.front, runLook, RESULT_POSE_SIZE);
    }
  }, [sprites, pair, runLook]);

  useEffect(() => {
    // Practice seed: the app may use the clock; only the core must not.
    const runSeed = seed ?? `practice-${runIndex}-${Date.now()}`;
    const config = run ?? (mode === REPLAY_MODE.daily ? DAILY_RUN : PRACTICE_RUN);
    const state = createGame(runSeed, config);
    const recorder = new ReplayRecorder(runSeed, mode, run?.level?.id ?? 0, run?.lives ?? OCTOPI.lives, config.octopi);
    const stepper = new FixedStepper();
    input.current = INITIAL_INPUT;
    paused.current = false;
    quit.current = false;
    held.current = false;
    awaitingResume.current = false;
    blast.value = null;
    // The reefs 6-10 one-shot visuals (ruling R45): a plain JS array mirrored into `effects.value`
    // on every change, capped at `EFFECT_CAP` (drop the oldest), and the lanes still warned at the
    // end of the previous rendered frame — `lane_strike` carries no position of its own, so a lane
    // that vanishes from `state.lanes` between two frames is how a strike is found (see below).
    let effectEntries: EffectEntry[] = [];
    effects.value = { entries: effectEntries };
    const pushEffect = (kind: EffectEntry['kind'], tick: number, x: number, y: number, x2 = 0): void => {
      const entry: EffectEntry = { kind, tick, x, y, x2 };
      // Drop entries past their own kind's lifetime first (fix round: a frequent kind — the
      // Templar's/Huntsman's own `boss_block`, now dropped from this list entirely below — used to
      // sit at the cap permanently and evict a still-live entry of a different kind on every push),
      // then fall back to the oldest-first cap (ruling R49) only if the list is still full.
      const live = effectEntries.filter((e) => !effectExpired(e, tick));
      live.push(entry);
      effectEntries = live.length > EFFECT_CAP ? live.slice(live.length - EFFECT_CAP) : live;
      effects.value = { entries: effectEntries };
    };
    let prevLanes: number[] = [...state.lanes];
    let shown = START_HUD;
    let reported = false;
    // A held loss the host ended: reported on the next frame, never offered again.
    let downEnded = false;
    // False once this run's effect is cleaned up, so a `DownedRun` handed out for it does nothing.
    let live = true;
    let frames = 0;
    let fpsSince = performance.now();
    let fps = 0;
    let handle = 0;
    // 0 so the first frame's wave (always 1) is treated as a change and announced.
    let prevWave = 0;
    let bannerText: string | null = null;
    let bannerFrames = 0;
    let toastText: string | null = null;
    let toastFrames = 0;
    // Sound triggers read as state deltas (table A): the value at the end of the previous rendered
    // frame, compared against the value after this frame's ticks. Seeded from the just-created state
    // rather than 0/null so a run that somehow starts non-empty never fires a spurious first sound.
    let prevShotsLen = state.shots.length;
    // Enemy shots are told apart by bullet kind, counted per kind each frame (see `countKinds`).
    let kindCountsPrev = countKinds(state.enemyShots, new Map<BulletKind, number>());
    let kindCountsNow = new Map<BulletKind, number>();
    let prevKillsCount = state.kills;
    let prevBossHp: number | null = state.boss?.hp ?? null;
    let prevDamagedCount = damagedCrabCount(state.crabs);
    // Set once `game_over` has played for this run, so the single frame where the loop stops can
    // never be revisited and replay it.
    let gameOverPlayed = false;

    /** Offers this loss to the host; true when the host holds the run. */
    const offerDown = (): boolean => {
      let settled = false;
      const down: DownedRun = {
        revive: () => {
          if (settled || !live) return false;
          settled = true;
          revive(state);
          held.current = false;
          // A revive does not resume by itself: the run waits, clock stopped, under `RevivedSheet`
          // until the player taps Resume (owner ruling 2026-09-17). The pause sheet is dismissed
          // whatever `showPause` got set to (`pause()` refuses while held or waiting), so Resume
          // is the only way on.
          paused.current = true;
          awaitingResume.current = true;
          setShowPause(false);
          setShowRevived(true);
          return !state.over;
        },
        end: () => {
          if (settled || !live) return;
          settled = true;
          downEnded = true;
          held.current = false;
        },
      };
      const holding = onDownRef.current?.(down) === true;
      // A host that settled the loss inside `onDown` itself leaves nothing to hold.
      return holding && !settled;
    };

    const loop = () => {
      if (preparedRef.current === null) {
        // Sprites not ready yet: hold the clock (no ticks, no stepper.advance) so none are lost or
        // burst once they are (FixedStepper.advance only starts counting from its first call).
        handle = requestAnimationFrame(loop);
        return;
      }
      const now = performance.now();
      if (paused.current || held.current) {
        // Restart the clock on every paused or held frame, so resuming does not replay the wait.
        stepper.reset();
      } else {
        const ticks = stepper.advance(now);
        for (let i = 0; i < ticks && !state.over; i++) {
          recorder.record(state.tick + 1, input.current);
          step(state, input.current);
        }
      }
      // Wave/phase banner and pickup toast, from this frame's ticks; state.events is cleared below.
      if (state.wave !== prevWave) {
        bannerText = run?.level !== undefined && state.wave === 1 && prevWave === 0
          ? `LEVEL ${run.level.id} · WAVE 1`
          : `WAVE ${state.wave}`;
        bannerFrames = BANNER_FRAMES;
        prevWave = state.wave;
      }
      // Sounds and haptics this frame, collected here and played once each after the loop below
      // (never inside the tick loop above, and never more than once per id per frame) — design doc
      // sections F (sound) and D (haptics).
      const sounds: SfxId[] = [];
      const haptics: HapticId[] = [];
      // Storm Tyrant's strikes (spec §5.2): `lane_strike` is a bare `{tick, type}` — no lane of its
      // own — so the struck lane is found the only other way available, by diffing `state.lanes`
      // against what it held at the end of the previous rendered frame: a lane leaves that array only
      // by striking (`tickThroughTransition`, `core/src/sim/bosses/tyrant.ts`), never any other way.
      // The diff gives the *lane*; the matching `lane_strike` event below (consumed in the same order
      // lanes struck, `tickThroughTransition`'s own loop order) gives the *tick* — fix round 1: a
      // catch-up batch that runs several ticks in one rendered frame must not stamp an early strike
      // with the batch's own final `state.tick`, or it reads as already aged the first time it draws.
      const struckLanes: number[] = [];
      if (prevLanes.length > 0) {
        const stillWarned = new Set<number>();
        for (let i = 0; i < state.lanes.length; i += LANE_STRIDE) stillWarned.add(state.lanes[i]!);
        for (let i = 0; i < prevLanes.length; i += LANE_STRIDE) {
          const lane = prevLanes[i]!;
          if (!stillWarned.has(lane)) struckLanes.push(lane);
        }
      }
      prevLanes = state.lanes.slice();
      let struckLaneIndex = 0;
      for (const ev of state.events) {
        if (ev.type === 'boss_phase') {
          bannerText = `PHASE ${state.boss?.phase ?? 0}`;
          bannerFrames = BANNER_FRAMES;
        } else if (ev.type === 'boost_pickup') {
          toastText = titleCase(ev.boost);
          toastFrames = TOAST_FRAMES;
          // Only emitted when the blast actually fired (with no crabs the drop is not consumed).
          if (ev.boost === 'WAVE_BLAST') blast.value = { tick: ev.tick, x: state.octopi.x, y: state.octopi.y };
        } else if (ev.type === 'surge') {
          // Coraluna's Surge is a free WAVE_BLAST (design doc §1): the same shock rings and toast as
          // a picked-up one, at the position of Octopi the core recorded with the event.
          toastText = 'Surge';
          toastFrames = TOAST_FRAMES;
          blast.value = { tick: ev.tick, x: ev.x, y: ev.y };
        }
        // The reefs 6-10 one-shot visuals (ruling R45, R60-R62): every entry is stamped with the
        // event's own `ev.tick`, never `state.tick` — a catch-up batch's later ticks must not age an
        // earlier one's effect before it is ever drawn. `crab_shield_break`/`bubble_pop`/
        // `charge_burst`/`crab_rallied` now carry their own `x`/`y` from the core (ruling R60, fix
        // round 1) — no more scanning `state.crabs` or falling back to Octopi's position.
        // `crystal_shatter` carries no position (Shatter is boss-wide, not per-crystal): one entry,
        // position unused, drives the 120-tick warning tint on every crystal drawn (ruling R61).
        // `boss_windup` fires for two different bosses under one name: kind 6 (Verdant Templar) draws
        // the firewall gap marker from `gapSlot`; kind 8 (Gold Corsair, ruling R62) draws a flickering
        // spike-flash telegraph instead, so both are captured, distinguished by `f.boss.kind` at draw
        // time (`draw.ts`).
        if (ev.type === 'crab_shield_break' || ev.type === 'bubble_pop' || ev.type === 'charge_burst' || ev.type === 'crab_rallied') {
          pushEffect(ev.type, ev.tick, ev.x, ev.y);
        } else if (ev.type === 'formation_rage') {
          pushEffect('formation_rage', ev.tick, state.octopi.x, state.octopi.y);
        } else if (ev.type === 'crystal_shatter') {
          pushEffect('crystal_shatter', ev.tick, 0, 0);
        } else if (ev.type === 'obstacle_destroyed') {
          pushEffect('obstacle_destroyed', ev.tick, ev.x, ev.y);
        } else if (ev.type === 'boss_windup') {
          if (state.boss?.kind === 6) pushEffect('boss_windup', ev.tick, state.boss.gapSlot, 0);
          else if (state.boss?.kind === 8) pushEffect('boss_windup', ev.tick, 0, 0);
        } else if (ev.type === 'boss_reflect') {
          if (state.boss) pushEffect('boss_reflect', ev.tick, state.boss.x, state.boss.y);
        } else if (ev.type === 'boss_clone') {
          pushEffect('boss_clone', ev.tick, ev.leftX, 0, ev.rightX);
        } else if (ev.type === 'cold_snap') {
          pushEffect('cold_snap', ev.tick, state.octopi.x, state.octopi.y);
        } else if (ev.type === 'revived') {
          // Owner's pick 2026-09-22 (`magicRings.ts`): the Tide's return, rings around Octopi's own
          // position at the moment `revive(state)` recorded the event (`core/src/sim/revive.ts`).
          pushEffect('revive_rings', ev.tick, state.octopi.x, state.octopi.y);
        } else if (ev.type === 'boss_phase') {
          // Same pick: rings around the boss on a phase change, at its position right now — a phase
          // change never kills the boss, so `state.boss` is always set here.
          if (state.boss) pushEffect('phase_rings', ev.tick, state.boss.x, state.boss.y);
        } else if (ev.type === 'lane_strike') {
          const lane = struckLanes[struckLaneIndex];
          struckLaneIndex += 1;
          if (lane !== undefined) pushEffect('lane_strike', ev.tick, lane, 0);
        }
        if (ev.type === 'boss_ability') {
          sounds.push(BOSS_ABILITY_SFX[ev.name]);
          const abilityHaptic = BOSS_ABILITY_HAPTIC[ev.name];
          if (abilityHaptic !== undefined) haptics.push(abilityHaptic);
        } else if (ev.type === 'boost_pickup') {
          // One sound per pickup: the boost's own stinger, or the generic pop for a boost without one.
          sounds.push(BOOST_STINGER[ev.boost]);
          haptics.push('boost_pickup');
        } else {
          const sound = SFX_FOR_EVENT[ev.type];
          if (sound !== undefined) sounds.push(sound);
          const haptic = HAPTIC_FOR_EVENT[ev.type];
          if (haptic !== undefined) haptics.push(haptic);
        }
      }
      state.events.length = 0;
      // State deltas (table A): read once per rendered frame, across however many ticks it just ran.
      if (state.shots.length > prevShotsLen) {
        const multiShot = state.boosts.active.some((b) => b.type === 'MULTI_SHOT');
        sounds.push(multiShot ? 'octopi_multishot' : 'octopi_shot');
      }
      // New enemy shots, counted per bullet kind: a boss fight removes and adds bullets every frame,
      // so neither the array's length nor its tail says what was just fired. A kind whose count rose
      // was fired this frame; crab kinds cue `crab_shot`, every other kind is a boss's (never more
      // than one of each per frame).
      countKinds(state.enemyShots, kindCountsNow);
      let sawCrabShot = false;
      let sawBossShot = false;
      for (const [kind, n] of kindCountsNow) {
        if (n > (kindCountsPrev.get(kind) ?? 0)) {
          if (CRAB_SHOT_KINDS.has(kind)) sawCrabShot = true;
          else sawBossShot = true;
        }
      }
      if (sawCrabShot) sounds.push('crab_shot');
      if (sawBossShot) sounds.push('boss_shot');
      const swapCounts = kindCountsPrev;
      kindCountsPrev = kindCountsNow;
      kindCountsNow = swapCounts;
      if (state.kills > prevKillsCount) sounds.push('crab_hit');
      const bossHpNow = state.boss?.hp ?? null;
      if (prevBossHp !== null && bossHpNow !== null && bossHpNow < prevBossHp) sounds.push('boss_hit');
      const damagedCountNow = damagedCrabCount(state.crabs);
      if (damagedCountNow > prevDamagedCount) sounds.push('crab_armored_tok');
      prevShotsLen = state.shots.length;
      prevKillsCount = state.kills;
      prevBossHp = bossHpNow;
      prevDamagedCount = damagedCountNow;
      if (bannerFrames > 0) {
        bannerFrames -= 1;
        if (bannerFrames === 0) bannerText = null;
      }
      if (toastFrames > 0) {
        toastFrames -= 1;
        if (toastFrames === 0) toastText = null;
      }
      const f = snapshot(state);
      frame.value = f;
      frames += 1;
      if (now - fpsSince >= 1000) {
        fps = Math.round((frames * 1000) / (now - fpsSince));
        frames = 0;
        fpsSince = now;
      }
      // The last life lost (not a clear, a quit or crabs on the reef line): the host may hold the run.
      if (
        state.over && state.octopi.lives === 0 && !state.cleared && !quit.current &&
        !held.current && !downEnded && !reported
      ) {
        held.current = offerDown();
      }
      const over = (state.over && !held.current) || state.cleared || quit.current;
      // The run truly ended with no Tide offered — not a clear (its own fanfare) and not a quit
      // (the player's own choice). `over` already folds in whether the host is holding for a
      // revive, and once it is true this loop never runs again for this effect, so this can only
      // fire once; `gameOverPlayed` is just belt-and-suspenders against a future refactor.
      if (over && !state.cleared && !quit.current && !gameOverPlayed) {
        gameOverPlayed = true;
        sounds.push('game_over');
        haptics.push('run_over');
      }
      const next: Hud = {
        score: state.score, lives: state.octopi.lives, wave: state.wave, kills: state.kills, over, fps,
        boss: f.boss, boosts: boostsFromFrame(f.boosts, state.boosts.tamerStacks), shield: f.shield, banner: bannerText, toast: toastText,
      };
      if (
        next.score !== shown.score || next.lives !== shown.lives || next.wave !== shown.wave ||
        next.kills !== shown.kills || next.over !== shown.over || next.fps !== shown.fps ||
        next.shield !== shown.shield || next.banner !== shown.banner || next.toast !== shown.toast ||
        !sameBoss(next.boss, shown.boss) || !sameBoosts(next.boosts, shown.boosts)
      ) {
        shown = next;
        setHud(next);
      }
      if (over && !reported) {
        reported = true;
        const result: RunOutcome = {
          replay: recorder.finish(state.tick), score: state.score, wave: state.wave, kills: state.kills, ticks: state.tick,
          over: state.over, livesLeft: state.octopi.lives, cleared: state.cleared,
        };
        setOutcome(result);
        onRunOverRef.current?.(result);
      }
      // Played after the step loop, never inside it; de-duped so an id fired from more than one
      // source this frame (unlikely, but e.g. `state.events` holding two of the same type across a
      // multi-tick frame) still plays once.
      if (sounds.length > 0) {
        for (const id of new Set(sounds)) playSfx(id);
      }
      if (haptics.length > 0) {
        for (const id of new Set(haptics)) HAPTIC_ACTIONS[id]();
      }
      if (!over) handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => {
      live = false;
      held.current = false;
      cancelAnimationFrame(handle);
    };
  }, [runIndex, frame, blast, effects, seed, mode, run]);

  const solidField = backdrop === undefined;
  const recorder = useMemo(() => Skia.PictureRecorder(), []);
  const paint = useMemo(() => Skia.Paint(), []);
  const picture = useDerivedValue(() => {
    'worklet';
    if (prepared === null) {
      recorder.beginRecording(Skia.XYWHRect(0, 0, width, height));
      return recorder.finishRecordingAsPicture();
    }
    return drawFrame(recorder, paint, frame.value, layout, width, height, prepared, fieldRect, blast.value, effects.value, solidField);
  });

  const onTouch = (e: GestureResponderEvent) => {
    input.current = touchToInput(layout, e.nativeEvent.pageX, e.nativeEvent.pageY, FINGER_LIFT);
  };

  const pause = () => {
    // A tap in the single frame between the loss and the host's overlay mounting must not pause: the
    // run would then stay paused after a revive, with nothing left to show a Resume button.
    if (held.current || awaitingResume.current) return;
    paused.current = true;
    setShowPause(true);
  };
  const resume = () => {
    paused.current = false;
    setShowPause(false);
  };
  /** The player is ready after a revive: the clock starts again. */
  const resumeRevived = () => {
    awaitingResume.current = false;
    paused.current = false;
    setShowRevived(false);
  };
  const quitRun = () => {
    quit.current = true;
    paused.current = false;
    setShowPause(false);
  };
  const playAgain = () => {
    setHud(START_HUD);
    setOutcome(null);
    setRunIndex((r) => r + 1);
  };

  // System back: pauses a run, closes the pause sheet, and leaves from the result screen. A held run
  // passes it on to the handler of the host's overlay (mounted as a child, so registered just under
  // this one); until that overlay is on screen, it is swallowed.
  const hasOverlay = overlay !== undefined && overlay !== null && overlay !== false;
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (held.current) return !hasOverlay;
      if (hud.over) onExit();
      else if (showRevived) resumeRevived();
      else if (showPause) resume();
      else pause();
      return true;
    });
    return () => sub.remove();
  });

  return (
    <View style={styles.root}>
      {backdrop !== undefined ? backdrop(hud.over) : <Backdrop variant={hud.over ? 'menu' : 'play'} />}
      {prepared === null ? (
        <View style={styles.loading} pointerEvents="none">
          <Txt variant="headline">Loading…</Txt>
        </View>
      ) : hud.over && outcome ? (
        // The result pose (`ActiveOctopi` in `ResultView`) shows the look this run played, through
        // `RunLookContext` (the base Octopi when the drawn pair failed), not the loadout's.
        <RunOctopiContext.Provider value={octopi}>
          <RunLookContext.Provider value={runLook}>
            {renderResult ? renderResult(outcome, playAgain) : (
              <ResultView
                title="Run over"
                score={outcome.score}
                stats={[
                  { label: 'Crabs', value: formatInt(outcome.kills) },
                  { label: 'Wave', value: String(outcome.wave) },
                ]}
                note={note}
                onPlayAgain={playAgain}
                onBack={onExit}
              />
            )}
          </RunLookContext.Provider>
        </RunOctopiContext.Provider>
      ) : (
        <>
          <Canvas style={styles.fill}>
            <Picture picture={picture} />
          </Canvas>
          <View
            style={styles.fill}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={onTouch}
            onResponderMove={onTouch}
          />
          <GameHud
            mode={hudMode}
            badge={badge}
            score={hud.score}
            lives={hud.lives}
            wave={hud.wave}
            waves={run?.level?.waves}
            boss={hud.boss}
            boosts={hud.boosts}
            shield={hud.shield}
            toast={hud.toast}
            hint={HINT}
            onPause={pause}
          />
          {hud.banner !== null && (
            <Text style={styles.banner} pointerEvents="none">
              {hud.banner}
            </Text>
          )}
          <Text style={styles.fps} pointerEvents="none">
            {hud.fps} FPS
          </Text>
          {showPause && <PauseSheet onResume={resume} onQuit={quitRun} />}
          {showRevived && <RevivedSheet lives={TIDE_REVIVE_LIVES} onResume={resumeRevived} />}
          {overlay}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.app },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  loading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  banner: {
    position: 'absolute', top: '40%', left: 0, right: 0, textAlign: 'center',
    fontFamily: FONTS.medium, fontSize: 22, letterSpacing: 1.2, color: COLORS.text,
  },
  fps: { position: 'absolute', left: 16, bottom: 64, fontFamily: FONTS.mono, fontSize: 10, color: COLORS.textTertiary },
});
