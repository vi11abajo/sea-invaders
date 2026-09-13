import { Canvas, Image } from '@shopify/react-native-skia';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useSprites } from '../game/sprites';
import { ArtSlot } from '../ui/ArtSlot';
import { Txt } from '../ui/Txt';
import { BOSS_NAMES } from '../game/bossNames';

/** Spec §7: 90 ticks at 60/s. */
const AUTO_ADVANCE_MS = 1500;
const SPRITE_SIZE = 160;

interface BossIntroProps {
  kind: 1 | 2 | 3 | 4 | 5;
  onDone: () => void;
}

/** The boss reveal card shown right before its fight starts: sprite and name over a dark backdrop. */
export function BossIntro({ kind, onDone }: BossIntroProps) {
  const sprites = useSprites();
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const timer = setTimeout(() => onDoneRef.current(), AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, []);

  // Static preview: the first of the two extracted GIF frames (draw.ts animates both in-run).
  const sprite = sprites?.bosses[kind - 1]?.[0] ?? null;

  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Continue" onPress={onDone} style={styles.root}>
      {sprite ? (
        <Canvas style={{ width: SPRITE_SIZE, height: SPRITE_SIZE }}>
          <Image image={sprite} x={0} y={0} width={SPRITE_SIZE} height={SPRITE_SIZE} fit="contain" />
        </Canvas>
      ) : (
        <ArtSlot size={SPRITE_SIZE} label="Boss" />
      )}
      <Txt variant="headline">{BOSS_NAMES[kind - 1]}</Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center', justifyContent: 'center', gap: 16,
  },
});
