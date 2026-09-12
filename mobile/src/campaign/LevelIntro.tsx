import type { CrabType, Formation, LevelSpec } from '@sea-invaders/core';
import { Pressable, StyleSheet, View } from 'react-native';
import { Backdrop } from '../ui/Backdrop';
import { PillButton } from '../ui/PillButton';
import { Sheet } from '../ui/Sheet';
import { Txt } from '../ui/Txt';
import { COLORS, RADIUS } from '../ui/tokens';
import { BOSS_NAMES, REEF_NAMES } from './CampaignScreen';

const FORMATION_NAMES: Record<Formation, string> = {
  grid: 'Grid', wedge: 'Wedge', wall: 'Wall', checker: 'Checker', columns: 'Columns', ring: 'Ring',
};

const CRAB_NAMES: Record<CrabType, string> = {
  normal: 'Normal', armored: 'Armored', swift: 'Swift', fanner: 'Fanner', diver: 'Diver',
};

interface LevelIntroProps {
  level: LevelSpec;
  practice: boolean;
  /** Lives the run will start with. */
  lives: number;
  onPlay: () => void;
  onBack: () => void;
}

/** The card shown before a level starts: what it is, and the Play button. */
export function LevelIntro({ level, practice, lives, onPlay, onBack }: LevelIntroProps) {
  const reefName = REEF_NAMES[level.reef - 1];

  return (
    <View style={styles.root}>
      <Backdrop variant="menu" />
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={4} style={styles.back}>
        <Txt variant="button">←</Txt>
      </Pressable>
      <View style={styles.head}>
        <Txt variant="label" tone="secondary">{`Level ${level.id} · ${reefName}`}</Txt>
        {practice && (
          <View style={styles.practiceTag}>
            <Txt variant="label" tone="onPrimary">Practice</Txt>
          </View>
        )}
      </View>
      <Sheet>
        {level.boss !== undefined ? (
          <>
            <Txt variant="headline">{BOSS_NAMES[level.boss - 1]}</Txt>
            <Txt variant="body" tone="secondary">{`${level.boss} phase${level.boss > 1 ? 's' : ''}`}</Txt>
          </>
        ) : (
          <>
            <Txt variant="headline">{FORMATION_NAMES[level.formation]}</Txt>
            <Txt variant="body" tone="secondary">{`${level.waves} wave${level.waves === 1 ? '' : 's'}`}</Txt>
            <View style={styles.chips}>
              {level.kinds.map((kind) => (
                <View key={kind} style={styles.chip}>
                  <Txt variant="secondary">{CRAB_NAMES[kind]}</Txt>
                </View>
              ))}
            </View>
          </>
        )}
        <Txt variant="body" tone="secondary">{`Lives to play with: ${lives}`}</Txt>
        <PillButton label="Play" onPress={onPlay} />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.app },
  back: {
    position: 'absolute', top: 28, left: 16, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.hudGlass, borderWidth: 1, borderColor: COLORS.glassBorder,
  },
  head: { position: 'absolute', top: 120, left: 0, right: 0, alignItems: 'center', gap: 10 },
  practiceTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.pill, backgroundColor: COLORS.success },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.pill,
    backgroundColor: COLORS.hudGlass, borderWidth: 1, borderColor: COLORS.glassBorder,
  },
});
