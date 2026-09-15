import { Canvas, FilterMode, Image, MipmapMode } from '@shopify/react-native-skia';
import type { OctopiVariant } from '@sea-invaders/core';
import { StyleSheet, View } from 'react-native';
import type { SkinIndex } from '../loadout/items';
import { SKIN_TINTS, useOctopiTint } from './skins';
import { useOctopiArt } from './sprites';

/** The snapshot is already at the screen's physical size, so a plain linear draw lands it 1:1. */
const SAMPLING = { filter: FilterMode.Linear, mipmap: MipmapMode.None } as const;

/**
 * Octopi's front pose in its look (`octopiTint`: the player's active skin, else the colour of the
 * campaign octopi `octopi`, by default the run's), fitted into a `size` dp square (the way
 * `resizeMode="contain"` placed the plain sprite before skins). The square is laid out at once;
 * Octopi appears in it as soon as its snapshot is ready.
 */
export function ActiveOctopi({ size, octopi }: { size: number; octopi?: OctopiVariant }) {
  const art = useOctopiArt(useOctopiTint(octopi), size);
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
 * A leaderboard row's Octopi (design doc §8): the whole front pose in `skin`'s colour, fitted into
 * a `size` dp square with no frame - the owner dropped handoff 08's glass circle because it cropped
 * the tentacles (2026-09-15). `skin` here is the raw selector of the entry's own run (a daily run
 * always plays the base Octopi, so the skin is the run's whole look), not the viewer's active skin,
 * so it goes straight to `SKIN_TINTS` rather than through `useOctopiTint` (which reads the current
 * player's loadout/run context). Draws through the same `useOctopiArt` snapshot cache as every
 * other UI Octopi — keyed by tint + physical size, so every row on both boards sharing a skin shares
 * one snapshot; a board of 50 rows across 5 skins decodes at most 5 snapshots, never one per row.
 */
export function OctopiAvatar({ skin, size }: { skin: SkinIndex; size: number }) {
  const art = useOctopiArt(SKIN_TINTS[skin] ?? null, size);
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
