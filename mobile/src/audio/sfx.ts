import { Asset } from 'expo-asset';
import ReefSfx from '../../modules/reef-sfx';

/**
 * One-shot sound catalogue (design doc `2026-09-16-sound-and-haptics.md`, tables A and C). Every id
 * is a file name under `assets/sfx/`; most are still generated placeholders (see
 * `assets/sfx/README.md`), but the owner's own recordings have started landing under the same ids -
 * a drop-in replacement needs no code change beyond what this file already does for `player_hit`'s
 * variants and `octopi_shot`'s MULTI_SHOT alternate. `ambience_reef` is a loop, not a one-shot, so it
 * lives in `music.ts` instead of here.
 */
const SFX_ASSETS = {
  boost_auto_target: require('../../assets/sfx/boost_auto_target.m4a'),
  boost_coin_shower: require('../../assets/sfx/boost_coin_shower.m4a'),
  boost_drop: require('../../assets/sfx/boost_drop.wav'),
  boost_expire: require('../../assets/sfx/boost_expire.wav'),
  boost_gravity_well: require('../../assets/sfx/boost_gravity_well.m4a'),
  boost_health_boost: require('../../assets/sfx/boost_health_boost.m4a'),
  boost_ice_freeze: require('../../assets/sfx/boost_ice_freeze.wav'),
  boost_invincibility: require('../../assets/sfx/boost_invincibility.m4a'),
  boost_multi_shot: require('../../assets/sfx/boost_multi_shot.m4a'),
  boost_pickup: require('../../assets/sfx/boost_pickup.m4a'),
  boost_piercing_bullets: require('../../assets/sfx/boost_piercing_bullets.m4a'),
  boost_points_freeze: require('../../assets/sfx/boost_points_freeze.m4a'),
  boost_rapid_fire: require('../../assets/sfx/boost_rapid_fire.m4a'),
  boost_score_multiplier: require('../../assets/sfx/boost_score_multiplier.m4a'),
  boost_shield_barrier: require('../../assets/sfx/boost_shield_barrier.m4a'),
  boost_speed_tamer: require('../../assets/sfx/boost_speed_tamer.m4a'),
  boost_wave_blast: require('../../assets/sfx/boost_wave_blast.m4a'),
  boss_clone: require('../../assets/sfx/boss_clone.wav'),
  boss_dead: require('../../assets/sfx/boss_dead.wav'),
  boss_freeze: require('../../assets/sfx/boss_freeze.wav'),
  boss_hit: require('../../assets/sfx/boss_hit.m4a'),
  boss_phase: require('../../assets/sfx/boss_phase.wav'),
  boss_rage: require('../../assets/sfx/boss_rage.wav'),
  boss_regen: require('../../assets/sfx/boss_regen.wav'),
  boss_shield: require('../../assets/sfx/boss_shield.wav'),
  // A boss's own shot, as opposed to `crab_shot`: the frame loop tells them apart by bullet kind
  // (`GameScreen.tsx`'s `CRAB_SHOT_KINDS`, mirroring core's own `crabs.ts`).
  boss_shot: require('../../assets/sfx/boss_shot.m4a'),
  boss_spawn: require('../../assets/sfx/boss_spawn.wav'),
  boss_teleport: require('../../assets/sfx/boss_teleport.wav'),
  crab_armored_tok: require('../../assets/sfx/crab_armored_tok.wav'),
  crab_hit: require('../../assets/sfx/crab_hit.m4a'),
  crab_shot: require('../../assets/sfx/crab_shot.wav'),
  game_over: require('../../assets/sfx/game_over.wav'),
  level_cleared: require('../../assets/sfx/level_cleared.wav'),
  meteor_impact: require('../../assets/sfx/meteor_impact.wav'),
  meteor_warning: require('../../assets/sfx/meteor_warning.wav'),
  node_tap: require('../../assets/sfx/node_tap.wav'),
  // Played instead of `octopi_shot` while MULTI_SHOT is active (`GameScreen.tsx`'s frame loop).
  octopi_multishot: require('../../assets/sfx/octopi_multishot.m4a'),
  octopi_shot: require('../../assets/sfx/octopi_shot.m4a'),
  player_freeze: require('../../assets/sfx/player_freeze.wav'),
  // `player_hit` itself is not a loadable asset: it is a public id resolved to one of these four
  // recordings at random by `VARIANTS` below, so the trigger code can keep calling `playSfx('player_hit')`.
  player_hit_1: require('../../assets/sfx/player_hit_1.m4a'),
  player_hit_2: require('../../assets/sfx/player_hit_2.m4a'),
  player_hit_3: require('../../assets/sfx/player_hit_3.m4a'),
  player_hit_4: require('../../assets/sfx/player_hit_4.m4a'),
  purchase_done: require('../../assets/sfx/purchase_done.wav'),
  record_saved: require('../../assets/sfx/record_saved.wav'),
  reef_unlocked: require('../../assets/sfx/reef_unlocked.wav'),
  revived: require('../../assets/sfx/revived.wav'),
  shield_break: require('../../assets/sfx/shield_break.wav'),
  splash: require('../../assets/sfx/splash.wav'),
  ticket_bought: require('../../assets/sfx/ticket_bought.wav'),
  tx_confirmed: require('../../assets/sfx/tx_confirmed.wav'),
  tx_sent: require('../../assets/sfx/tx_sent.wav'),
  ui_back: require('../../assets/sfx/ui_back.wav'),
  ui_error: require('../../assets/sfx/ui_error.wav'),
  // The sheet sound ships silent until a real recording exists: only that placeholder scraped (the
  // owner, 2026-09-16), while the tap and back placeholders stay. To enable it, drop the recording
  // under `assets/sfx/ui_sheet.wav` and replace `null` with `require('../../assets/sfx/ui_sheet.wav')`.
  ui_sheet: null as number | null,
  ui_tap: require('../../assets/sfx/ui_tap.wav'),
  wallet_connected: require('../../assets/sfx/wallet_connected.wav'),
  wave_cleared: require('../../assets/sfx/wave_cleared.wav'),
  wave_start: require('../../assets/sfx/wave_start.wav'),
} as const;

