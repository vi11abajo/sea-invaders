import { Canvas, LinearGradient, Text as SkiaText, useFont, vec, type DataSourceParam } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import {
  cancelAnimation, Easing, useDerivedValue, useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';
import { COLORS } from './tokens';

const STOPS = [0, 0.35, 0.5, 0.65, 1] as const;

interface ShinyTextProps {
  text: string;
  /** A Skia-loadable font asset — the same module `mobile/src/ui/fonts.ts` registers for RN `Text`
   * (e.g. `GeistMono_500Medium`, `InstrumentSans_600SemiBold`), passed straight to `useFont`. */
  fontSource: DataSourceParam;
  size: number;
  /** The text's resting colour. */
  color?: string;
  /** The sweep's highlight colour. */
  shineColor?: string;
  /** One sweep's duration, ms. */
  periodMs?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Shiny Text (React Bits `ShinyText`): a metallic sheen sweeping across `text`, looping. Built on
 * the app's existing `GradientText.tsx` Skia approach — there is no `MaskedView` dependency to build
 * on instead — a fixed 5-stop gradient (`color`/`shineColor`/`color`, the reference's own stops)
 * slides across the glyphs by animating the gradient's `start`/`end` points on the UI thread; the
 * colour stops themselves never change, so this is the same cost as a static `GradientText` draw
 * plus one cheap derived vector, not a per-frame re-render. The glyph measurement itself
 * (`getGlyphWidths`/`getMetrics`) is memoised by `[font, text]` — a caller driving `text` from a
 * throttled `CountUp` (the weekly pool) re-renders this a handful of times as the number counts up,
 * never once per animation frame, and each distinct string is measured only once.
 */
export function ShinyText({ text, fontSource, size, color = 'rgba(255,255,255,0.55)', shineColor = COLORS.text, periodMs = 2600, style }: ShinyTextProps) {
  const font = useFont(fontSource, size);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withRepeat(withTiming(1, { duration: periodMs, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(progress);
  }, [progress, periodMs]);

  const { width, height, ascent } = useMemo(() => {
    if (font === null) return { width: 0, height: 0, ascent: 0 };
    const w = Math.ceil(font.getGlyphWidths(font.getGlyphIDs(text)).reduce((sum, gw) => sum + gw, 0)) + 1;
    const m = font.getMetrics();
    return { width: w, height: Math.ceil(m.descent - m.ascent), ascent: m.ascent };
  }, [font, text]);
  // The sweep band travels one text-width-and-a-half past each edge, so it fully clears the glyphs
  // before looping back — matches the reference's 200%-wide sliding background.
  const span = width * 1.6;
  const start = useDerivedValue(() => vec(width - progress.value * (width + span), 0));
  const end = useDerivedValue(() => vec(start.value.x + span, 0));

  if (font === null) return null;
  return (
    <Canvas style={[{ width, height }, style]}>
      <SkiaText x={0} y={-ascent} text={text} font={font}>
        <LinearGradient start={start} end={end} colors={[color, color, shineColor, color, color]} positions={[...STOPS]} />
      </SkiaText>
    </Canvas>
  );
}
