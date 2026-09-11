import { GeistMono_500Medium } from '@expo-google-fonts/geist-mono/500Medium';
import { Canvas, LinearGradient, Text, useFont, vec } from '@shopify/react-native-skia';
import { SIGNATURE_GRADIENT } from './tokens';

/** A mono number in the signature gradient, for money, records and wins. */
export function GradientText({ text, size }: { text: string; size: number }) {
  const font = useFont(GeistMono_500Medium, size);
  if (font === null) return null;
  // Size the canvas by the glyph advances: measureText returns tight ink bounds without the side
  // bearings, and a canvas that narrow clips the last glyph.
  const advance = font.getGlyphWidths(font.getGlyphIDs(text)).reduce((sum, w) => sum + w, 0);
  const width = Math.ceil(advance) + 1;
  const { ascent, descent } = font.getMetrics();
  const height = Math.ceil(descent - ascent);
  return (
    <Canvas style={{ width, height }}>
      <Text x={0} y={-ascent} text={text} font={font}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(width, 0)}
          colors={[...SIGNATURE_GRADIENT.colors]}
          positions={[...SIGNATURE_GRADIENT.positions]}
        />
      </Text>
    </Canvas>
  );
}