/**
 * `player_hit` is a public id with no asset of its own (see the comment on the four `player_hit_*`
 * entries above): it only ever resolves through `VARIANTS`, but the trigger code
 * (`GameScreen.tsx`'s `SFX_FOR_EVENT`) still calls `playSfx('player_hit')`, so it stays part of the
 * type even though it is never a key of `SFX_ASSETS`.
 */
export type SfxId = keyof typeof SFX_ASSETS | 'player_hit';

/** A public id with no asset of its own, resolved to one of several real recordings at random on every play. */
const VARIANTS: Partial<Record<SfxId, SfxId[]>> = {
  player_hit: ['player_hit_1', 'player_hit_2', 'player_hit_3', 'player_hit_4'],
};

/** Frequent, quiet by design (doc: "almost a whisper") - ordinary hits and the drop bloop; `octopi_shot`, `crab_hit` and `boss_hit` now carry their own volumes below instead of this shared one. */
const QUIET_IDS = new Set<SfxId>(['crab_shot', 'crab_armored_tok', 'boost_drop']);
/** Interface feedback: present but never louder than the game it sits over. */
const SOFT_IDS = new Set<SfxId>(['ui_tap', 'ui_back', 'ui_sheet', 'ui_error', 'node_tap']);

const VOLUME_QUIET = 0.35;
const VOLUME_SOFT = 0.55;
/** Big moments (a life lost, a boss beat, a fanfare): full but short of 1.0, so a few overlapping one-shots never clip together. */
const VOLUME_FULL = 0.85;

/**
 * The owner's recordings play at the loudness of the owner's earlier version of the game
 * (2026-09-16): its sound manager multiplied the volume each call passed (shots 0.3, MULTI_SHOT
 * 0.6, hurt 0.6, crab death 0.3, boss hit/shot 1.0, every boost 0.7) by a per-sound level
 * (`soundVolumes`), and these are the products, rounded to three places. `LEGACY_GAIN` scales all
 * of them together should the phone's speaker want the whole set louder or quieter.
 */
