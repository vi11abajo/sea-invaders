import { useCallback, useEffect, useRef } from 'react';
import { PanResponder, StyleSheet, View, type AccessibilityActionEvent, type GestureResponderEvent } from 'react-native';
import Animated, {
  interpolateColor, useAnimatedStyle, useSharedValue, withSequence, withSpring, type WithSpringConfig,
} from 'react-native-reanimated';
import { hapticTap } from '../audio/haptics';
import { COLORS, RADIUS } from './tokens';

const WIDTH = 52;
const HEIGHT = 30;
const INSET = 3;
const THUMB = HEIGHT - INSET * 2;
const MIN_X = INSET;
const MAX_X = WIDTH - INSET - THUMB;
/** Extra touch area so the 30 dp track still meets the 48 dp minimum tap target. */
const HIT_SLOP = { top: (48 - HEIGHT) / 2, bottom: (48 - HEIGHT) / 2, left: 4, right: 4 };
/** A drag shorter than this reads as a tap (flips the value) rather than a scrub. */
const TAP_SLOP = 3;
/** Caps how far the thumb stretches from a fast flick, as extra scale on top of 1. */
const MAX_STRETCH = 0.5;

const POSITION_SPRING: WithSpringConfig = { stiffness: 420, damping: 30, mass: 0.9 };
const SQUASH_SPRING: WithSpringConfig = { stiffness: 520, damping: 12, mass: 0.6 };
const SETTLE_SPRING: WithSpringConfig = { stiffness: 380, damping: 22, mass: 0.8 };

const TRACK_OFF = COLORS.secondary;
const TRACK_ON = COLORS.success;
const THUMB_OFF = COLORS.text;
const THUMB_ON = COLORS.onPrimary;

interface SquishSwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  /** What the switch controls, read out by TalkBack (the visible label is a separate sibling). */
  accessibilityLabel?: string;
}

const ACCESSIBILITY_ACTIONS = [{ name: 'activate' }] as const;

/**
 * Squish Switch (React Bits `SquishSwitch`): a scrubbable toggle whose thumb stretches with drag
 * speed, flips colour the moment it crosses the midpoint of the track, and gives one squash-then-
 * settle pulse when it lands (tap or release alike). Same `value`/`onValueChange` contract as the
 * RN `Switch` it replaces, so every call site swaps in unchanged.
 *
 * Drag uses `PanResponder` — `react-native-gesture-handler` is not a dependency of this app. The
 * travel position is a plain 0..1 `progress` shared value: sprung on a tap or a released drag,
 * written directly (still the shared value, never React state) while a finger is scrubbing it, so
 * nothing here re-renders per frame.
 */
