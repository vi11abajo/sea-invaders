import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

/**
 * Owner-provided or licensed tracks (design doc table B). No files exist yet for any of them - every
 * entry below is commented out on purpose. `playMusic`/`stopMusic` read this map at call time, so
 * once the owner drops `music_home.mp3` etc. under `assets/music/` the matching line here is
 * uncommented and playback starts working with no other code change; until then every id is a
 * silent no-op.
 */
export type MusicId = 'music_home' | 'music_run' | 'music_boss' | 'music_result';

const MUSIC: Partial<Record<MusicId, number>> = {
  // music_home: require('../../assets/music/music_home.mp3'),
  // music_run: require('../../assets/music/music_run.mp3'),
  // music_boss: require('../../assets/music/music_boss.mp3'),
  // music_result: require('../../assets/music/music_result.mp3'),
};

/** `ambience_reef` already has a placeholder recording (it ships under `assets/sfx/`, spec table A row 42) even though it is a loop, not a one-shot, so it is driven from here rather than `sfx.ts`. */
const AMBIENCE_ASSET = require('../../assets/sfx/ambience_reef.wav');

/** Ambience sits well under anything else (doc: "ambience -12 dB"). */
const AMBIENCE_VOLUME = 0.2;
/** A full-volume music track, once real tracks exist (doc: "music -6 dB under sound effects"). */
const MUSIC_VOLUME = 0.5;
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

/** Starts (or resumes) the reef ambience loop, fading it in. A no-op while the Music switch is off — `setMusicEnabled(true)` picks it back up. */
export function startAmbience(): void {
  wantAmbience = true;
  if (!musicEnabled) return;
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
  if (musicPlayerId === id && musicPlayer !== null) return;
  const asset = MUSIC[id];
  const previous = musicPlayer;
  if (previous !== null) fadeTo(previous, 0, () => previous.pause());
  if (asset === undefined) {
    musicPlayer = null;
    musicPlayerId = id;
    return;
  }
  const player = createAudioPlayer(asset);
  player.loop = true;
  player.volume = 0;
  player.play();
  fadeTo(player, MUSIC_VOLUME);
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
