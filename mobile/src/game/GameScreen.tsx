import { Canvas, Picture, Skia } from '@shopify/react-native-skia';
import {
  DAILY_RUN, EMPTY_FRAME, FixedStepper, INITIAL_INPUT, PRACTICE_RUN, REPLAY_MODE, ReplayRecorder, SHIP, createGame,
  fitField, formatInt, snapshot, step, touchToInput, type Frame, type Input, type Replay, type ReplayMode,
} from '@sea-invaders/core';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BackHandler, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { Backdrop } from '../ui/Backdrop';
import { Txt } from '../ui/Txt';
import { COLORS, FONTS } from '../ui/tokens';
import { GameHud } from './GameHud';
import { PauseSheet } from './PauseSheet';
import { ResultView } from './ResultView';
import { drawFrame } from './draw';
import { useSprites } from './sprites';

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

export interface RunOutcome {
  replay: Replay;
  score: number;
  wave: number;
  kills: number;
  ticks: number;
  /** false when the player quit before the game ended. */
  over: boolean;
}

interface GameScreenProps {
  /** Leaves the game, from the result screen or the system back button. */
  onExit: () => void;
  /** Fixed seed for ranked runs. Practice makes a fresh seed for every run. */
  seed?: string;
  mode?: ReplayMode;
  /** HUD label, e.g. "DAILY". */
  hudMode?: string;
  /** Small line under the default result's button. */
  note?: string;
  /** Called once when the run ends (game over or quit), with the finished replay. */
  onRunOver?: (outcome: RunOutcome) => void;
  /** Replaces the default result view. `playAgain` restarts with the same props. */
  renderResult?: (outcome: RunOutcome, playAgain: () => void) => ReactNode;
}

/** A run of the game. Without `seed` it is practice on a fresh seed. */
export function GameScreen({ onExit, seed, mode = REPLAY_MODE.practice, hudMode = 'PRACTICE', note = 'Practice · unranked', onRunOver, renderResult }: GameScreenProps) {
  const { width, height } = useWindowDimensions();
  const layout = useMemo(() => fitField(width, height), [width, height]);
  const sprites = useSprites();
  const frame = useSharedValue<Frame>(EMPTY_FRAME);
  /** -1 left, 0 front, 1 right; the sign of the ship's last movement. */
  const facing = useSharedValue<number>(0);
  const input = useRef<Input>(INITIAL_INPUT);
  const paused = useRef(false);
  const quit = useRef(false);
  const [hud, setHud] = useState<Hud>(START_HUD);
  const [showPause, setShowPause] = useState(false);
  const [run, setRun] = useState(0);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const onRunOverRef = useRef(onRunOver);
  onRunOverRef.current = onRunOver;

  useEffect(() => {
    // Sprites load once on mount; hold the loop until they are ready (see the loading branch below).
    if (sprites === null) return;
    // Practice seed: the app may use the clock; only the core must not.
    const runSeed = seed ?? `practice-${run}-${Date.now()}`;
    const state = createGame(runSeed, mode === REPLAY_MODE.daily ? DAILY_RUN : PRACTICE_RUN);
    const recorder = new ReplayRecorder(runSeed, mode, 0, SHIP.lives);
    const stepper = new FixedStepper();
    input.current = INITIAL_INPUT;
    paused.current = false;
    quit.current = false;
    facing.value = 0;
    let prevShipX = state.ship.x;
    let shown = START_HUD;
    let reported = false;
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
      // Nothing consumes events yet; drop whatever this frame's ticks produced.
      state.events.length = 0;
      const dx = state.ship.x - prevShipX;
      facing.value = dx > 20 ? 1 : dx < -20 ? -1 : 0;
      prevShipX = state.ship.x;
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
      if (over && !reported) {
        reported = true;
        const result: RunOutcome = { replay: recorder.finish(state.tick), score: state.score, wave: state.wave, kills: state.kills, ticks: state.tick, over: state.over };
        setOutcome(result);
        onRunOverRef.current?.(result);
      }
      if (!over) handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, [run, frame, facing, seed, mode, sprites]);

  const recorder = useMemo(() => Skia.PictureRecorder(), []);
  const paint = useMemo(() => Skia.Paint(), []);
  const picture = useDerivedValue(() => {
    'worklet';
    if (sprites === null) {
      recorder.beginRecording(Skia.XYWHRect(0, 0, width, height));
      return recorder.finishRecordingAsPicture();
    }
    return drawFrame(recorder, paint, frame.value, layout, width, height, sprites, facing.value);
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
    setOutcome(null);
    setRun((r) => r + 1);
  };

  // System back: pauses a run, closes the pause sheet, and leaves from the result screen.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (hud.over) onExit();
      else if (showPause) resume();
      else pause();
      return true;
    });
    return () => sub.remove();
  });

  return (
    <View style={styles.root}>
      <Backdrop variant={hud.over ? 'menu' : 'play'} />
      {sprites === null ? (
        <View style={styles.loading} pointerEvents="none">
          <Txt variant="headline">Loading…</Txt>
        </View>
      ) : hud.over && outcome ? (
        renderResult ? renderResult(outcome, playAgain) : (
          <ResultView
            title="Run over"
            score={outcome.score}
            stats={[
              { label: 'Crabs', value: formatInt(outcome.kills) },
              { label: 'Wave', value: String(outcome.wave) },
            ]}
            note={note}
            onPlayAgain={playAgain}
            onBack={onExit}
          />
        )
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
          <GameHud mode={hudMode} score={hud.score} lives={hud.lives} hint={HINT} onPause={pause} />
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
  loading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  fps: { position: 'absolute', left: 16, bottom: 64, fontFamily: FONTS.mono, fontSize: 10, color: COLORS.textTertiary },
});
