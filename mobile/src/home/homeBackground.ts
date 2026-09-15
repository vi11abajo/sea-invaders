import type { TextStyle } from 'react-native';

/**
 * Home's background, an owner trial (2026-09-15): the reef key art (`assets/home-bg.jpg`, drawn
 * edge to edge with `cover`) in place of the animated `Backdrop` and its light rays, plus what keeps
 * the copy readable on it - a dark scrim over the bright upper water, a band under the ticker and
 * a shadow under the small captions. Set this to `false` to bring the rays back: every key-art-only
 * style switches off with it and nothing else changes.
 */
export const HOME_KEY_ART_BACKGROUND = true;
export const HOME_KEY_ART = require('../../assets/home-bg.jpg');

/** A soft dark shadow under small copy that sits straight on the key art; nothing when the rays are back. */
export const KEY_ART_TEXT_SHADOW: TextStyle | undefined = HOME_KEY_ART_BACKGROUND
  ? { textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 }
  : undefined;
