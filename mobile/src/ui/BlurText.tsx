import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { TONE, type TxtTone, type TxtVariant } from './Txt';
import { TYPE } from './tokens';

interface BlurTextProps {
  text: string;
  variant?: TxtVariant;
  tone?: TxtTone;
  style?: StyleProp<TextStyle>;
  /** ms between each word's start. */
  staggerMs?: number;
  /** ms each word takes to resolve from blurred to sharp. */
  durationMs?: number;
  /** Extra ms before the first word starts. */
  delayMs?: number;
  /** Fires once, after the last word finishes. */
  onDone?: () => void;
}

/** How far a word rises while it resolves, dp. */
const RISE_DP = 10;
/** `textShadowRadius` a word starts at — RN has no text-level blur filter, so a large, same-colour
 * soft shadow that shrinks to 0 is the cheapest stand-in (chosen over a per-word Skia `Canvas` +
 * `Blur` filter: that would mean one extra `Canvas`/frame-buffer per word for a headline shown for a
 * few hundred ms, and RN's own bitmap font atlas already anti-aliases the glyphs it draws, so the
 * shadow reads as a believable defocus at this size without the extra draw cost). */
const BLUR_SHADOW = 8;

/**
 * Blur Text (React Bits `BlurText`): a line resolves word by word, each one rising a little and
 * sharpening from a soft same-colour shadow to nothing, staggered left to right. Re-runs only when
 * `text` itself changes (a new level's line, a new boss's name) — an unrelated re-render of the
 * host screen leaves whichever words have already resolved alone.
 */
export function BlurText({ text, variant = 'body', tone = 'primary', style, staggerMs = 55, durationMs = 380, delayMs = 0, onDone }: BlurTextProps) {
  const words = text.split(' ');
  const color = TONE[tone];
  return (
    <View style={styles.wrap}>
      {words.map((word, i) => (
        <BlurWord
          // The index alone would reuse a word's animation state across two different sentences of
          // the same length; the word itself breaks that tie for the common case.
          key={`${i}-${word}`}
          word={word}
          trailingSpace={i < words.length - 1}
          textStyle={[TYPE[variant], { color }, style]}
          color={color}
          delay={delayMs + i * staggerMs}
          duration={durationMs}
          onDone={i === words.length - 1 ? onDone : undefined}
        />
      ))}
    </View>
  );
}

interface BlurWordProps {
  word: string;
  trailingSpace: boolean;
  textStyle: StyleProp<TextStyle>;
  color: string;
  delay: number;
  duration: number;
  onDone?: () => void;
}

function BlurWord({ word, trailingSpace, textStyle, color, delay, duration, onDone }: BlurWordProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withDelay(
      delay,
      withTiming(1, { duration, easing: Easing.out(Easing.cubic) }, (finished) => {
        if (finished === true && onDone !== undefined) runOnJS(onDone)();
      }),
    );
    // Only a genuine change to this word (a new sentence swapped in) restarts it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word, delay, duration]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * RISE_DP }],
    textShadowRadius: (1 - progress.value) * BLUR_SHADOW,
  }));

  return (
    <Animated.Text style={[textStyle, animatedStyle, { textShadowColor: color, textShadowOffset: styles.shadowOffset }]}>
      {trailingSpace ? `${word} ` : word}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  shadowOffset: { width: 0, height: 0 },
});
