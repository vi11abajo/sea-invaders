import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

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
  ui_sheet: require('../../assets/sfx/ui_sheet.wav'),
  ui_tap: require('../../assets/sfx/ui_tap.wav'),
  wallet_connected: require('../../assets/sfx/wallet_connected.wav'),
  wave_cleared: require('../../assets/sfx/wave_cleared.wav'),
  wave_start: require('../../assets/sfx/wave_start.wav'),
} as const;

export type SfxId = keyof typeof SFX_ASSETS;

/**
 * Players per id: the run's most frequent sounds (an ink shot, a claw snap, a shell crack, a boss
 * impact) can overlap with themselves — one may still be finishing while the next fires a tick or
 * two later — so each gets a small rotating pool. Everything else is rare enough that one player,
 * restarted from the top, is never asked to overlap itself.
 */
const POOL_SIZE: Partial<Record<SfxId, number>> = {
  octopi_shot: 3,
  crab_shot: 3,
  crab_hit: 3,
  boss_hit: 3,
};

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

/** Random pitch within ±5 % (doc: "so they never machine-gun"). `shouldCorrectPitch = false` makes a rate change also shift pitch, not just speed. */
const RATE_JITTER = 0.05;
function jitteredRate(): number {
  return 1 + (Math.random() * 2 - 1) * RATE_JITTER;
}

interface Pool {
  players: AudioPlayer[];
  next: number;
}

const pools = new Map<SfxId, Pool>();
/**
 * Every id whose pool failed to build or play (a missing/corrupt asset): it has warned once, and
 * every later call is a no-op without touching the native side again.
 */
const failed = new Set<SfxId>();

let soundsEnabled = true;

/** Configures the app's audio session once: sound effects play over silent mode and never fight another app for focus. */
setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'mixWithOthers' }).catch((error: unknown) => {
  console.warn('[sfx] audio mode not applied', error instanceof Error ? error.message : error);
});

function getPool(id: SfxId): Pool {
  let pool = pools.get(id);
  if (pool !== undefined) return pool;
  const size = POOL_SIZE[id] ?? 1;
  const players: AudioPlayer[] = [];
  for (let i = 0; i < size; i++) {
    const player = createAudioPlayer(SFX_ASSETS[id]);
    player.volume = volumeOf(id);
    // Pitch correction off so the rate jitter above actually changes pitch, the way a hand-played
    // instrument or a slightly different bubble never sounds identical twice.
    player.shouldCorrectPitch = false;
    players.push(player);
  }
  pool = { players, next: 0 };
  pools.set(id, pool);
  return pool;
}

/**
 * Plays `id` from its pool, rotating to the next player and restarting it from the top. Never
 * throws: a pool that fails to build (a missing/corrupt asset) logs once per id and every later
 * call for that id is silently a no-op. Safe to call every frame — at most one instance of an id
 * should be requested per rendered frame by the caller, but this function itself does not de-dupe.
 */
export function playSfx(id: SfxId): void {
  if (!soundsEnabled || failed.has(id)) return;
  try {
    const pool = getPool(id);
    const player = pool.players[pool.next]!;
    pool.next = (pool.next + 1) % pool.players.length;
    // Restart from the top: `play()` alone would do nothing once a one-shot has already reached its
    // end. `seekTo` is async on the native side, but the call itself is issued (and queued behind
    // nothing) before `play()` runs, so the two land in order in practice; not verified on-device
    // from this session — see the wiring report's "not device-tested" note. Its rejection is
    // swallowed: a seek that fails only means this instance plays from wherever it stopped.
    player.pause();
    player.seekTo(0).catch(() => {});
    player.setPlaybackRate(jitteredRate());
    player.play();
  } catch (error) {
    failed.add(id);
    console.warn(`[sfx] could not play "${id}"`, error instanceof Error ? error.message : error);
  }
}

/** The Sounds switch. Turning it off immediately silences anything currently playing. */
export function setSoundsEnabled(enabled: boolean): void {
  soundsEnabled = enabled;
  if (enabled) return;
  for (const pool of pools.values()) {
    for (const player of pool.players) {
      try {
        player.pause();
      } catch {
        // Already released or never loaded: nothing to silence.
      }
    }
  }
}
