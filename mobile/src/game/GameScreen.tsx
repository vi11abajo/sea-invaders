import { Canvas, Picture, Skia } from '@shopify/react-native-skia';
import {
  EMPTY_FRAME, FixedStepper, INITIAL_INPUT, REPLAY_MODE, ReplayRecorder, createGame, fitField, formatInt, snapshot, step,
  touchToInput, type Frame, type Input,
} from '@sea-invaders/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { Backdrop } from '../ui/Backdrop';
import { COLORS, FONTS } from '../ui/tokens';
import { GameHud } from './GameHud';
import { PauseSheet } from './PauseSheet';
import { ResultView } from './ResultView';
import { drawFrame } from './draw';

/** Milli-units between the finger and the ship centre, so the finger never covers the ship. */
const FINGER_LIFT = 600;

const HINT = 'Drag anywhere — ship follows above your finger. Auto-fire.';

interface Hud {
  score: number;
  lives: number;
  wave: number;
  kills: number;
  over: boolean;
  fps: number;
}

const START_HUD: Hud = { score: 0, lives: 3, wave: 1, kills: 0, over: false, fps: 0 };

export function GameScreen() {
  const { width, height } = useWindowDimensions();
  const layout = useMemo(() => fitField(width, height), [width, height]);
  const frame = useSharedValue<Frame>(EMPTY_FRAME);
  const input = useRef<Input>(INITIAL_INPUT);
  const paused = useRef(false);
  const quit = useRef(false);
  const [hud, setHud] = useState<Hud>(START_HUD);
  const [showPause, setShowPause] = useState(false);
  const [run, setRun] = useState(0);

  useEffect(() => {
    // Practice seed: the app may use the clock; only the core must not.
    const seed = `practice-${run}-${Date.now()}`;
    const state = createGame(seed);
    const recorder = new ReplayRecorder(seed, REPLAY_MODE.practice);
    const stepper = new FixedStepper();
    input.current = INITIAL_INPUT;
    paused.current = false;
    quit.current = false;
    let shown = START_HUD;
    let frames = 0;
    let fpsSince = performance.now();
    let fps = 0;
    let handle = 0;

    const loop = () => {
      const now = performance.now();
      if (paused.current) {
        // Restart the clock on every paused frame, so resuming does not replay the pause.
        stepper.reset();
      } else {
        const ticks = stepper.advance(now);
        for (let i = 0; i < ticks && !state.over; i++) {
          recorder.record(state.tick + 1, input.current);
          step(state, input.current);
        }
      }
      frame.value = snapshot(state);
      frames += 1;
      if (now - fpsSince >= 1000) {
        fps = Math.round((frames * 1000) / (now - fpsSince));
        frames = 0;
        fpsSince = now;
      }
      const over = state.over || quit.current;
      const next: Hud = { score: state.score, lives: state.ship.lives, wave: state.wave, kills: state.kills, over, fps };
      if (
        next.score !== shown.score || next.lives !== shown.lives || next.wave !== shown.wave ||
        next.kills !== shown.kills || next.over !== shown.over || next.fps !== shown.fps
      ) {
        shown = next;
        setHud(next);
      }
      if (!over) handle = requestAnimationFrame(loop);
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

  const pause = () => {
    paused.current = true;
    setShowPause(true);
  };
  const resume = () => {
    paused.current = false;
    setShowPause(false);
  };
  const quitRun = () => {
    quit.current = true;
    paused.current = false;
    setShowPause(false);
  };
  const playAgain = () => {
    setHud(START_HUD);
    setRun((r) => r + 1);
  };

  return (
    <View style={styles.root}>
      <Backdrop variant={hud.over ? 'menu' : 'play'} />
      {hud.over ? (
        <ResultView
          title="Run over"
          score={hud.score}
          stats={[
            { label: 'Crabs', value: formatInt(hud.kills) },
            { label: 'Wave', value: String(hud.wave) },
          ]}
          note="Practice · unranked"
          onPlayAgain={playAgain}
        />
      ) : (
        <>
          <Canvas style={styles.fill}>
            <Picture picture={picture} />
          </Canvas>
          <View
            style={styles.fill}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={onTouch}
            onResponderMove={onTouch}
          />
          <GameHud mode="PRACTICE" score={hud.score} lives={hud.lives} hint={HINT} onPause={pause} />
          <Text style={styles.fps} pointerEvents="none">
            {hud.fps} FPS
          </Text>
          {showPause && <PauseSheet onResume={resume} onQuit={quitRun} />}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.app },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  fps: { position: 'absolute', left: 16, bottom: 64, fontFamily: FONTS.mono, fontSize: 10, color: COLORS.textTertiary },
});
