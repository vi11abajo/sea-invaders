import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import { ArtSlot } from '../ui/ArtSlot';
import { Txt } from '../ui/Txt';
import { COLORS, MOTION, REEF_LIFE } from '../ui/tokens';

const CRAB_ROW = [REEF_LIFE.lime, REEF_LIFE.mint, REEF_LIFE.lilac, REEF_LIFE.orange, REEF_LIFE.yellow];
/** How far a shot rises before it has faded out, in dp. */
const SHOT_RISE = 420;
const SHOT_MS = 1100;

interface HangarSceneProps {
  caption: string;
  onOctopi: () => void;
}

/** The idle world on Home: a far crab row swaying, and Octopi drifting and firing. Fills the space it is given. */
export function HangarScene({ caption, onOctopi }: HangarSceneProps) {
  const { width } = useWindowDimensions();
  const [areaHeight, setAreaHeight] = useState(0);
  // About 40% of the width, but smaller on short screens so the caption and the cards still fit.
  const hero = Math.max(96, Math.min(Math.round(width * 0.4), areaHeight - 150));

  const sway = useSharedValue<number>(-MOTION.swayOffset);
  const drift = useSharedValue(0);
  const shotA = useSharedValue(0);
  const shotB = useSharedValue(0);
  useEffect(() => {
    const ease = Easing.inOut(Easing.sin);
    sway.value = withRepeat(withTiming(MOTION.swayOffset, { duration: MOTION.swayMs, easing: ease }), -1, true);
    drift.value = withRepeat(withTiming(-MOTION.driftOffset, { duration: MOTION.driftMs / 2, easing: ease }), -1, true);
    shotA.value = withRepeat(withTiming(1, { duration: SHOT_MS, easing: Easing.linear }), -1, false);
    shotB.value = withDelay(SHOT_MS / 2, withRepeat(withTiming(1, { duration: SHOT_MS, easing: Easing.linear }), -1, false));
  }, [sway, drift, shotA, shotB]);

  const swayStyle = useAnimatedStyle(() => ({ transform: [{ translateX: sway.value }] }));
  const driftStyle = useAnimatedStyle(() => ({ transform: [{ translateY: drift.value }] }));
  const shotStyleA = useAnimatedStyle(() => ({ opacity: 1 - shotA.value, transform: [{ translateY: -SHOT_RISE * shotA.value }] }));
  const shotStyleB = useAnimatedStyle(() => ({ opacity: 1 - shotB.value, transform: [{ translateY: -SHOT_RISE * shotB.value }] }));

  const onLayout = (e: LayoutChangeEvent) => setAreaHeight(e.nativeEvent.layout.height);

  return (
    <View style={styles.area} onLayout={onLayout}>
      <Animated.View style={[styles.crabs, swayStyle]} pointerEvents="none">
        {CRAB_ROW.map((c) => (
          <ArtSlot key={c} size={36} color={c} />
        ))}
      </Animated.View>
      {areaHeight > 0 && (
        <View style={styles.heroZone}>
          <Animated.View style={driftStyle}>
            <Animated.View style={[styles.shot, { left: hero / 2 - 4.5 }, shotStyleA]} pointerEvents="none">
              <View style={styles.shotCore} />
            </Animated.View>
            <Animated.View style={[styles.shot, { left: hero / 2 - 4.5 }, shotStyleB]} pointerEvents="none">
              <View style={styles.shotCore} />
            </Animated.View>
            <Pressable accessibilityRole="button" accessibilityLabel="Octopi" onPress={onOctopi}>
              <ArtSlot size={hero} label="Octopi" />
            </Pressable>
          </Animated.View>
          <View style={styles.caption}>
            <View style={styles.captionDot} />
            <Txt variant="secondary" tone="secondary">{caption}</Txt>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  area: { flex: 1 },
  crabs: { flexDirection: 'row', justifyContent: 'center', gap: 14, opacity: 0.55, marginTop: 20 },
  heroZone: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  shot: {
    position: 'absolute', top: -26, width: 9, height: 24, borderRadius: 4, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(25,251,155,0.25)',
  },
  shotCore: { width: 3, height: 18, borderRadius: 2, backgroundColor: COLORS.success },
  caption: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  captionDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.success },
});
