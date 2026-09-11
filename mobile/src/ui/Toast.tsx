import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Txt } from './Txt';
import { COLORS, MOTION, RADIUS } from './tokens';

interface ToastProps {
  text: string;
  dot?: string;
  onHide: () => void;
}

/** A short message at the top of the screen that hides itself. Give it a new key to show another one. */
export function Toast({ text, dot = COLORS.success, onHide }: ToastProps) {
  const hide = useRef(onHide);
  hide.current = onHide;
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.value = withTiming(1, { duration: MOTION.toastInMs, easing: Easing.out(Easing.cubic) });
    const timer = setTimeout(() => hide.current(), MOTION.toastHoldMs);
    return () => clearTimeout(timer);
  }, [shown]);
  const rise = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (shown.value - 1) * MOTION.riseOffset }],
  }));
  return (
    <Animated.View style={[styles.toast, rise]} pointerEvents="none">
      <View style={[styles.dot, { backgroundColor: dot }]} />
      <Txt style={styles.text}>{text}</Txt>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute', top: 28, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: RADIUS.toast, backgroundColor: COLORS.toast,
    borderWidth: 1, borderColor: COLORS.glassBorder,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { flex: 1 },
});
