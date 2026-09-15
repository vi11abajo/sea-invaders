import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { setVibrationEnabled } from './haptics';
import { setMusicEnabled } from './music';
import { setSoundsEnabled } from './sfx';

export interface AudioSettings {
  sounds: boolean;
  music: boolean;
  vibration: boolean;
}

const DEFAULTS: AudioSettings = { sounds: true, music: true, vibration: true };

const SOUNDS_KEY = '@sea-invaders/audio-sounds';
const MUSIC_KEY = '@sea-invaders/audio-music';
const VIBRATION_KEY = '@sea-invaders/audio-vibration';

/** `AsyncStorage` stores "0"/"1" (or is absent, meaning "never changed": the default, on). */
function parseFlag(raw: string | null): boolean {
  return raw !== '0';
}

let cache: AudioSettings = DEFAULTS;
let loadPromise: Promise<AudioSettings> | null = null;
const listeners = new Set<(s: AudioSettings) => void>();

function notify(): void {
  for (const listener of listeners) listener(cache);
}

/**
 * Reads the stored switches once (memoized: every caller across the app shares the same read) and
 * applies them to the audio modules immediately, so a sound triggered before any settings UI has
 * ever mounted (Splash, Home's ambience) still respects what the player chose last session.
 */
export function getAudioSettings(): Promise<AudioSettings> {
  if (loadPromise === null) {
    loadPromise = (async () => {
      try {
        const [sounds, music, vibration] = await Promise.all([
          AsyncStorage.getItem(SOUNDS_KEY), AsyncStorage.getItem(MUSIC_KEY), AsyncStorage.getItem(VIBRATION_KEY),
        ]);
        cache = { sounds: parseFlag(sounds), music: parseFlag(music), vibration: parseFlag(vibration) };
      } catch {
        // Storage unavailable: keep the on-by-default settings rather than guess further.
        cache = DEFAULTS;
      }
      setSoundsEnabled(cache.sounds);
      setMusicEnabled(cache.music);
      setVibrationEnabled(cache.vibration);
      notify();
      return cache;
    })();
  }
  return loadPromise;
}

// Kick the read off at module load, not on first hook mount, so Splash's very first frame already
// has a settled answer to await instead of triggering the load itself.
void getAudioSettings();

async function setSoundsFlag(value: boolean): Promise<void> {
  cache = { ...cache, sounds: value };
  notify();
  setSoundsEnabled(value);
  try {
    await AsyncStorage.setItem(SOUNDS_KEY, value ? '1' : '0');
  } catch {
    // Best-effort persistence: the in-memory setting (and the gate it just applied) still holds for this session.
  }
}

async function setMusicFlag(value: boolean): Promise<void> {
  cache = { ...cache, music: value };
  notify();
  setMusicEnabled(value);
  try {
    await AsyncStorage.setItem(MUSIC_KEY, value ? '1' : '0');
  } catch {
    // Best-effort persistence: the in-memory setting (and the gate it just applied) still holds for this session.
  }
}

async function setVibrationFlag(value: boolean): Promise<void> {
  cache = { ...cache, vibration: value };
  notify();
  setVibrationEnabled(value);
  try {
    await AsyncStorage.setItem(VIBRATION_KEY, value ? '1' : '0');
  } catch {
    // Best-effort persistence: the in-memory setting (and the gate it just applied) still holds for this session.
  }
}

/** The Profile card's Sounds/Music/Vibration switches: reads the resolved settings and exposes their setters. */
export function useAudioSettings(): AudioSettings & {
  setSounds: (value: boolean) => void;
  setMusic: (value: boolean) => void;
  setVibration: (value: boolean) => void;
} {
  const [settings, setSettings] = useState<AudioSettings>(cache);

  useEffect(() => {
    listeners.add(setSettings);
    void getAudioSettings().then(setSettings);
    return () => {
      listeners.delete(setSettings);
    };
  }, []);

  const setSounds = useCallback((value: boolean) => {
    void setSoundsFlag(value);
  }, []);
  const setMusic = useCallback((value: boolean) => {
    void setMusicFlag(value);
  }, []);
  const setVibration = useCallback((value: boolean) => {
    void setVibrationFlag(value);
  }, []);

  return { ...settings, setSounds, setMusic, setVibration };
}
