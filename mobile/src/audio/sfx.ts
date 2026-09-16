import { Asset } from 'expo-asset';
import ReefSfx from '../../modules/reef-sfx';

/**
 * One-shot sound catalogue (design doc `2026-09-16-sound-and-haptics.md`, tables A and C). Every id
 * is a file name under `assets/sfx/`; today every one of them is a generated placeholder (see
 * `assets/sfx/README.md`) to be swapped for the real recording under the same name later.
 * `ambience_reef` is a loop, not a one-shot, so it lives in `music.ts` instead of here.
 */
const SFX_ASSETS = {
  boost_blast: require('../../assets/sfx/boost_blast.wav'),
  boost_coins: require('../../assets/sfx/boost_coins.wav'),
  boost_drop: require('../../assets/sfx/boost_drop.wav'),
  boost_expire: require('../../assets/sfx/boost_expire.wav'),
  boost_ice: require('../../assets/sfx/boost_ice.wav'),
  boost_invincibility: require('../../assets/sfx/boost_invincibility.wav'),
  boost_pickup: require('../../assets/sfx/boost_pickup.wav'),
  boss_clone: require('../../assets/sfx/boss_clone.wav'),
  boss_dead: require('../../assets/sfx/boss_dead.wav'),
  boss_freeze: require('../../assets/sfx/boss_freeze.wav'),
  boss_hit: require('../../assets/sfx/boss_hit.wav'),
  boss_phase: require('../../assets/sfx/boss_phase.wav'),
  boss_rage: require('../../assets/sfx/boss_rage.wav'),
  boss_regen: require('../../assets/sfx/boss_regen.wav'),
  boss_shield: require('../../assets/sfx/boss_shield.wav'),
  boss_spawn: require('../../assets/sfx/boss_spawn.wav'),
  boss_teleport: require('../../assets/sfx/boss_teleport.wav'),
  crab_armored_tok: require('../../assets/sfx/crab_armored_tok.wav'),
  crab_hit: require('../../assets/sfx/crab_hit.wav'),
  crab_shot: require('../../assets/sfx/crab_shot.wav'),
  game_over: require('../../assets/sfx/game_over.wav'),
  level_cleared: require('../../assets/sfx/level_cleared.wav'),
  meteor_impact: require('../../assets/sfx/meteor_impact.wav'),
  meteor_warning: require('../../assets/sfx/meteor_warning.wav'),
  node_tap: require('../../assets/sfx/node_tap.wav'),
  octopi_shot: require('../../assets/sfx/octopi_shot.wav'),
  player_freeze: require('../../assets/sfx/player_freeze.wav'),
  player_hit: require('../../assets/sfx/player_hit.wav'),
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

export type SfxId = keyof typeof SFX_ASSETS;

/** Frequent, quiet by design (doc: "almost a whisper") - shots, ordinary hits, the drop bloop. */
const QUIET_IDS = new Set<SfxId>(['octopi_shot', 'crab_shot', 'crab_hit', 'crab_armored_tok', 'boss_hit', 'boost_drop']);
/** Interface feedback: present but never louder than the game it sits over. */
const SOFT_IDS = new Set<SfxId>(['ui_tap', 'ui_back', 'ui_sheet', 'ui_error', 'node_tap']);

const VOLUME_QUIET = 0.35;
const VOLUME_SOFT = 0.55;
/** Big moments (a life lost, a boss beat, a fanfare): full but short of 1.0, so a few overlapping one-shots never clip together. */
const VOLUME_FULL = 0.85;

function volumeOf(id: SfxId): number {
  if (QUIET_IDS.has(id)) return VOLUME_QUIET;
  if (SOFT_IDS.has(id)) return VOLUME_SOFT;
  return VOLUME_FULL;
}

/**
 * Random pitch within ±5 % (doc: "so they never machine-gun"). The sound pool takes the rate as an
 * argument of the play itself, so varying it is free: there is no player whose speed has to be
 * changed first, and a rate off 1 shifts the pitch along with the speed by nature.
 */
const RATE_JITTER = 0.05;
function jitteredRate(): number {
  return 1 + (Math.random() * 2 - 1) * RATE_JITTER;
}

/**
 * The shortest gap between two plays of the same frequent id, in ms. Rapid fire into a wall of
 * crabs asks for the same sound dozens of times a second, and past roughly this rate the ear hears
 * one continuous noise rather than separate shots - the extra copies only crowd the pool's limited
 * streams out of the distinct sounds that do carry meaning. Within the gap they are dropped.
 */
const MIN_GAP_MS: Partial<Record<SfxId, number>> = {
  octopi_shot: 90,
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
 * sound is decoded asking for it is silently a no-op.
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
 */
export function playSfx(id: SfxId): void {
  if (!soundsEnabled || failed.has(id)) return;
  const sound = loaded.get(id);
  if (sound === undefined) return;
  const gap = MIN_GAP_MS[id];
  if (gap !== undefined) {
    const now = Date.now();
    if (now - (lastPlayedAt.get(id) ?? 0) < gap) return;
    lastPlayedAt.set(id, now);
  }
  try {
    ReefSfx?.play(sound.soundId, sound.volume, jitteredRate());
  } catch (error) {
    loaded.delete(id);
    failed.add(id);
    console.warn(`[sfx] could not play "${id}"`, error instanceof Error ? error.message : error);
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
