import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { COLORS, FONTS, MOTION } from '../ui/tokens';

export interface TickerItem {
  text: string;
  /** Shown in green right after the text. */
  highlight: string;
}

/** A slow marquee of short facts. The items are drawn twice so the loop is seamless. */
export function Ticker({ items }: { items: TickerItem[] }) {
  const [loopWidth, setLoopWidth] = useState(0);
  const x = useSharedValue(0);

  useEffect(() => {
    if (loopWidth === 0) return;
    x.value = 0;
    x.value = withRepeat(withTiming(-loopWidth, { duration: MOTION.tickerMs, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(x);
  }, [loopWidth, x]);

  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const onLayout = (e: LayoutChangeEvent) => setLoopWidth(e.nativeEvent.layout.width);

  const copy = (key: string, measure: boolean) => (
    <View style={styles.copy} onLayout={measure ? onLayout : undefined}>
      {items.map((it, i) => (
        <Text key={`${key}${i}`} style={styles.item} numberOfLines={1}>
          {it.text}
          <Text style={styles.highlight}>{it.highlight}</Text>
        </Text>
      ))}
    </View>
  );

  return (
    <View style={styles.clip} pointerEvents="none">
      <Animated.View style={[styles.row, slide]}>
        {copy('a', true)}
        {copy('b', false)}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  row: { flexDirection: 'row', alignSelf: 'flex-start' },
  copy: { flexDirection: 'row', flexShrink: 0, gap: 40, paddingRight: 40 },
  item: { fontFamily: FONTS.mono, fontSize: 11, color: 'rgba(255,255,255,0.55)' },
  highlight: { color: COLORS.success },
});