const LEGACY_GAIN = 1;
const VOLUME_OVERRIDE: Partial<Record<SfxId, number>> = {
  octopi_shot: 0.084 * LEGACY_GAIN, // 0.3 × 0.28
  octopi_multishot: 0.108 * LEGACY_GAIN, // 0.6 × 0.18
  crab_hit: 0.15 * LEGACY_GAIN, // 0.3 × 0.5
  boss_hit: 0.25 * LEGACY_GAIN, // 1.0 × 0.25
  boss_shot: 0.28 * LEGACY_GAIN, // 1.0 × 0.28
  player_hit_1: 0.252 * LEGACY_GAIN, // 0.6 × 0.42
  player_hit_2: 0.252 * LEGACY_GAIN,
  player_hit_3: 0.252 * LEGACY_GAIN,
  player_hit_4: 0.252 * LEGACY_GAIN,
  boost_pickup: 0.28 * LEGACY_GAIN, // 0.7 × 0.4 (the generic pickup)
  boost_coin_shower: 0.266 * LEGACY_GAIN,
  boost_auto_target: 0.196 * LEGACY_GAIN,
  boost_gravity_well: 0.245 * LEGACY_GAIN,
  boost_health_boost: 0.266 * LEGACY_GAIN,
  boost_ice_freeze: 0.28 * LEGACY_GAIN,
  boost_invincibility: 0.224 * LEGACY_GAIN,
  boost_multi_shot: 0.28 * LEGACY_GAIN,
  boost_piercing_bullets: 0.28 * LEGACY_GAIN,
  boost_points_freeze: 0.238 * LEGACY_GAIN,
  boost_rapid_fire: 0.315 * LEGACY_GAIN,
  boost_score_multiplier: 0.238 * LEGACY_GAIN,
  boost_shield_barrier: 0.266 * LEGACY_GAIN,
  boost_speed_tamer: 0.245 * LEGACY_GAIN,
  boost_wave_blast: 0.35 * LEGACY_GAIN,
};

function volumeOf(id: SfxId): number {
  const override = VOLUME_OVERRIDE[id];
  if (override !== undefined) return override;
  if (QUIET_IDS.has(id)) return VOLUME_QUIET;
  if (SOFT_IDS.has(id)) return VOLUME_SOFT;
  return VOLUME_FULL;
}

/**
 * Random pitch within ±`width` (doc: "so they never machine-gun"), `width` a per-id table defaulting
 * to 0.05 (±5 %). `octopi_multishot` gets a one-sided range instead (1.0-1.2, never slower than the
 * plain shot it replaces), so it is special-cased rather than added to the table. The sound pool
 * takes the rate as an argument of the play itself, so varying it is free: there is no player whose
 * speed has to be changed first, and a rate off 1 shifts the pitch along with the speed by nature.
 */
const RATE_JITTER_WIDTH: Partial<Record<SfxId, number>> = {
  octopi_shot: 0.1, // 0.9-1.1
};
const DEFAULT_RATE_JITTER_WIDTH = 0.05;

function jitteredRate(id: SfxId): number {
  if (id === 'octopi_multishot') return 1 + Math.random() * 0.2; // 1.0-1.2, one-sided
  const width = RATE_JITTER_WIDTH[id] ?? DEFAULT_RATE_JITTER_WIDTH;
  return 1 + (Math.random() * 2 - 1) * width;
}

/**
 * The shortest gap between two plays of the same frequent id, in ms. Rapid fire into a wall of
 * crabs asks for the same sound dozens of times a second, and past roughly this rate the ear hears
 * one continuous noise rather than separate shots - the extra copies only crowd the pool's limited
 * streams out of the distinct sounds that do carry meaning. Within the gap they are dropped.
 */
