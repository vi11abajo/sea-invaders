import { useCallback, useEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming, type WithSpringConfig, type WithTimingConfig,
} from 'react-native-reanimated';
import { Txt } from './Txt';
import { COLORS, FONTS, RADIUS } from './tokens';

export interface RubberSegmentItem<T extends string> {
  value: T;
  label: string;
}

interface RubberSegmentProps<T extends string> {
  items: readonly RubberSegmentItem<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}

const HEIGHT = 40;
const THUMB_INSET = 3;
/** Phase one of a tap-driven jump: the thumb's near edge races ahead while the far edge lags, so it
 * visibly stretches across the gap before both edges catch up to the target slot. */
const STRETCH_MS = 130;
const STRETCH_EASE: WithTimingConfig = { duration: STRETCH_MS, easing: Easing.out(Easing.cubic) };
/** Phase two: both edges spring onto the target slot; the spring's own underdamped overshoot reads
 * as the squash landing on it. */
const LAND_SPRING: WithSpringConfig = { stiffness: 300, damping: 15, mass: 0.9 };
/** A dragged thumb released mid-flight uses a slightly softer spring to its resting slot. */
const DRAG_SPRING: WithSpringConfig = { stiffness: 260, damping: 22, mass: 0.85 };
/** A release faster than this (px/ms) commits one slot further in the flick's direction. */
const FLICK_VELOCITY = 0.5;

interface Slot { x: number; w: number }

/**
 * Rubber Segment (React Bits `RubberSegment`): a pill-shaped segmented control whose thumb stretches
 * across the gap on a tap elsewhere, then squashes onto the target slot; dragging the thumb itself
 * scrubs between slots, with a fast release (flick) committing one slot further even short of the
 * midpoint. `react-native-gesture-handler` is not a dependency of this app, so the drag uses the core
 * `PanResponder`; the currently active slot's own `Pressable` is switched to `pointerEvents: 'none'`
 * so its taps fall through to the thumb underneath instead of re-selecting itself.
 */
export function RubberSegment<T extends string>({ items, value, onChange, disabled = false }: RubberSegmentProps<T>) {
  const [slots, setSlots] = useState<(Slot | null)[]>(() => items.map(() => null));
  const left = useSharedValue(0);
  const right = useSharedValue(0);
  const measured = useRef(false);
  const index = Math.max(0, items.findIndex((i) => i.value === value));
  const dragging = useRef(false);
  const dragStart = useRef({ left: 0, right: 0 });
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const indexRef = useRef(index);
  indexRef.current = index;

  const onItemLayout = useCallback((i: number) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    setSlots((s) => {
      const next = [...s];
      next[i] = { x, w: width };
      return next;
    });
  }, []);

  // First measurement: snap the thumb onto the current slot with no travel.
  useEffect(() => {
    if (measured.current) return;
    const slot = slots[index];
    if (!slot) return;
    measured.current = true;
    left.value = slot.x;
    right.value = slot.x + slot.w;
  }, [slots, index, left, right]);

  const travelTo = useCallback(
    (to: number) => {
      const slot = slotsRef.current[to];
      if (!slot) return;
      const spanL = Math.min(left.value, slot.x);
      const spanR = Math.max(right.value, slot.x + slot.w);
      left.value = withTiming(spanL, STRETCH_EASE, (done) => {
        if (done) left.value = withSpring(slot.x, LAND_SPRING);
      });
      right.value = withTiming(spanR, STRETCH_EASE, (done) => {
        if (done) right.value = withSpring(slot.x + slot.w, LAND_SPRING);
      });
    },
    [left, right],
  );

  const commit = useCallback(
    (to: number) => {
      const item = items[to];
      if (item !== undefined && item.value !== value) onChange(item.value);
    },
    [items, value, onChange],
  );

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onPanResponderGrant: () => {
        dragging.current = true;
        dragStart.current = { left: left.value, right: right.value };
      },
      onPanResponderMove: (_event, gesture) => {
        left.value = dragStart.current.left + gesture.dx;
        right.value = dragStart.current.right + gesture.dx;
      },
      onPanResponderRelease: (_event, gesture) => {
        dragging.current = false;
        const center = (left.value + right.value) / 2;
        let nearest = indexRef.current;
        let best = Infinity;
        slotsRef.current.forEach((s, i) => {
          if (!s) return;
          const d = Math.abs(s.x + s.w / 2 - center);
          if (d < best) {
            best = d;
            nearest = i;
          }
        });
        if (Math.abs(gesture.vx) > FLICK_VELOCITY && nearest === indexRef.current) {
          const dir = gesture.vx > 0 ? 1 : -1;
          nearest = Math.min(items.length - 1, Math.max(0, nearest + dir));
        }
        commit(nearest);
        const slot = slotsRef.current[nearest];
        if (slot) {
          left.value = withSpring(slot.x, DRAG_SPRING);
          right.value = withSpring(slot.x + slot.w, DRAG_SPRING);
        }
      },
      onPanResponderTerminate: () => {
        dragging.current = false;
        const slot = slotsRef.current[indexRef.current];
        if (slot) {
          left.value = withSpring(slot.x, DRAG_SPRING);
          right.value = withSpring(slot.x + slot.w, DRAG_SPRING);
        }
      },
    }),
  ).current;

  // A tap on another slot (or a programmatic value change) travels with the stretch-then-squash
  // motion; our own drag already drives `left`/`right` directly, so it is skipped here.
  const prevIndex = useRef(index);
  useEffect(() => {
    if (dragging.current) return;
    if (prevIndex.current === index) return;
    prevIndex.current = index;
    travelTo(index);
  }, [index, travelTo]);

  const thumbStyle = useAnimatedStyle(() => ({
    left: left.value,
    width: Math.max(0, right.value - left.value),
  }));

  return (
    <View style={styles.track} accessibilityRole="tablist">
      <Animated.View style={[styles.thumb, thumbStyle]} {...pan.panHandlers} />
      <View style={styles.row}>
        {items.map((item, i) => {
          const active = i === index;
          return (
            <View
              key={item.value}
              style={styles.item}
              onLayout={onItemLayout(i)}
              // The active slot's own tap target steps aside so it reaches the thumb's PanResponder
              // beneath it instead of re-selecting an already-selected slot.
              pointerEvents={active ? 'none' : 'auto'}
            >
              <Pressable
                accessibilityRole="tab"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: active, disabled }}
                disabled={disabled}
                onPress={() => commit(i)}
                style={StyleSheet.absoluteFill}
              />
              <Txt variant="button" style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
                {item.label}
              </Txt>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: HEIGHT, borderRadius: RADIUS.pill, backgroundColor: COLORS.secondary, overflow: 'hidden' },
  row: { flex: 1, flexDirection: 'row' },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textSecondary },
  labelActive: { color: COLORS.onPrimary },
  thumb: { position: 'absolute', top: THUMB_INSET, bottom: THUMB_INSET, borderRadius: RADIUS.pill, backgroundColor: COLORS.primary },
});
