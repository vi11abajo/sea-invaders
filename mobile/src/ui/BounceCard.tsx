import { useEffect, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, type WithSpringConfig } from 'react-native-reanimated';

interface BounceCardProps {
  /** This card's position in its grid/row — sets its stagger delay. */
  index: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** An underdamped spring so the card visibly overshoots past 1 before settling — the reference's own
 * `elastic.out(1, 0.8)` gsap ease. */
const BOUNCE_SPRING: WithSpringConfig = { stiffness: 260, damping: 14, mass: 0.7 };
const STAGGER_MS = 60;
/** Caps the stagger so a long grid's whole entrance still lands inside about 700 ms. */
const MAX_STAGGER_INDEX = 8;

/**
 * Bounce Cards (React Bits `BounceCards`): each card scales up from 0 with a bouncy spring,
 * staggered by its own index. Runs once from a mount-only effect (see `EntranceRow`'s note — the
 * same rule applies here: only a genuinely new card, mounted fresh, plays this).
 */
export function BounceCard({ index, children, style }: BounceCardProps) {
  const scale = useSharedValue(0);

  useEffect(() => {
    scale.value = withDelay(Math.min(index, MAX_STAGGER_INDEX) * STAGGER_MS, withSpring(1, BOUNCE_SPRING));
    // Mount-only, by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
