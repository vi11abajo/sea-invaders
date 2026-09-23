import { Text, View, StyleSheet } from 'react-native';
import { COLORS, FONTS } from './tokens';

interface HeartsProps {
  /** Current lives. No upper bound — HEALTH_BOOST pickups can push this past 5. */
  lives: number;
  /** Glyph font size in dp. */
  size?: number;
  /** Space between hearts in dp; the in-run HUD packs them tighter than the campaign map header. */
  gap?: number;
}

const MAX_ROW = 5;

/**
 * Lives as heart glyphs (Task 19 owner rules, 2026-09-13): up to 5 lives draw one filled heart per
 * life in a row; above 5, a single heart carries the count instead of a longer row; 0 lives draws
 * five dim outline hearts. Used by the in-run HUD and the campaign map header.
 */
export function Hearts({ lives, size = 16, gap = 3 }: HeartsProps) {
  if (lives <= 0) {
    return (
      <View style={[styles.row, { gap }]}>
        {Array.from({ length: MAX_ROW }, (_, i) => (
          <Text key={i} style={[styles.glyph, styles.off, { fontSize: size }]}>
            ♡
          </Text>
        ))}
      </View>
    );
  }
  if (lives > MAX_ROW) {
    return (
      <View style={[styles.row, { gap }]}>
        <Text style={[styles.glyph, styles.on, { fontSize: size }]}>♥</Text>
        <Text style={[styles.count, { fontSize: size * 0.8 }]}>{lives}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.row, { gap }]}>
      {Array.from({ length: lives }, (_, i) => (
        <Text key={i} style={[styles.glyph, styles.on, { fontSize: size }]}>
          ♥
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  glyph: { fontFamily: FONTS.medium },
  on: { color: COLORS.success },
  off: { color: 'rgba(255,255,255,0.25)' },
  count: { fontFamily: FONTS.mono, color: COLORS.text },
});
