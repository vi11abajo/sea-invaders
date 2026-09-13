import { Canvas, Image, type SkImage } from '@shopify/react-native-skia';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';
import {
  currentLevelId, formatInt, livesForEntry, LEVELS, REEFS, type CampaignProgress, type LevelSpec,
} from '@sea-invaders/core';
import { BOSS_NAMES } from '../game/bossNames';
import { useSprites } from '../game/sprites';
import { ArtSlot } from '../ui/ArtSlot';
import { Backdrop } from '../ui/Backdrop';
import { Hearts } from '../ui/Hearts';
import { PillButton } from '../ui/PillButton';
import { Txt } from '../ui/Txt';
import { COLORS, MOTION, REEF_PROGRESS } from '../ui/tokens';
import { reefProgress, REEF_LEGENDS, REEF_NAMES } from './reefs';

const NODE_SIZE = 48;
const BOSS_NODE_SIZE = 72;
const HERO_PORTRAIT_SIZE = 120;
const HERO_GLOW_SIZE = 180;
const LEVELS_PER_REEF = 6;

type NodeState = 'locked' | 'current' | 'cleared';

function nodeState(id: number, progress: CampaignProgress): NodeState {
  if (id === currentLevelId(progress)) return 'current';
  return progress.cleared[id - 1] ? 'cleared' : 'locked';
}

interface ReefScreenProps {
  reef: number;
  progress: CampaignProgress;
  onPlay: (id: number, practice: boolean) => void;
  /** Back to the reef list. */
  onBack: () => void;
}

/** One reef's own screen: its boss, its lore, and the six level nodes that make it up. */
export function ReefScreen({ reef, progress, onPlay, onBack }: ReefScreenProps) {
  const sprites = useSprites();
  const lives = livesForEntry(progress);
  const name = REEF_NAMES[reef - 1];
  const color = REEF_PROGRESS[reef - 1];
  const bossSprite = sprites?.bosses[reef - 1]?.[0] ?? null;

  const first = (reef - 1) * LEVELS_PER_REEF + 1;
  const ids = Array.from({ length: LEVELS_PER_REEF }, (_, i) => first + i);

  const shown = useSharedValue(0);
  useEffect(() => {
    shown.value = withTiming(1, { duration: MOTION.riseMs, easing: Easing.out(Easing.cubic) });
  }, [shown]);
  const rise = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * MOTION.riseOffset }],
  }));

  const rp = reefProgress(progress, reef);

  return (
    <View style={styles.root}>
      <Backdrop variant="menu" />
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={4} style={styles.back}>
          <Txt variant="button">←</Txt>
        </Pressable>
        <Txt variant="screenTitle" numberOfLines={1} style={styles.title}>
          {`Reef ${reef} · ${name}`}
        </Txt>
        <View style={styles.heartsSlot}>
          <Hearts lives={lives} />
        </View>
      </View>
      <Animated.View style={[styles.content, rise]}>
        <View style={styles.hero}>
          <View style={[styles.heroGlow, { backgroundColor: color }]} />
          {bossSprite ? (
            <Canvas style={styles.heroPortrait}>
              <Image image={bossSprite} x={0} y={0} width={HERO_PORTRAIT_SIZE} height={HERO_PORTRAIT_SIZE} fit="contain" />
            </Canvas>
          ) : (
            <ArtSlot size={HERO_PORTRAIT_SIZE} label="Boss" />
          )}
          <Txt variant="headline" style={styles.heroName}>
            {BOSS_NAMES[reef - 1]}
          </Txt>
          <Txt variant="mono" tone="secondary">
            {`${reef} phase${reef > 1 ? 's' : ''}`}
          </Txt>
        </View>
        <Txt variant="body" tone="secondary" style={styles.legend}>
          {REEF_LEGENDS[reef - 1]}
        </Txt>
        <View style={styles.nodes}>
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
        </View>
        <View style={styles.cta}>
          {rp.current && (
            <PillButton
              label={`Continue · Level ${currentLevelId(progress)}`}
              height={56}
              onPress={() => onPlay(currentLevelId(progress), false)}
            />
          )}
          {rp.reefCleared && (
            <View style={styles.ctaHint}>
              {reef === REEFS && (
                <Txt variant="secondary" tone="success">
                  Campaign complete
                </Txt>
              )}
              <Txt variant="secondary" tone="secondary">
                Replay any level in practice
              </Txt>
            </View>
          )}
          {rp.locked && <PillButton label={`Clear Reef ${reef - 1} first`} height={56} disabled />}
        </View>
      </Animated.View>
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

/** One level node on the reef screen: 1-5 numbered, or the boss portrait on the sixth. */
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
  title: { flex: 1 },
  heartsSlot: { flexDirection: 'row', alignItems: 'center' },
  content: { flex: 1, paddingHorizontal: 16, gap: 16 },
  hero: { alignItems: 'center', gap: 4 },
  heroGlow: { position: 'absolute', top: -30, width: HERO_GLOW_SIZE, height: HERO_GLOW_SIZE, borderRadius: HERO_GLOW_SIZE / 2, opacity: 0.24 },
  heroPortrait: { width: HERO_PORTRAIT_SIZE, height: HERO_PORTRAIT_SIZE },
  heroName: { marginTop: 8 },
  legend: { textAlign: 'center' },
  nodes: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: 8 },
  nodeWrap: { alignItems: 'center', gap: 4 },
  node: {
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    backgroundColor: COLORS.hudGlass, borderWidth: 1.5, borderColor: COLORS.glassBorder,
  },
  nodeLocked: { opacity: 0.4 },
  ring: { position: 'absolute', top: -4, left: -4, right: -4, bottom: -4, borderWidth: 2 },
  cta: { marginTop: 'auto', marginBottom: 28, alignItems: 'center' },
  ctaHint: { paddingVertical: 18, alignItems: 'center', gap: 4 },
});
