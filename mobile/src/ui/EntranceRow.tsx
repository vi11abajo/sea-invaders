import { useEffect, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

interface EntranceRowProps {
  /** This row's position in the list — sets its stagger delay. */
  index: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

const STAGGER_MS = 60;
const DURATION_MS = 220;
/** Caps the stagger so a long list's whole entrance still lands inside about 700 ms
 * (`8 * 60 + 220 = 700`); rows past this index all start together at the capped delay. */
const MAX_STAGGER_INDEX = 8;

/**
 * Animated List (React Bits `AnimatedList`): each row scales up from 0.7 and fades in once,
 * staggered by its own index. The entrance runs from a mount-only effect, so it plays once per row
 * — an unrelated re-render of the host list (the pull-to-refresh spinner, a score tick elsewhere)
 * never replays it; only a row that is genuinely new (a different `key` from its `FlatList`) mounts
 * fresh and animates in.
 */
export function EntranceRow({ index, children, style }: EntranceRowProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      Math.min(index, MAX_STAGGER_INDEX) * STAGGER_MS,
      withTiming(1, { duration: DURATION_MS, easing: Easing.out(Easing.cubic) }),
    );
    // Mount-only, by design — see the note above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.7 + progress.value * 0.3 }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
