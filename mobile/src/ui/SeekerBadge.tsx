import { InstrumentSans_600SemiBold } from '@expo-google-fonts/instrument-sans/600SemiBold';
import { StyleSheet } from 'react-native';
import { GradientFill } from './GradientFill';
import { ShinyText } from './ShinyText';
import { StarBorder } from './StarBorder';
import { RADIUS } from './tokens';

const BADGE_GRADIENT = ['#9945FF', '#19FB9B'] as const;
/** The label's Skia size, dp — the RN `Text` it replaces was 9 dp semibold (the +6% tracking that
 * gave it does not carry over to Skia's `Text`, which has no letter-spacing of its own; at 9 dp the
 * loss reads as negligible). */
const LABEL_SIZE = 9;

/**
 * SEEKER: a metallic sheen sweeping across the black label, on the purple-to-green gradient pill,
 * with a thin star-glow orbiting the pill's own rounded border (Star Border, kept subtle: a 4 s
 * orbit, two dim 3 dp dots).
 */
export function SeekerBadge() {
  return (
    <StarBorder style={styles.badge} periodMs={4000}>
      <GradientFill radius={RADIUS.pill} colors={BADGE_GRADIENT} />
      <ShinyText
        text="SEEKER"
        fontSource={InstrumentSans_600SemiBold}
        size={LABEL_SIZE}
        color="#000000"
        shineColor="#FFFFFF"
        periodMs={3200}
      />
    </StarBorder>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', borderRadius: RADIUS.pill, overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 3 },
});