const MIN_GAP_MS: Partial<Record<SfxId, number>> = {
  octopi_shot: 90,
  // Same gap as `octopi_shot`: it replaces that sound while MULTI_SHOT is active, at the same cadence.
  octopi_multishot: 90,
  crab_shot: 90,
  crab_hit: 80,
  crab_armored_tok: 90,
  boss_hit: 100,
};
const lastPlayedAt = new Map<SfxId, number>();

/** A sound the pool has decoded and can sound on demand. */
interface Loaded {
  /** The pool's own id for the decoded sound. */
  soundId: number;
  /** Resolved once at load, so a play never has to work its volume class out again. */
  volume: number;
}

const loaded = new Map<SfxId, Loaded>();
/**
 * Every id whose sound could not be decoded or sounded (a missing/corrupt asset): it has warned
 * once, and every later call for it is silently a no-op.
 */
const failed = new Set<SfxId>();

let soundsEnabled = true;
let preloading: Promise<void> | null = null;

/**
 * Decodes every supplied sound into the pool, once. Call it after the first render rather than
 * before it: the decoding runs off the main thread, so it costs the splash nothing, and until a
 * sound is decoded asking for it is silently a no-op. `player_hit` has no entry of its own in
 * `SFX_ASSETS` (see `VARIANTS`), so nothing extra needs preloading for it beyond its four variants.
 */
export function preloadSfx(): Promise<void> {
  if (preloading !== null) return preloading;
  const pool = ReefSfx;
  if (pool === null) {
    // No sound pool here: the reef simply makes no noise.
    preloading = Promise.resolve();
    return preloading;
  }
  const entries = Object.entries(SFX_ASSETS) as [SfxId, number | null][];
  preloading = Promise.all(
    entries.map(async ([id, asset]) => {
      // A null entry is a sound with no recording yet: silent on purpose, not a failure.
      if (asset === null) return;
      try {
        const bundled = Asset.fromModule(asset);
        // A bundled sound has no file of its own until this runs: it copies the sound out of the
        // app and into the cache directory, and only then is `localUri` filled in.
        await bundled.downloadAsync();
        const uri = bundled.localUri ?? bundled.uri;
        // The pool reads a plain path, not a URI.
        const path = uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
        loaded.set(id, { soundId: await pool.load(id, path), volume: volumeOf(id) });
      } catch (error) {
        failed.add(id);
        console.warn(`[sfx] could not load "${id}"`, error instanceof Error ? error.message : error);
      }
    })
  ).then(() => undefined);
  return preloading;
}

/**
 * Sounds `id`. Never throws: an id with no recording, one still decoding, or one that failed logs
 * at most once and is silently a no-op afterwards. Safe to call every frame — a play is a single
 * call into the sound pool, which hands an already-decoded sound straight to the mixer.
 *
 * An id listed in `VARIANTS` (only `player_hit` today) is resolved to one of its recordings at
 * random on every call; the gap check and de-dup below key on the public `id` rather than the
 * resolved variant, so rapid hits are throttled as one stream regardless of which recording played.
 */
export function playSfx(id: SfxId): void {
  if (!soundsEnabled) return;
  const variants = VARIANTS[id];
  const resolvedId = variants !== undefined ? variants[Math.floor(Math.random() * variants.length)]! : id;
  if (failed.has(resolvedId)) return;
  const sound = loaded.get(resolvedId);
  if (sound === undefined) return;
  const gap = MIN_GAP_MS[id];
  if (gap !== undefined) {
    const now = Date.now();
    if (now - (lastPlayedAt.get(id) ?? 0) < gap) return;
    lastPlayedAt.set(id, now);
  }
  try {
    ReefSfx?.play(sound.soundId, sound.volume, jitteredRate(resolvedId));
  } catch (error) {
    loaded.delete(resolvedId);
    failed.add(resolvedId);
    console.warn(`[sfx] could not play "${resolvedId}"`, error instanceof Error ? error.message : error);
  }
}

/** The Sounds switch. Turning it off immediately silences anything currently sounding. */
export function setSoundsEnabled(enabled: boolean): void {
  soundsEnabled = enabled;
  if (enabled) return;
  try {
    ReefSfx?.stopAll();
  } catch {
    // No pool to silence.
  }
}
