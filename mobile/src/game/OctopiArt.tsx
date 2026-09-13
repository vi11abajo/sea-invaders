import { Canvas, FilterMode, Image, MipmapMode } from '@shopify/react-native-skia';
import type { OctopiVariant } from '@sea-invaders/core';
import { View } from 'react-native';
import { useOctopiTint } from './skins';
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
