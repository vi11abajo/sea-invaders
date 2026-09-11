import { StyleSheet, Text, View } from 'react-native';
import { GradientFill } from './GradientFill';
import { FONTS, RADIUS } from './tokens';

const BADGE_GRADIENT = ['#9945FF', '#19FB9B'] as const;

/** SEEKER: 9 dp semibold caps, +6% tracking, black on the purple-to-green gradient. */
export function SeekerBadge() {
  return (
    <View style={styles.badge}>
      <GradientFill radius={RADIUS.pill} colors={BADGE_GRADIENT} />
      <Text style={styles.text}>SEEKER</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', borderRadius: RADIUS.pill, overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 3 },
  text: { fontFamily: FONTS.semibold, fontSize: 9, letterSpacing: 0.54, color: '#000000' },
});
