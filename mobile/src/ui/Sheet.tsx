import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { COLORS, MOTION, RADIUS } from './tokens';

interface SheetProps {
  children: ReactNode;
  /** 'world' sits on the game world; 'modal' floats over a dimmed scrim that swallows touches. */
  kind?: 'world' | 'modal';
}

/** A bottom sheet that rises in. */
export function Sheet({ children, kind = 'world' }: SheetProps) {
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.value = withTiming(1, { duration: MOTION.riseMs, easing: Easing.out(Easing.cubic) });
  }, [shown]);
  const rise = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * MOTION.riseOffset }],
  }));

  if (kind === 'modal') {
    return (
      <View style={styles.scrim} onStartShouldSetResponder={() => true}>
        <Animated.View style={[styles.modal, rise]}>{children}</Animated.View>
      </View>
    );
  }
  return <Animated.View style={[styles.world, rise]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end',
    padding: 16, paddingBottom: 28, backgroundColor: COLORS.scrim,
  },
  modal: {
    gap: 14, paddingHorizontal: 20, paddingVertical: 22, borderRadius: RADIUS.modal,
    backgroundColor: COLORS.modalSheet, borderWidth: 1, borderColor: COLORS.glassBorder,
  },
  world: {
    position: 'absolute', left: 0, right: 0, bottom: 0, gap: 14, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 28,
    borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet, backgroundColor: COLORS.sheet,
    borderTopWidth: 1, borderColor: COLORS.glassBorder,
  },
});
