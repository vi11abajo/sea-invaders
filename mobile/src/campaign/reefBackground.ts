import type { TextStyle } from 'react-native';
import { BOSS_COLOR } from '../game/GameHud';
import type { ReefBackdropVariant } from './ReefBackdrop';

/**
 * The reef screens' background, an owner trial (2026-09-15): Home's reef key art
 * (`assets/home-bg.jpg`, drawn edge to edge with `cover`) tinted with the reef boss's colour, in
 * place of `ReefBackdrop`'s water gradient, glow band, light rays, seabed dome and flora, with the
 * looming boss drawn clearer, the level path drawn bolder and a scrim plus text shadows keeping the
 * header readable on the bright water. Set this to `false` to bring the previous world back: every
 * key-art-only value below switches off with it and nothing else changes.
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

/** The top scrim under the header (see `ui/KeyArtScrim`): black at 50 % along the top edge, gone by a third of the height. */
export const REEF_KEY_ART_SCRIM = { opacity: 0.5, fraction: 0.32 } as const;

/** The map's looming boss on the art: clearer than the design's ghost (opacity 0.14, blur 3) so it reads against the busy picture. */
export const REEF_KEY_ART_BOSS_LOOM = { opacity: 0.5, blur: 1 } as const;

/** The dashed level path on the art: a little bolder than the design's 2 dp at 55 %. */
export const REEF_KEY_ART_PATH = { strokeWidth: 2.5, opacity: 0.9 } as const;

/** A soft dark shadow under the header copy that sits straight on the art; nothing when the previous world is back. */
export const REEF_KEY_ART_TEXT_SHADOW: TextStyle | undefined = REEF_KEY_ART_BACKGROUND
  ? { textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 }
  : undefined;

/** The boss colour of reef 1..5 - boss kind = reef number (the map's `sprites.bosses[reef - 1]`, the HUD's `BOSS_COLOR[kind - 1]`). */
export function reefKeyArtTint(reef: number): string {
  return BOSS_COLOR[reef - 1] ?? BOSS_COLOR[0]!;
}
