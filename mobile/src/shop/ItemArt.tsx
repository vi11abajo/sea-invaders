import { Canvas, Circle, FilterMode, Image, MipmapMode, RadialGradient, vec } from '@shopify/react-native-skia';
import { useOctopiArt } from '../game/sprites';
import { ITEM_TINT, tintWithAlpha } from './tints';

/**
 * The thumb is a snapshot already recoloured and pre-scaled to the screen's physical pixels
 * (`useOctopiArt`), so a plain linear draw lands it 1:1; the ~2300 px sprite is never held for it.
 */
const SAMPLING = { filter: FilterMode.Linear, mipmap: MipmapMode.None } as const;
/** The sprite's share of the thumb, leaving a rim for the glow behind it. */
const SPRITE_SHARE = 0.88;
/** The glow is the design's art-slot light, `radial-gradient(circle at 50% 40%, <colour> 25 %, transparent 70%)`. */
const GLOW_ALPHA = 0.25;
const GLOW_CENTER_Y = 0.4;
/** CSS `circle` radial gradients reach the farthest corner: from (50 %, 40 %) that is sqrt(0.5² + 0.6²) of the side. */
const GLOW_RADIUS = Math.sqrt(0.5 * 0.5 + 0.6 * 0.6);

interface ItemArtProps {
  /** Catalogue item id; null (the base Octopi) or an id without a tint (a future item) shows Octopi's own colours. */
  itemId: number | null;
  /** Thumb side in dp: 56 for a campaign octopi row, 64 for a skin card, 34 for a Profile tile. */
  size: number;
}

/** A catalogue item's thumb: Octopi recoloured to the item's tint over a soft glow of the same colour. */
export function ItemArt({ itemId, size }: ItemArtProps) {
  const tint = itemId === null ? undefined : ITEM_TINT[itemId];
  const glow = tint ?? '#FFFFFF';
  const half = size / 2;
  const sprite = size * SPRITE_SHARE;
  const inset = (size - sprite) / 2;
  const art = useOctopiArt(tint ?? null, sprite);
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
      {art !== null && <Image image={art} x={inset} y={inset} width={sprite} height={sprite} fit="contain" sampling={SAMPLING} />}
    </Canvas>
  );
}
