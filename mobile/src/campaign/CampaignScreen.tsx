import { Canvas, Image, type SkImage } from '@shopify/react-native-skia';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { livesForEntry, type CampaignProgress } from '@sea-invaders/core';
import { useSprites } from '../game/sprites';
import { Backdrop } from '../ui/Backdrop';
import { Glass } from '../ui/Glass';
import { Hearts } from '../ui/Hearts';
import { Txt } from '../ui/Txt';
import { COLORS, REEF_PROGRESS } from '../ui/tokens';
import { REEF_LEGENDS, REEF_NAMES } from './reefs';

const BOSS_PORTRAIT_SIZE = 48;
const ACCENT_WIDTH = 4;
const REEF_COUNT = REEF_NAMES.length;
const LEVELS_PER_REEF = 6;
const LEVEL_COUNT = REEF_COUNT * LEVELS_PER_REEF;

type ReefState = 'cleared' | 'current' | 'ahead';

function reefState(reef: number, progress: CampaignProgress): ReefState {
  if (reef < progress.reef) return 'cleared';
  if (reef === progress.reef) return 'current';
  return 'ahead';
}

interface CampaignScreenProps {
  progress: CampaignProgress;
  onOpenReef: (reef: number) => void;
  onBack: () => void;
  /** False shows the "Not synced" hint; the caller passes true while signed out. */
  synced?: boolean;
}

/** The campaign home: five reef cards, each a short legend and its own clear progress. */
export function CampaignScreen({ progress, onOpenReef, onBack, synced = true }: CampaignScreenProps) {
  const sprites = useSprites();
  const lives = livesForEntry(progress);
  const clearedCount = progress.cleared.filter(Boolean).length;

  return (
    <View style={styles.root}>
      <Backdrop variant="menu" />
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={4} style={styles.back}>
          <Txt variant="button">←</Txt>
        </Pressable>
        <Txt variant="screenTitle">Campaign</Txt>
        <View style={styles.heartsSlot}>
          <Hearts lives={lives} />
          <Txt variant="mono" tone="secondary">
            {`${clearedCount} / ${LEVEL_COUNT} cleared`}
          </Txt>
        </View>
      </View>
      {!synced && (
        <Txt variant="secondary" tone="tertiary" style={styles.syncHint}>
          Not synced
        </Txt>
      )}
      <ScrollView contentContainerStyle={styles.list}>
        {REEF_NAMES.map((name, i) => (
          <ReefCard
            key={name}
            reef={i + 1}
            name={name}
            legend={REEF_LEGENDS[i]}
            state={reefState(i + 1, progress)}
            clearedInReef={progress.level - 1}
            // Static preview: the first of the two extracted GIF frames (draw.ts animates both in-run).
            bossSprite={sprites?.bosses[i]?.[0] ?? null}
            onPress={() => onOpenReef(i + 1)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

interface ReefCardProps {
  reef: number;
  name: string;
  legend: string;
  state: ReefState;
  /** Levels already cleared in the *current* reef; only meaningful when `state === 'current'`. */
  clearedInReef: number;
  bossSprite: SkImage | null;
  onPress: () => void;
}

function ReefCard({ reef, name, legend, state, clearedInReef, bossSprite, onPress }: ReefCardProps) {
  const color = REEF_PROGRESS[reef - 1];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Reef ${reef}, ${name}`}
      onPress={onPress}
      style={state === 'ahead' && styles.cardAhead}
    >
      <Glass style={[styles.card, state === 'current' && styles.cardCurrent]}>
        <View style={[styles.accent, { backgroundColor: color }]} />
        <View style={styles.cardBody}>
          <View style={styles.cardRow}>
            <Txt variant="button" tone="primary" style={styles.reefTitle} numberOfLines={1}>
              {`Reef ${reef} · ${name}`}
            </Txt>
            {bossSprite ? (
              <Canvas style={styles.bossPortrait}>
                <Image image={bossSprite} x={0} y={0} width={BOSS_PORTRAIT_SIZE} height={BOSS_PORTRAIT_SIZE} fit="contain" />
              </Canvas>
            ) : (
              <View style={styles.bossPortrait} />
            )}
          </View>
          <Txt variant="secondary" tone="secondary" numberOfLines={2}>
            {legend}
          </Txt>
          {state === 'cleared' && (
            <Txt variant="monoSmall" tone="success">
              Cleared
            </Txt>
          )}
          {state === 'current' && (
            <Txt variant="monoSmall" tone="secondary">
              {`${clearedInReef} / ${LEVELS_PER_REEF} levels`}
            </Txt>
          )}
          {state === 'ahead' && (
            <Txt variant="monoSmall" tone="tertiary">
              Locked
            </Txt>
          )}
        </View>
      </Glass>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.app },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 28, paddingBottom: 12,
  },
  back: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.hudGlass, borderWidth: 1, borderColor: COLORS.glassBorder,
  },
  syncHint: { paddingHorizontal: 16, marginBottom: 4 },
  heartsSlot: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10 },
  list: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  card: { flexDirection: 'row' },
  cardCurrent: { borderWidth: 1.5, borderColor: COLORS.text, backgroundColor: 'rgba(255,255,255,0.14)' },
  cardAhead: { opacity: 0.5 },
  accent: { width: ACCENT_WIDTH },
  cardBody: { flex: 1, padding: 12, gap: 8 },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  reefTitle: { flex: 1, fontSize: 15 },
  bossPortrait: { width: BOSS_PORTRAIT_SIZE, height: BOSS_PORTRAIT_SIZE },
});
