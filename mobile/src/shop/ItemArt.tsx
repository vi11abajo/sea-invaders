import { Canvas, Circle, ColorMatrix, FilterMode, Image, MipmapMode, RadialGradient, vec, type SkImage } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { ITEM_TINT, tintMatrix, tintWithAlpha } from './tints';

/**
 * The sprite is ~2300 px wide and the thumbs are 56-64 dp, a >10x reduction: mip-mapped linear
 * sampling keeps the outlines smooth instead of "crushed" (the lesson of the in-game sprites).
 */
const SAMPLING = { filter: FilterMode.Linear, mipmap: MipmapMode.Linear } as const;
/** The sprite's share of the thumb, leaving a rim for the glow behind it. */
const SPRITE_SHARE = 0.88;
/** The glow is the design's art-slot light, `radial-gradient(circle at 50% 40%, <colour> 25 %, transparent 70%)`. */
const GLOW_ALPHA = 0.25;
const GLOW_CENTER_Y = 0.4;
/** CSS `circle` radial gradients reach the farthest corner: from (50 %, 40 %) that is sqrt(0.5² + 0.6²) of the side. */
const GLOW_RADIUS = Math.sqrt(0.5 * 0.5 + 0.6 * 0.6);

interface ItemArtProps {
  /** `octopiFront.png`, decoded once by the screen and shared by every thumb. Null while it loads. */
  image: SkImage | null;
  /** Catalogue item id; an id without a tint (a future item) shows the base Octopi. */
  itemId: number;
  /** Thumb side in dp: 56 for a campaign octopi row, 64 for a skin card. */
  size: number;
}

/** A catalogue item's thumb: Octopi recoloured to the item's tint over a soft glow of the same colour. */
export function ItemArt({ image, itemId, size }: ItemArtProps) {
  const tint = ITEM_TINT[itemId];
  const matrix = useMemo(() => (tint === undefined ? null : tintMatrix(tint)), [tint]);
  const glow = tint ?? '#FFFFFF';
  const half = size / 2;
  const sprite = size * SPRITE_SHARE;
  const inset = (size - sprite) / 2;
  return (
    <Canvas style={{ width: size, height: size }} pointerEvents="none">
      <Circle cx={half} cy={half} r={half}>
        <RadialGradient
          c={vec(half, size * GLOW_CENTER_Y)}
          r={size * GLOW_RADIUS}
          colors={[tintWithAlpha(glow, GLOW_ALPHA), tintWithAlpha(glow, 0)]}
          positions={[0, 0.7]}
        />
      </Circle>
      {image !== null && (
        <Image image={image} x={inset} y={inset} width={sprite} height={sprite} fit="contain" sampling={SAMPLING}>
          {matrix !== null && <ColorMatrix matrix={matrix} />}
        </Image>
      )}
    </Canvas>
  );
}
