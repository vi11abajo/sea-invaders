import { formatInt } from '@sea-invaders/core';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ArtSlot } from '../ui/ArtSlot';
import { GradientText } from '../ui/GradientText';
import { PillButton } from '../ui/PillButton';
import { Sheet } from '../ui/Sheet';
import { Txt } from '../ui/Txt';
import { COLORS, RADIUS } from '../ui/tokens';

export interface ResultStat {
  label: string;
  value: string;
}

interface ResultViewProps {
  /** e.g. "Run over"; shown in caps. */
  title: string;
  score: number;
  stats: ResultStat[];
  /** Small line under the primary button. */
  note?: string;
  onPlayAgain: () => void;
  /** Shows the round back button in the top-left corner. */
  onBack?: () => void;
  /** Extra content rendered below "Play again" and above `note` (e.g. the "Record score" action). */
  extra?: ReactNode;
}

/** End of a run: the score in the signature gradient, Octopi's pose and a sheet of stats and actions. */
export function ResultView({ title, score, stats, note, onPlayAgain, onBack, extra }: ResultViewProps) {
  return (
    <View style={styles.root}>
      {onBack !== undefined && (
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={4} style={styles.back}>
          <Txt variant="button">←</Txt>
        </Pressable>
      )}
      <View style={styles.head} pointerEvents="none">
        <Txt variant="label" tone="secondary" style={styles.title}>
          {title}
        </Txt>
        <GradientText text={formatInt(score)} size={72} />
      </View>
      <View style={styles.pose} pointerEvents="none">
        <ArtSlot size={120} label="Octopi" />
      </View>
      <Sheet>
        <View style={styles.tiles}>
          {stats.map((s) => (
            <View key={s.label} style={styles.tile}>
              <Txt variant="secondary" tone="tertiary" style={styles.tileLabel}>
                {s.label}
              </Txt>
              <Txt variant="mono" style={styles.tileValue}>
                {s.value}
              </Txt>
            </View>
          ))}
        </View>
        <PillButton label="Play again" onPress={onPlayAgain} />
        {extra}
        {note !== undefined && (
          <Txt variant="secondary" tone="tertiary" style={styles.note}>
            {note}
          </Txt>
        )}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  back: {
    position: 'absolute', top: 28, left: 16, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.hudGlass, borderWidth: 1, borderColor: COLORS.glassBorder,
  },
  head: { position: 'absolute', top: 120, left: 0, right: 0, alignItems: 'center', gap: 8 },
  title: { fontSize: 12, letterSpacing: 0.72 },
  pose: { position: 'absolute', top: 300, left: 0, right: 0, alignItems: 'center' },
  tiles: { flexDirection: 'row', gap: 6 },
  tile: { flex: 1, padding: 10, borderRadius: RADIUS.tile, backgroundColor: 'rgba(236,228,253,0.08)' },
  tileLabel: { fontSize: 10 },
  tileValue: { fontSize: 14, color: COLORS.text },
  note: { marginTop: -6, textAlign: 'center' },
});
