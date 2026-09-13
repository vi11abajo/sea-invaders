import { Canvas, FilterMode, Image, MipmapMode } from '@shopify/react-native-skia';
import { View } from 'react-native';
import { SKIN_TINTS, useActiveSkin } from './skins';
import { useOctopiArt } from './sprites';

/** The snapshot is already at the screen's physical size, so a plain linear draw lands it 1:1. */
const SAMPLING = { filter: FilterMode.Linear, mipmap: MipmapMode.None } as const;

/**
 * Octopi's front pose in the player's active skin, fitted into a `size` dp square (the way
 * `resizeMode="contain"` placed the plain sprite before skins). The square is laid out at once;
 * Octopi appears in it as soon as its snapshot is ready.
 */
export function ActiveOctopi({ size }: { size: number }) {
  const skin = useActiveSkin();
  const art = useOctopiArt(SKIN_TINTS[skin] ?? null, size);
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
