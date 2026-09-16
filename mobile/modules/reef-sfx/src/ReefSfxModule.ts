import { requireOptionalNativeModule } from 'expo-modules-core';

/** The native surface of `ReefSfxModule.kt`. See it for what each one does. */
export interface ReefSfx {
  /** Decodes the sound at `path` (a plain file path, no scheme) and resolves with its play id. */
  load(name: string, path: string): Promise<number>;
  /** Sounds `soundId` at `volume` (0..1) and `rate` (0.5..2). One native call, safe every frame. */
  play(soundId: number, volume: number, rate: number): void;
  /** Silences everything sounding right now; the decoded sounds stay loaded. */
  stopAll(): void;
  /** Drops every decoded sound. */
  unloadAll(): void;
}

/**
 * `null` wherever the native module is not built in - the sound pool is Android's, and the reef
 * runs on Android. Callers treat a missing pool as a reef that simply makes no noise.
 */
export default requireOptionalNativeModule<ReefSfx>('ReefSfx');
