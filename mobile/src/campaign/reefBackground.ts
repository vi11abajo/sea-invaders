import { BOSS_COLOR } from '../game/GameHud';
import type { ReefBackdropVariant } from './ReefBackdrop';

/**
 * The reef screens' background, an owner trial (2026-09-15): Home's reef key art
 * (`assets/home-bg.jpg`, drawn edge to edge with `cover`) tinted with the reef boss's colour, in
 * place of `ReefBackdrop`'s water gradient, glow band and light rays. The seabed dome, the flora and
 * the looming boss stay on top of it either way. Set this to `false` to bring the gradient, the glow
 * and the rays back: nothing else changes.
 */
export const REEF_KEY_ART_BACKGROUND = true;
export const REEF_KEY_ART = require('../../assets/home-bg.jpg');

/**
 * How the boss colour is applied: `hue` keeps the art's own saturation and light and only turns its
 * hue to the boss's, so the picture stays rich instead of going flat and grey (`color` would).
 */
export const REEF_KEY_ART_BLEND = 'hue' as const;

/** Black laid over the tinted art, by variant: a touch on the map, more under a run so crabs and shots stay readable. */
export const REEF_KEY_ART_DIM: Record<ReefBackdropVariant, number> = { map: 0.2, play: 0.4 };

/** The boss colour of reef 1..5 - boss kind = reef number (the map's `sprites.bosses[reef - 1]`, the HUD's `BOSS_COLOR[kind - 1]`). */
export function reefKeyArtTint(reef: number): string {
  return BOSS_COLOR[reef - 1] ?? BOSS_COLOR[0]!;
}
