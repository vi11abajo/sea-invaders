import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import { Easing, runOnJS, useAnimatedReaction, useSharedValue, withTiming } from 'react-native-reanimated';
import { Txt } from './Txt';

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
  /** Formats the live number for display — the caller's own helper (`formatInt`, a one-decimal SKR
   * formatter, …), since this only owns the animation, never the number's presentation. */
  format?: (value: number) => string;
  style?: StyleProp<TextStyle>;
  /** Renders the current formatted text however the caller needs (through `ShinyText`, `SkrAmount`,
   * `GradientText`, …); defaults to a plain `Txt`. */
  children?: (text: string) => ReactNode;
}

const DEFAULT_FORMAT = (n: number): string => String(Math.round(n));

/**
 * Count Up (React Bits `CountUp`/`Counter`): counts from the previously displayed value to `value`
 * whenever it changes, eased over `duration`. RN's `Text` has no UI-thread-only way to change its own
 * content the way `transform`/`opacity` can — the reference itself works around the same limit on the
 * web by mutating `textContent` directly, bypassing React entirely. This is the RN equivalent: the
 * interpolation itself is a `withTiming` on a UI-thread shared value; `useAnimatedReaction` bridges
 * to a `useState` only when the number actually moves (so, roughly once per animation frame while
 * counting, never as a result of an unrelated re-render), and the caller's `format` always runs back
 * on the JS thread in the component body — never inside the worklet, since an arbitrary formatter
 * (`Intl`, a core-package helper) is not itself compiled as one.
 */
export function CountUp({ value, from, duration = 800, format = DEFAULT_FORMAT, style, children }: CountUpProps) {
  const start = from ?? value;
  const progress = useSharedValue(start);
  const previous = useRef(start);
  const [display, setDisplay] = useState(start);

  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    progress.value = withTiming(value, { duration, easing: Easing.out(Easing.cubic) });
  }, [value, duration, progress]);

  useAnimatedReaction(
    () => progress.value,
    (current, prev) => {
      if (prev === null || current !== prev) runOnJS(setDisplay)(current);
    },
  );

  const text = format(display);
  return children ? <>{children(text)}</> : <Txt style={style}>{text}</Txt>;
}
