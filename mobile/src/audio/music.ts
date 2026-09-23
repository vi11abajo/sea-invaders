import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

/**
 * Configures the audio session once, for everything `expo-audio` plays here: the loops sound over
 * silent mode and never fight another app for focus. The one-shots do not go through `expo-audio`
 * at all - they have their own sound pool (`sfx.ts`) - so this lives with the loops that need it.
 */
setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'mixWithOthers' }).catch((error: unknown) => {
  console.warn('[music] audio mode not applied', error instanceof Error ? error.message : error);
});

/**
 * Owner-provided tracks (design doc table B), the owner's own earlier version of the game
 * (`assets/music/CREDITS.md`). `music_result` has no recording supplied yet - `playMusic`/`stopMusic`
 * read this map at call time, so dropping `music_result.mp3` under `assets/music/` and adding its
 * entry here is a drop-in with no other code change; until then that one id is a silent no-op (the
 * result screen keeps whatever track the run was already playing instead).
 */
export type MusicId = 'music_home' | 'music_run' | 'music_boss' | 'music_map' | 'music_result';

const MUSIC: Partial<Record<MusicId, number>> = {
  music_home: require('../../assets/music/music_home.mp3'),
  music_run: require('../../assets/music/music_run.mp3'),
  music_boss: require('../../assets/music/music_boss.mp3'),
  music_map: require('../../assets/music/music_map.mp3'),
  // music_result: not supplied yet.
};

/**
 * The reef ambience loop (spec table A, `ambience_reef`): a loop, not a one-shot, so it is driven
 * from here rather than `sfx.ts`. A bubbles-only loop (`assets/music/CREDITS.md`), kept low under
 * everything else via `AMBIENCE_VOLUME`.
 */
const AMBIENCE_ASSET: number | null = require('../../assets/music/ambience_reef.wav');

/** Ambience sits well under anything else (doc: "ambience -12 dB"). */
const AMBIENCE_VOLUME = 0.2;
/**
 * Each track's level, the owner's earlier version's own mix (`soundVolumes` there: menu, map and
 * gameplay at 0.1, the boss theme at 0.15 - quiet under the effects on purpose); a track without a
 * recording keeps the doc's default. `LEGACY_GAIN` scales the reused tracks together if the phone
 * wants them louder or quieter.
 */
const LEGACY_GAIN = 1;
const MUSIC_VOLUMES: Record<MusicId, number> = {
  music_home: 0.1 * LEGACY_GAIN,
  music_map: 0.1 * LEGACY_GAIN,
  music_run: 0.1 * LEGACY_GAIN,
  music_boss: 0.15 * LEGACY_GAIN,
  music_result: 0.5,
};
const FADE_MS = 900;
const FADE_STEP_MS = 50;

let musicEnabled = true;
/** What the app last asked for, so `setMusicEnabled(true)` can resume exactly what was wanted while it was off. */
let wantAmbience = false;
let wantMusic: MusicId | null = null;

let ambiencePlayer: AudioPlayer | null = null;
let musicPlayer: AudioPlayer | null = null;
let musicPlayerId: MusicId | null = null;

/** Cancels any fade already running on `player`, so two overlapping fades never fight over its volume. */
const fadeTimers = new WeakMap<AudioPlayer, ReturnType<typeof setInterval>>();

function fadeTo(player: AudioPlayer, target: number, onDone?: () => void): void {
  const running = fadeTimers.get(player);
  if (running !== undefined) clearInterval(running);
  const start = player.volume;
  const steps = Math.max(1, Math.round(FADE_MS / FADE_STEP_MS));
  let i = 0;
  const timer = setInterval(() => {
    i += 1;
    const t = i / steps;
    try {
      player.volume = start + (target - start) * t;
    } catch {
      clearInterval(timer);
      fadeTimers.delete(player);
      return;
    }
    if (i >= steps) {
      clearInterval(timer);
      fadeTimers.delete(player);
      onDone?.();
    }
  }, FADE_STEP_MS);
  fadeTimers.set(player, timer);
}

/** Starts (or resumes) the reef ambience loop, fading it in. A no-op while the Music switch is off — `setMusicEnabled(true)` picks it back up — and while no ambience recording has been supplied. */
export function startAmbience(): void {
  wantAmbience = true;
  if (!musicEnabled || AMBIENCE_ASSET === null) return;
  if (ambiencePlayer === null) {
    ambiencePlayer = createAudioPlayer(AMBIENCE_ASSET);
    ambiencePlayer.loop = true;
    ambiencePlayer.volume = 0;
  }
  ambiencePlayer.play();
  fadeTo(ambiencePlayer, AMBIENCE_VOLUME);
}

/** Fades the ambience out and pauses it. */
export function stopAmbience(): void {
  wantAmbience = false;
  const player = ambiencePlayer;
  if (player === null) return;
  fadeTo(player, 0, () => player.pause());
}

/** Starts `id`'s loop, fading out whatever music was already playing first. Silently does nothing while its track has not been supplied yet (see `MUSIC` above) or the Music switch is off. */
export function playMusic(id: MusicId): void {
  wantMusic = id;
  if (!musicEnabled) return;
  if (musicPlayerId === id && musicPlayer !== null) {
    // Muting pauses this same player without releasing it (see `setMusicEnabled`); resume it
    // in place instead of falling through to the swap-tracks path below.
    if (!musicPlayer.playing) musicPlayer.play();
    return;
  }
  const asset = MUSIC[id];
  const previous = musicPlayer;
  // `createAudioPlayer` players are never released on their own: once faded out, the old track's
  // player is paused and removed, so its native player does not wait for garbage collection.
  if (previous !== null) {
    fadeTo(previous, 0, () => {
      try {
        previous.pause();
        previous.remove();
      } catch {
        // Already released.
      }
    });
  }
  if (asset === undefined) {
    musicPlayer = null;
    musicPlayerId = id;
    return;
  }
  const player = createAudioPlayer(asset);
  player.loop = true;
  player.volume = 0;
  player.play();
  fadeTo(player, MUSIC_VOLUMES[id]);
  musicPlayer = player;
  musicPlayerId = id;
}

/** Fades the current music track out and pauses it. */
export function stopMusic(): void {
  wantMusic = null;
  const player = musicPlayer;
  musicPlayerId = null;
  if (player === null) return;
  fadeTo(player, 0, () => player.pause());
}

/** The Music switch: also gates the ambience loop (design doc, section E instructions). Off pauses both immediately (no fade, so the switch reads as instant); on resumes whatever was last requested. */
export function setMusicEnabled(enabled: boolean): void {
  musicEnabled = enabled;
  if (enabled) {
    if (wantAmbience) startAmbience();
    if (wantMusic !== null) playMusic(wantMusic);
    return;
  }
  try {
    ambiencePlayer?.pause();
  } catch {
    // Already released.
  }
  try {
    musicPlayer?.pause();
  } catch {
    // Already released.
  }
}
