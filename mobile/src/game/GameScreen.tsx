import { Canvas, Picture, Skia } from '@shopify/react-native-skia';
import {
  EMPTY_FRAME, FixedStepper, INITIAL_INPUT, ReplayRecorder, createGame, fitField, snapshot, step, touchToInput,
  type Frame, type Input,
} from '@sea-invaders/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { drawFrame } from './draw';

/** Milli-units between the finger and the ship centre, so the finger never covers the ship. */
const FINGER_LIFT = 1200;

interface Hud {
  score: number;
  lives: number;
  wave: number;
  over: boolean;
  fps: number;
}

const START_HUD: Hud = { score: 0, lives: 3, wave: 1, over: false, fps: 0 };

export function GameScreen() {
  const { width, height } = useWindowDimensions();
  const layout = useMemo(() => fitField(width, height), [width, height]);
  const frame = useSharedValue<Frame>(EMPTY_FRAME);
  const input = useRef<Input>(INITIAL_INPUT);
  const [hud, setHud] = useState<Hud>(START_HUD);
  const [run, setRun] = useState(0);

  useEffect(() => {
    // Practice seed: the app may use the clock; only the core must not.
    const seed = `practice-${run}-${Date.now()}`;
    const state = createGame(seed);
    const recorder = new ReplayRecorder(seed);
    const stepper = new FixedStepper();
    input.current = INITIAL_INPUT;
    let shown = START_HUD;
    let frames = 0;
    let fpsSince = performance.now();
    let fps = 0;
    let handle = 0;

    const loop = () => {
      const now = performance.now();
      const ticks = stepper.advance(now);
      for (let i = 0; i < ticks && !state.over; i++) {
        recorder.record(state.tick + 1, input.current);
        step(state, input.current);
      }
      frame.value = snapshot(state);
      frames += 1;
      if (now - fpsSince >= 1000) {
        fps = Math.round((frames * 1000) / (now - fpsSince));
        frames = 0;
        fpsSince = now;
      }
      const next: Hud = { score: state.score, lives: state.ship.lives, wave: state.wave, over: state.over, fps };
      if (
        next.score !== shown.score || next.lives !== shown.lives || next.wave !== shown.wave ||
        next.over !== shown.over || next.fps !== shown.fps
      ) {
        shown = next;
        setHud(next);
      }
      if (!state.over) handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, [run, frame]);

  const recorder = useMemo(() => Skia.PictureRecorder(), []);
  const paint = useMemo(() => Skia.Paint(), []);
  const picture = useDerivedValue(() => {
    'worklet';
    return drawFrame(recorder, paint, frame.value, layout, width, height);
  });

  const onTouch = (e: GestureResponderEvent) => {
    input.current = touchToInput(layout, e.nativeEvent.pageX, e.nativeEvent.pageY, FINGER_LIFT);
  };

  return (
    <View style={styles.root}>
      <Canvas style={styles.fill}>
        <Picture picture={picture} />
      </Canvas>
      <View style={[styles.hud, { height: layout.offsetY }]}>
        <Text style={styles.hudText}>SCORE {hud.score}</Text>
        <Text style={styles.hudText}>WAVE {hud.wave}</Text>
        <Text style={styles.hudText}>LIVES {hud.lives}</Text>
        <Text style={styles.fps}>{hud.fps} FPS</Text>
      </View>
      <View
        style={styles.fill}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={onTouch}
        onResponderMove={onTouch}
      />
      {hud.over && (
        <View style={[styles.fill, styles.overlay]}>
          <Text style={styles.title}>Game over</Text>
          <Text style={styles.subtitle}>Score {hud.score}</Text>
          <Pressable
            style={styles.button}
            onPress={() => {
              setHud(START_HUD);
              setRun((r) => r + 1);
            }}
          >
            <Text style={styles.buttonText}>Play again</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000433' },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  hud: {
    position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'flex-end',
    justifyContent: 'space-around', paddingBottom: 8, pointerEvents: 'none',
  },
  hudText: { color: '#F8E3CC', fontSize: 16, fontWeight: '700' },
  fps: { color: '#CADEF0', fontSize: 12 },
  overlay: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 4, 51, 0.8)' },
  title: { color: '#F8E3CC', fontSize: 36, fontWeight: '800' },
  subtitle: { color: '#CADEF0', fontSize: 20, marginTop: 8, marginBottom: 32 },
  button: {
    minHeight: 56, minWidth: 200, paddingHorizontal: 24, borderRadius: 28, backgroundColor: '#4E9CFA',
    alignItems: 'center', justifyContent: 'center',
  },
  buttonText: { color: '#000433', fontSize: 20, fontWeight: '800' },
});
