import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

interface StarBorderProps {
  children: ReactNode;
  /** The orbiting glow's colour. */
  color?: string;
  /** One full orbit, ms — kept slow and subtle per the brief (about 4 s). */
  periodMs?: number;
  /** The glow dot's diameter, dp. */
  dotSize?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * A point on a capsule ("stadium": two straight edges plus two semicircle caps) perimeter, `t` in
 * [0, 1) going clockwise from the top-left. A worklet so `useAnimatedStyle` can call it every frame
 * without crossing back to the JS thread.
 */
function capsulePoint(t: number, w: number, h: number): { x: number; y: number } {
  'worklet';
  const r = h / 2;
  const straight = Math.max(0, w - h);
  const halfCirc = Math.PI * r;
  const perimeter = 2 * straight + 2 * halfCirc;
  if (perimeter <= 0) return { x: w / 2, y: h / 2 };
  let d = (((t % 1) + 1) % 1) * perimeter;
  if (d < straight) return { x: r + d, y: 0 };
  d -= straight;
  if (d < halfCirc) {
    const a = -Math.PI / 2 + d / r;
    return { x: r + straight + r * Math.cos(a), y: r + r * Math.sin(a) };
  }
  d -= halfCirc;
  if (d < straight) return { x: r + straight - d, y: h };
  d -= straight;
  const a2 = Math.PI / 2 + d / r;
  return { x: r + r * Math.cos(a2), y: r + r * Math.sin(a2) };
}

/**
 * Star Border (React Bits `StarBorder`): two glow dots orbiting a fully-rounded pill's own border in
 * opposite directions, slow and subtle. The reference slides two radial-gradient blobs along a CSS
 * `border-radius` shape; this walks the same capsule perimeter with a worklet (`capsulePoint`), so
 * both dots stay glued to the edge at whatever size `children` measures out to.
 */
export function StarBorder({ children, color = '#FFFFFF', periodMs = 4000, dotSize = 3, style }: StarBorderProps) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: periodMs, easing: Easing.linear }), -1, false);
  }, [progress, periodMs]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  }, []);

  // Two dots, opposite directions, half an orbit apart — one `useAnimatedStyle` call site each,
  // both unconditional every render.
  const dotAStyle = useAnimatedStyle(() => {
    const p = capsulePoint(progress.value, size.w, size.h);
    return { transform: [{ translateX: p.x - dotSize / 2 }, { translateY: p.y - dotSize / 2 }] };
  });
  const dotBStyle = useAnimatedStyle(() => {
    const p = capsulePoint(0.5 - progress.value, size.w, size.h);
    return { transform: [{ translateX: p.x - dotSize / 2 }, { translateY: p.y - dotSize / 2 }] };
  });
  const dotBase = { width: dotSize, height: dotSize, borderRadius: dotSize / 2, backgroundColor: color };

  return (
    <View style={style} onLayout={onLayout}>
      {children}
      {size.w > 0 && (
        <>
          <Animated.View pointerEvents="none" style={[styles.dot, dotBase, dotAStyle]} />
          <Animated.View pointerEvents="none" style={[styles.dot, dotBase, dotBStyle]} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    position: 'absolute', left: 0, top: 0, opacity: 0.85,
    shadowColor: '#FFFFFF', shadowOpacity: 0.9, shadowRadius: 3, shadowOffset: { width: 0, height: 0 },
  },
});
