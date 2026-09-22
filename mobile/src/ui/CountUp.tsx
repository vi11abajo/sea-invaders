import { useEffect, useRef } from 'react';
import { TextInput, type StyleProp, type TextInputProps, type TextStyle } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';

interface CountUpProps {
  value: number;
  /**
   * A starting value to count up from once, on mount (e.g. `0` for a result screen's score).
   * Omitted, the first render shows `value` outright with no entrance count-up — the Home balance
   * ticker's own shape, which only ever animates a later change to `value`, never its first mount.
   */
  from?: number;
  /** ms the count-up takes; ~800 for a balance ticking up, ~1200 for a result screen's score. */
  duration?: number;
  /**
   * Formats the live number for display. Must carry the `'worklet'` directive (see
   * `formatIntWorklet` below): it runs inside `useAnimatedProps`, on the UI thread, and an arbitrary
   * imported JS function (`@sea-invaders/core`'s `formatInt`, `Intl`, …) is not itself compiled to
   * run there.
   */
  format?: (value: number) => string;
  style?: StyleProp<TextStyle>;
}

/** `String(Math.round(n))` — the default when no `format` is given. */
function defaultFormat(n: number): string {
  'worklet';
  return `${Math.round(n)}`;
}

/**
 * A worklet-safe port of `@sea-invaders/core`'s `formatInt` (18920 -> "18,920"; the fraction is
 * dropped). The exact same regex, just carrying the `'worklet'` directive — see `CountUp`'s own doc
 * for why a plain re-export of the core helper cannot be called from inside `useAnimatedProps`.
 */
export function formatIntWorklet(value: number): string {
  'worklet';
  const n = Math.trunc(value);
  const grouped = `${Math.abs(n)}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return n < 0 ? `-${grouped}` : grouped;
}

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/**
 * Count Up (React Bits `CountUp`/`Counter`): counts from the previously displayed value to `value`
 * whenever it changes, eased over `duration`. Uses the "ReText" pattern — an
 * `Animated.createAnimatedComponent(TextInput)` with `editable={false}`, whose native `text` prop is
 * set directly from a UI-thread `useAnimatedProps`, the same trick Reanimated's own docs use for a
 * live counter — instead of the `useAnimatedReaction` -> `runOnJS(setState)` bridge tried earlier:
 * that ran a React state update (and everything downstream of it) on every animation frame, which is
 * exactly the per-frame `setState` the brief rules out. This way the whole count, digit by digit,
 * never touches React or the JS thread at all.
 *
 * Because of that, this can only render its own plain text — it cannot feed a Skia canvas (`ShinyText`,
 * `GradientText`), which has no equivalent "set this native prop and skip React" path for a *changing*
 * string (its `<Canvas>` still has to be told the new width for each new digit count, and that sizing
 * is a normal React-level style computed from the string in the component body). The result score and
 * the Home SKR balance use this component directly; the weekly pool amount does not (see
 * `DailyRunCard.tsx`'s comment) — it keeps `ShinyText`'s sheen on a statically-formatted string
 * instead.
 */
export function CountUp({ value, from, duration = 800, format = defaultFormat, style }: CountUpProps) {
  const start = from ?? value;
  const progress = useSharedValue(start);
  const previous = useRef(start);

  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    progress.value = withTiming(value, { duration, easing: Easing.out(Easing.cubic) });
    return () => cancelAnimation(progress);
  }, [value, duration, progress]);

  const animatedProps = useAnimatedProps(() => {
    const text = format(progress.value);
    // `text` is a native-only `TextInput` prop this trick relies on; it is not part of the
    // declared `TextInputProps` type, hence the escape hatch.
    return { text, defaultValue: text } as unknown as Partial<TextInputProps>;
  });

  return (
    <AnimatedTextInput
      underlineColorAndroid="transparent"
      editable={false}
      focusable={false}
      caretHidden
      showSoftInputOnFocus={false}
      pointerEvents="none"
      defaultValue={format(start)}
      animatedProps={animatedProps}
      style={[{ padding: 0, margin: 0 }, style]}
    />
  );
}
