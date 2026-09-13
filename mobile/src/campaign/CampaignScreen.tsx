import { Canvas, Image, type SkImage } from '@shopify/react-native-skia';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { currentLevelId, formatInt, livesForEntry, LEVELS, type CampaignProgress, type LevelSpec } from '@sea-invaders/core';
import { useSprites } from '../game/sprites';
import { ArtSlot } from '../ui/ArtSlot';
import { Backdrop } from '../ui/Backdrop';
import { Hearts } from '../ui/Hearts';
import { Txt } from '../ui/Txt';
import { COLORS, RADIUS, REEF_PROGRESS } from '../ui/tokens';

/** Reef 1..5 display names: spec §7. Shared with LevelIntro and BossIntro. */
export const REEF_NAMES = ['Kelp Shallows', 'Coral Ridge', 'Sunlit Trench', 'Crimson Deep', 'The Void'] as const;

const NODE_SIZE = 48;
const BOSS_NODE_SIZE = 72;

type NodeState = 'locked' | 'current' | 'cleared';

function nodeState(id: number, progress: CampaignProgress): NodeState {
  if (id === currentLevelId(progress)) return 'current';
  return progress.cleared[id - 1] ? 'cleared' : 'locked';
}

interface CampaignScreenProps {
  progress: CampaignProgress;
  onPlay: (id: number, practice: boolean) => void;
  onBack: () => void;
  /** False shows the "Not synced" hint; the caller passes true while signed out. */
  synced?: boolean;
}

/** The campaign map: five reef cards, each with its six level nodes. */
export function CampaignScreen({ progress, onPlay, onBack, synced = true }: CampaignScreenProps) {
  const sprites = useSprites();
  const lives = livesForEntry(progress);

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
            progress={progress}
            // Static preview: the first of the two extracted GIF frames (draw.ts animates both in-run).
            bossSprite={sprites?.bosses[i]?.[0] ?? null}
            onPlay={onPlay}
          />
        ))}
      </ScrollView>
    </View>
  );
}

interface ReefCardProps {
  reef: number;
  name: string;
  progress: CampaignProgress;
  bossSprite: SkImage | null;
  onPlay: (id: number, practice: boolean) => void;
}

function ReefCard({ reef, name, progress, bossSprite, onPlay }: ReefCardProps) {
  const first = (reef - 1) * 6 + 1;
  const ids = Array.from({ length: 6 }, (_, i) => first + i);
  const color = REEF_PROGRESS[reef - 1];

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={[styles.reefDot, { backgroundColor: color }]} />
        <Txt variant="headline">{name}</Txt>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nodes}>
        {ids.map((id) => {
          const level = LEVELS[id - 1];
          const state = nodeState(id, progress);
          const boss = level.boss !== undefined;
          return (
            <LevelNode
              key={id}
              level={level}
              state={state}
              boss={boss}
              bossSprite={boss ? bossSprite : null}
              color={color}
              best={progress.best[id - 1] ?? 0}
              onPress={() => onPlay(id, state === 'cleared')}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

interface LevelNodeProps {
  level: LevelSpec;
  state: NodeState;
  boss: boolean;
  bossSprite: SkImage | null;
  color: string;
  best: number;
  onPress: () => void;
}

function LevelNode({ level, state, boss, bossSprite, color, best, onPress }: LevelNodeProps) {
  const size = boss ? BOSS_NODE_SIZE : NODE_SIZE;
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (state !== 'current') return;
    pulse.value = withRepeat(withTiming(0.4, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => {
      pulse.value = 1;
    };
  }, [state, pulse]);

  const ringStyle = useAnimatedStyle(() => ({ opacity: state === 'current' ? pulse.value : 0 }));
  const tappable = state !== 'locked';

  return (
    <View style={styles.nodeWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={boss ? `Level ${level.id} boss` : `Level ${level.id}`}
        accessibilityState={{ disabled: !tappable }}
        disabled={!tappable}
        onPress={onPress}
        style={[
          styles.node,
          { width: size, height: size, borderRadius: size / 2 },
          state === 'locked' && styles.nodeLocked,
          state !== 'locked' && { borderColor: color },
        ]}
      >
        {boss && bossSprite ? (
          <Canvas style={{ width: size, height: size }}>
            <Image image={bossSprite} x={0} y={0} width={size} height={size} fit="contain" />
          </Canvas>
        ) : boss ? (
          <ArtSlot size={size * 0.7} />
        ) : (
          <Txt variant="mono" tone={state === 'locked' ? 'tertiary' : 'primary'}>
            {level.index}
          </Txt>
        )}
        {state === 'current' && (
          <Animated.View
            pointerEvents="none"
            style={[styles.ring, { borderRadius: size / 2 + 4, borderColor: color }, ringStyle]}
          />
        )}
      </Pressable>
      {state === 'cleared' && (
        <Txt variant="monoSmall" tone="secondary">
          {formatInt(best)}
        </Txt>
      )}
    </View>
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
  heartsSlot: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
  list: { paddingHorizontal: 16, paddingBottom: 28, gap: 14 },
  card: {
    borderRadius: RADIUS.card, padding: 14, gap: 12, backgroundColor: COLORS.glass,
    borderWidth: 1, borderColor: COLORS.glassBorder,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reefDot: { width: 8, height: 8, borderRadius: 4 },
  nodes: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  nodeWrap: { alignItems: 'center', gap: 4 },
  node: {
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    backgroundColor: COLORS.hudGlass, borderWidth: 1.5, borderColor: COLORS.glassBorder,
  },
  nodeLocked: { opacity: 0.4 },
  ring: { position: 'absolute', top: -4, left: -4, right: -4, bottom: -4, borderWidth: 2 },
});
