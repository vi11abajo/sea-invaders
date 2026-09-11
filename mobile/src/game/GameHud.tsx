import { formatInt } from '@sea-invaders/core';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GradientFill } from '../ui/GradientFill';
import { COLORS, FONTS, RADIUS } from '../ui/tokens';

export interface HudBoost {
  name: string;
  color: string;
  seconds: number;
}

interface GameHudProps {
  /** Mode label, e.g. "PRACTICE" or "DAILY · SEED #214". */
  mode: string;
  score: number;
  lives: number;
  maxLives?: number;
  /** Shown only when the core reports a combo. */
  combo?: number;
  /** Shown only when the core reports active boosts. */
  boosts?: HudBoost[];
  hint?: string;
  onPause: () => void;
}

/** The in-run HUD over the world. Only the pause button takes touches. */
export function GameHud({ mode, score, lives, maxLives = 3, combo, boosts, hint, onPause }: GameHudProps) {
  return (
    <View style={styles.root} pointerEvents="box-none">
      <View style={styles.top} pointerEvents="none">
        <View style={[styles.glass, styles.scoreCard]}>
          <Text style={styles.mode}>{mode}</Text>
          <Text style={styles.score}>{formatInt(score)}</Text>
        </View>
        <View style={styles.right}>
          <View style={[styles.glass, styles.pill, styles.lives]}>
            {Array.from({ length: maxLives }, (_, i) => (
              <View key={i} style={[styles.dot, i < lives ? styles.dotOn : styles.dotOff]} />
            ))}
          </View>
          {combo !== undefined && <ComboPill combo={combo} />}
        </View>
      </View>
      {boosts !== undefined && boosts.length > 0 && (
        <View style={styles.boosts} pointerEvents="none">
          {boosts.map((b) => (
            <View key={b.name} style={[styles.glass, styles.pill, styles.chip]}>
              <View style={[styles.chipDot, { backgroundColor: b.color }]} />
              <Text style={styles.chipName}>{b.name}</Text>
              <Text style={styles.chipTime}>{`${b.seconds}s`}</Text>
            </View>
          ))}
        </View>
      )}
      {hint !== undefined && (
        <Text style={styles.hint} pointerEvents="none">
          {hint}
        </Text>
      )}
      <Pressable accessibilityRole="button" accessibilityLabel="Pause" onPress={onPause} style={[styles.glass, styles.pause]}>
        <View style={styles.pauseBar} />
        <View style={styles.pauseBar} />
      </Pressable>
    </View>
  );
}

/** Combo multiplier; from x4 it turns into a gradient pill with black text. */
function ComboPill({ combo }: { combo: number }) {
  const hot = combo >= 4;
  return (
    <View style={[styles.glass, styles.pill, styles.combo]}>
      {hot && <GradientFill radius={RADIUS.pill} />}
      <Text style={[styles.comboText, hot && styles.comboHot]}>{`×${combo}`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  top: { position: 'absolute', top: 28, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  glass: { backgroundColor: COLORS.hudGlass, borderWidth: 1, borderColor: COLORS.glassBorder },
  scoreCard: { borderRadius: RADIUS.hudCard, paddingHorizontal: 14, paddingVertical: 10 },
  mode: { fontFamily: FONTS.medium, fontSize: 10, letterSpacing: 0.4, color: COLORS.textSecondary },
  score: { fontFamily: FONTS.mono, fontSize: 26, lineHeight: 30, letterSpacing: -0.52, color: COLORS.text },
  right: { alignItems: 'flex-end', gap: 6 },
  pill: { borderRadius: RADIUS.pill, overflow: 'hidden' },
  lives: { flexDirection: 'row', gap: 5, paddingHorizontal: 10, paddingVertical: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotOn: { backgroundColor: COLORS.success },
  dotOff: { backgroundColor: 'rgba(255,255,255,0.2)' },
  combo: { paddingHorizontal: 10, paddingVertical: 6 },
  comboText: { fontFamily: FONTS.mono, fontSize: 13, color: COLORS.text },
  comboHot: { color: COLORS.onPrimary },
  boosts: { position: 'absolute', top: 104, left: 16, flexDirection: 'row', gap: 6 },
  chip: { height: 26, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  chipName: { fontFamily: FONTS.regular, fontSize: 11, color: COLORS.text },
  chipTime: { fontFamily: FONTS.mono, fontSize: 11, color: COLORS.textSecondary },
  hint: { position: 'absolute', left: 16, right: 80, bottom: 44, fontFamily: FONTS.regular, fontSize: 11, color: 'rgba(255,255,255,0.55)' },
  pause: {
    position: 'absolute', right: 16, bottom: 28, width: 48, height: 48, borderRadius: 24,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  pauseBar: { width: 4, height: 14, borderRadius: 1, backgroundColor: COLORS.text },
});