export function SquishSwitch({ value, onValueChange, disabled = false, accessibilityLabel }: SquishSwitchProps) {
  const progress = useSharedValue(value ? 1 : 0);
  const scaleX = useSharedValue(1);
  const scaleY = useSharedValue(1);
  const valueRef = useRef(value);
  valueRef.current = value;
  const dragging = useRef(false);
  const startX = useRef(0);

  // An external change to `value` (not our own drag) springs the thumb to match, e.g. a "Reset
  // settings" action elsewhere. Skipped while a finger is already driving `progress` directly.
  useEffect(() => {
    if (dragging.current) return;
    progress.value = withSpring(value ? 1 : 0, POSITION_SPRING);
  }, [value, progress]);

  const squash = useCallback(() => {
    scaleX.value = withSequence(withSpring(1 - 0.15, SQUASH_SPRING), withSpring(1, SETTLE_SPRING));
    scaleY.value = withSequence(withSpring(1 + 0.18, SQUASH_SPRING), withSpring(1, SETTLE_SPRING));
  }, [scaleX, scaleY]);

  const commit = useCallback(
    (next: boolean) => {
      progress.value = withSpring(next ? 1 : 0, POSITION_SPRING);
      squash();
      if (next !== valueRef.current) {
        hapticTap();
        onValueChange(next);
      }
    },
    [progress, squash, onValueChange],
  );

  // A tap, without the responder: `onTouchStart`/`onTouchEnd` reach the view whether or not the
  // list scrolled it (a scroll ends in `onTouchCancel`, which toggles nothing), and `granted`
  // keeps a drag that ended near its start from toggling twice.
  const touchStart = useRef({ x: 0, y: 0 });
  const granted = useRef(false);
  const onTouchStart = useCallback((event: GestureResponderEvent) => {
    touchStart.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
    granted.current = false;
  }, []);
  const onTouchEnd = useCallback((event: GestureResponderEvent) => {
    const wasDrag = granted.current;
    granted.current = false;
    if (disabled || wasDrag) return;
    const dx = event.nativeEvent.pageX - touchStart.current.x;
    const dy = event.nativeEvent.pageY - touchStart.current.y;
    if (Math.hypot(dx, dy) <= TAP_SLOP) commit(!valueRef.current);
  }, [commit, disabled]);

  // TalkBack's double-tap arrives as the `activate` action, not as touches: it flips the value too.
  const onAccessibilityAction = useCallback((event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'activate' && !disabled) commit(!valueRef.current);
  }, [commit, disabled]);

  const pan = useRef(
    PanResponder.create({
      // Never claimed on touch-down: on Android a start claim is what makes the parent
      // `ScrollView` (Profile) give up the touch, so a vertical scroll that begins on the switch
      // would die here. The switch only takes a horizontal-dominant, past-slop move (a drag); a
      // plain tap is handled by the `onTouchEnd` below, outside the responder system.
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_event, gesture) => (
        !disabled && Math.abs(gesture.dx) > Math.abs(gesture.dy) && Math.abs(gesture.dx) > 2
      ),
      onPanResponderGrant: () => {
        granted.current = true;
        dragging.current = true;
        startX.current = MIN_X + progress.value * (MAX_X - MIN_X);
      },
      onPanResponderMove: (_event, gesture) => {
        const x = Math.min(MAX_X, Math.max(MIN_X, startX.current + gesture.dx));
        const stretch = Math.min(MAX_STRETCH, Math.abs(gesture.vx) * 0.9);
        scaleX.value = 1 + stretch;
        scaleY.value = 1 / (1 + stretch);
        progress.value = (x - MIN_X) / (MAX_X - MIN_X);
      },
      onPanResponderRelease: (_event, gesture) => {
        dragging.current = false;
        const moved = Math.abs(gesture.dx) > TAP_SLOP;
        commit(moved ? progress.value > 0.5 : !valueRef.current);
      },
      onPanResponderTerminate: () => {
        dragging.current = false;
        commit(valueRef.current);
      },
    }),
  ).current;

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [TRACK_OFF, TRACK_ON]),
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: MIN_X + progress.value * (MAX_X - MIN_X) },
      { scaleX: scaleX.value },
      { scaleY: scaleY.value },
    ],
    // The reference's "flips at the midpoint": a hard snap, not a cross-fade, so the flip reads as
    // part of the squash rather than a second competing animation.
    backgroundColor: progress.value > 0.5 ? THUMB_ON : THUMB_OFF,
  }));

  return (
    <View
      {...pan.panHandlers}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      accessible
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      accessibilityActions={ACCESSIBILITY_ACTIONS}
      onAccessibilityAction={onAccessibilityAction}
      hitSlop={HIT_SLOP}
      style={disabled && styles.disabled}
    >
      <Animated.View style={[styles.track, trackStyle]}>
        <Animated.View style={[styles.thumb, thumbStyle]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: WIDTH, height: HEIGHT, borderRadius: RADIUS.pill, justifyContent: 'center',
  },
  thumb: {
    position: 'absolute', left: 0, width: THUMB, height: THUMB, borderRadius: THUMB / 2,
  },
  disabled: { opacity: 0.4 },
});
