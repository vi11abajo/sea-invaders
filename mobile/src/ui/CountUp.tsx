import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { TextInput, type StyleProp, type TextInputProps, type TextStyle } from 'react-native';
import Animated, {
  cancelAnimation, Easing, runOnJS, useAnimatedProps, useAnimatedReaction, useSharedValue, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Txt } from './Txt';

interface CountUpBaseProps {
  value: number;
  /**
   * A starting value to count up from once, on mount (e.g. `0` for a result screen's score).
   * Omitted, the first render shows `value` outright with no entrance count-up — the Home balance
   * ticker's own shape, which only ever animates a later change to `value`, never its first mount.
   */
  from?: number;
  /** ms the count-up takes; ~800 for a balance/pool ticking up, ~1200 for a result screen's score. */
  duration?: number;
  style?: StyleProp<TextStyle>;
}

interface CountUpReTextProps extends CountUpBaseProps {
  mode?: 'retext';
  /**
   * Formats the live number for display. Must carry Reanimated's `'worklet'` directive (see
   * `formatIntWorklet` below): it runs inside `useAnimatedProps`, on the UI thread, and an arbitrary
   * imported JS function (`@sea-invaders/core`'s `formatInt`, `Intl`, …) is not itself compiled to
   * run there.
   */
  format?: (value: number) => string;
}

interface CountUpThrottledProps extends CountUpBaseProps {
  mode: 'throttled';
  /** A plain JS formatter (the app's own `formatInt`, a one-decimal SKR helper, …) — runs on the JS
   * thread inside React state, never inside a worklet; no `'worklet'` directive needed. */
  format?: (value: number) => string;
  /** The minimum real time between bridged updates, ms — see the component doc for the exact
   * cadence this bounds. Default 80. */
  minIntervalMs?: number;
  /** Renders the throttled, formatted text however the caller needs (through `ShinyText`,
   * `GradientText`, a Skia canvas neither mode can drive without React re-rendering it); defaults to
   * a plain `Txt`. */
  children?: (text: string) => ReactNode;
}

type CountUpProps = CountUpReTextProps | CountUpThrottledProps;

const DEFAULT_THROTTLE_MS = 80;

/** `String(Math.round(n))` — the default when no `format` is given, either mode. */
function defaultFormat(n: number): string {
  'worklet';
  return `${Math.round(n)}`;
}

/**
 * A worklet-safe port of `@sea-invaders/core`'s `formatInt` (18920 -> "18,920"; the fraction is
 * dropped). The exact same regex, just carrying the `'worklet'` directive — needed only for `mode:
 * 'retext'` (a plain re-export of the core helper cannot be called from inside `useAnimatedProps`);
 * `mode: 'throttled'` can use `formatInt` itself directly, since its `format` runs on the JS thread.
 */
export function formatIntWorklet(value: number): string {
  'worklet';
  const n = Math.trunc(value);
  const grouped = `${Math.abs(n)}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return n < 0 ? `-${grouped}` : grouped;
}

/** Drives `progress` from its previous value to `value` on change, eased over `duration`. Shared by
 * both display modes below. */
function useCountProgress(value: number, from: number | undefined, duration: number) {
  const start = from ?? value;
  const progress = useSharedValue(start);
  const previous = useRef(start);

  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    progress.value = withTiming(value, { duration, easing: Easing.out(Easing.cubic) });
    return () => cancelAnimation(progress);
  }, [value, duration, progress]);

  return { progress, start };
}

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

interface ReTextProps {
  progress: SharedValue<number>;
  start: number;
  format: (value: number) => string;
  style?: StyleProp<TextStyle>;
}

/**
 * The "ReText" pattern: `useAnimatedProps` sets the native `text` prop straight from the shared
 * value, entirely on the UI thread — no `useState`, no bridge crossing, ever. Cannot feed a Skia
 * canvas (see `CountUpThrottled` below for that case).
 */
function CountUpReText({ progress, start, format, style }: ReTextProps) {
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

interface ThrottledProps {
  progress: SharedValue<number>;
  /** The count-up's current target — a sample that lands exactly on this is the final one, and
   * always bridges regardless of the throttle (see the cadence note below). */
  targetValue: number;
  start: number;
  format: (value: number) => string;
  minIntervalMs: number;
  style?: StyleProp<TextStyle>;
  children?: (text: string) => ReactNode;
}

/**
 * The throttled bridge: `useAnimatedReaction` still samples `progress` on the UI thread every frame,
 * but only calls `setState` (via `runOnJS`) when at least `minIntervalMs` have passed since the last
 * one *and* the formatted string actually changed — never once per frame. The one exception is the
 * sample that lands exactly on `targetValue` (`withTiming`'s own last frame): that always bridges
 * immediately, so the count always ends on the exact value even if the throttle window would
 * otherwise have swallowed it. Cadence: at most one update per `minIntervalMs`, so a 1.2 s count
 * (`ResultView`'s score) makes at most ~15 of them, a 0.8 s one (the weekly pool) at most 10 — not
 * the ~60-120 a naïve per-frame bridge would make over the same span.
 */
function CountUpThrottled({ progress, targetValue, start, format, minIntervalMs, style, children }: ThrottledProps) {
  const [display, setDisplay] = useState(() => format(start));
  const lastBridgedAt = useRef(0);
  const lastText = useRef(format(start));

  const maybeUpdate = useCallback(
    (current: number) => {
      const isFinal = current === targetValue;
      const now = Date.now();
      if (!isFinal && now - lastBridgedAt.current < minIntervalMs) return;
      const text = format(current);
      if (!isFinal && text === lastText.current) return;
      lastBridgedAt.current = now;
      lastText.current = text;
      setDisplay(text);
    },
    [format, minIntervalMs, targetValue],
  );

  useAnimatedReaction(
    () => progress.value,
    (current) => {
      runOnJS(maybeUpdate)(current);
    },
    [maybeUpdate],
  );

  return children ? <>{children(display)}</> : <Txt style={style}>{display}</Txt>;
}

/**
 * Count Up (React Bits `CountUp`/`Counter`): counts from the previously displayed value to `value`
 * whenever it changes, eased over `duration`. Two ways to show the live number, picked by `mode`:
 *
 * - `'retext'` (default): the "ReText" pattern — see `CountUpReText` above. Zero React/JS-thread
 *   involvement, but can only render its own plain `TextInput`-backed text; used for the result
 *   score and the Home SKR balance.
 * - `'throttled'`: a rate-limited `useState` bridge — see `CountUpThrottled` above. Needed wherever
 *   the number has to feed something `text`-prop tricks can't reach, namely a Skia canvas
 *   (`ShinyText`'s sheen, `GradientText`'s signature gradient): both re-measure and redraw from a
 *   plain string prop, so the string still has to arrive through a real (just throttled) React
 *   update. Used for the result score's `GradientText` fill and the weekly pool's `ShinyText`.
 */
export function CountUp(props: CountUpProps) {
  const { value, from, duration = 800, style } = props;
  const { progress, start } = useCountProgress(value, from, duration);

  if (props.mode === 'throttled') {
    const { format = defaultFormat, minIntervalMs = DEFAULT_THROTTLE_MS, children } = props;
    return (
      <CountUpThrottled
        progress={progress}
        targetValue={value}
        start={start}
        format={format}
        minIntervalMs={minIntervalMs}
        style={style}
      >
        {children}
      </CountUpThrottled>
    );
  }

  const format = props.format ?? defaultFormat;
  return <CountUpReText progress={progress} start={start} format={format} style={style} />;
}
