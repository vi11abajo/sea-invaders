import { Canvas, Circle, FilterMode, Image, MipmapMode, RadialGradient, vec } from '@shopify/react-native-skia';
import type { OctopiVariant } from '@sea-invaders/core';
import { StyleSheet, View } from 'react-native';
import type { SkinIndex } from '../loadout/items';
import { tintWithAlpha } from '../shop/tints';
import { lookOfSkin, type Look } from './looks';
import { useOctopiLook } from './skins';
import { useOctopiArt } from './sprites';

/** The snapshot is already at the screen's physical size, so a plain linear draw lands it 1:1. */
const SAMPLING = { filter: FilterMode.Linear, mipmap: MipmapMode.None } as const;

/**
 * Octopi's front pose in its look (`useOctopiLook`: the player's active skin, else the art of the
 * champion `octopi`, by default the run's), fitted into a `size` dp square (the way
 * `resizeMode="contain"` placed the plain sprite before skins). The square is laid out at once;
 * Octopi appears in it as soon as its snapshot is ready. A drawn look shows its Front pose (design
 * doc §5: there are no side poses for them).
 */
export function ActiveOctopi({ size, octopi }: { size: number; octopi?: OctopiVariant }) {
  const art = useOctopiArt(useOctopiLook(octopi), size);
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      {art !== null && (
        <Canvas style={{ width: size, height: size }}>
          <Image image={art} x={0} y={0} width={size} height={size} fit="contain" sampling={SAMPLING} />
        </Canvas>
      )}
    </View>
  );
}

/**
 * A leaderboard row's Octopi (design doc §5): the whole front pose in `skin`'s look, fitted into a
 * `size` dp square with no frame - the owner dropped handoff 08's glass circle because it cropped
 * the tentacles (2026-09-15). `skin` here is the raw selector of the entry's own run (a daily run
 * always plays the base Octopi, so the skin is the run's whole look), not the viewer's active skin,
 * so it goes straight to `lookOfSkin` rather than through `useOctopiLook` (which reads the current
 * player's loadout/run context). Draws through the same `useOctopiArt` snapshot cache as every
 * other UI Octopi — keyed by look + physical size, so every row on both boards sharing a skin shares
 * one snapshot, and a drawn skin's Front is decoded once for all of them, never once per row.
 */
export function OctopiAvatar({ skin, size }: { skin: SkinIndex; size: number }) {
  const art = useOctopiArt(lookOfSkin(skin), size);
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      {art !== null && (
        <Canvas style={StyleSheet.absoluteFill}>
          <Image image={art} x={0} y={0} width={size} height={size} fit="contain" sampling={SAMPLING} />
        </Canvas>
      )}
    </View>
  );
}

/** The sprite's share of the thumb, leaving a rim for the glow behind it. */
const SPRITE_SHARE = 0.88;
/** The glow is the design's art-slot light, `radial-gradient(circle at 50% 40%, <colour> 25 %, transparent 70%)`. */
const GLOW_ALPHA = 0.25;
const GLOW_CENTER_Y = 0.4;
/** CSS `circle` radial gradients reach the farthest corner: from (50 %, 40 %) that is sqrt(0.5² + 0.6²) of the side. */
const GLOW_RADIUS = Math.sqrt(0.5 * 0.5 + 0.6 * 0.6);

interface OctopiThumbProps {
  /** What Octopi wears: `CHAMPION_LOOK[...]`, `SKIN_LOOK[...]`, `lookOfSkin(...)` or `BASE_LOOK`. */
  look: Look;
  /** The glow's colour, `#RRGGBB`: an item's `ITEM_TINT`, or `accentOfLook` / `ACCENT_BY_VARIANT` / `ACCENT_BY_SKIN`. */
  accent: string;
  /** Thumb side in dp: 56 for a champion row, 64 for a skin card, 34 for a Profile or Level start tile. */
  size: number;
}

/**
 * A look's thumb (design doc §5): Octopi's front pose in `look` over a soft glow of `accent` — the
 * Shop's cards (`ItemArt`), the Profile's tiles and the Level start picker. The sprite is a
 * `useOctopiArt` snapshot already pre-scaled to the screen's physical pixels; the full-size source
 * is never held for it.
 */
export function OctopiThumb({ look, accent, size }: OctopiThumbProps) {
  const half = size / 2;
  const sprite = size * SPRITE_SHARE;
  const inset = (size - sprite) / 2;
  const art = useOctopiArt(look, sprite);
  return (
    <Canvas style={{ width: size, height: size }} pointerEvents="none">
      <Circle cx={half} cy={half} r={half}>
        <RadialGradient
          c={vec(half, size * GLOW_CENTER_Y)}
          r={size * GLOW_RADIUS}
          colors={[tintWithAlpha(accent, GLOW_ALPHA), tintWithAlpha(accent, 0)]}
          positions={[0, 0.7]}
        />
      </Circle>
      {art !== null && <Image image={art} x={inset} y={inset} width={sprite} height={sprite} fit="contain" sampling={SAMPLING} />}
    </Canvas>
  );
}
