import { Canvas, Picture, Skia } from '@shopify/react-native-skia';
import {
  BOOSTS, BOOST_INDEX, DAILY_RUN, EMPTY_FRAME, FixedStepper, INITIAL_INPUT, PRACTICE_RUN, REPLAY_MODE, ReplayRecorder,
  SHIP, createGame, fitField, formatInt, snapshot, step, touchToInput,
  type BoostType, type BossFrame, type Frame, type Input, type Replay, type ReplayMode, type RunConfig,
} from '@sea-invaders/core';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BackHandler, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { Backdrop } from '../ui/Backdrop';
import { Txt } from '../ui/Txt';
import { COLORS, FONTS } from '../ui/tokens';
import { GameHud, type HudBoost } from './GameHud';
import { PauseSheet } from './PauseSheet';
import { ResultView } from './ResultView';
import { drawFrame } from './draw';
import { useSprites } from './sprites';

/** Milli-units between the finger and the ship centre, so the finger never covers the ship. */
const FINGER_LIFT = 600;

const HINT = 'Drag anywhere — ship follows above your finger. Auto-fire.';

/** How long the wave/phase banner and the pickup toast stay up, in rendered frames. */
const BANNER_FRAMES = 60;
const TOAST_FRAMES = 60;

/**
 * `BoostType` for each `BOOST_INDEX` slot. Placed by value rather than by relying on the object
 * literal's key declaration order, so a future reordering of `BOOST_INDEX` cannot silently mislabel
 * a slot.
 */
const BOOST_BY_INDEX = Object.entries(BOOST_INDEX).reduce<BoostType[]>((arr, [type, index]) => {
  arr[index] = type as BoostType;
  return arr;
}, []);

/** Chip colour by rarity: spec Task 19 decisions. */
const RARITY_COLOR: Record<string, string> = {
  common: '#FFFFFF', rare: '#00ddff', epic: '#9f00ff', legendary: '#ffd700',
};

/** "RAPID_FIRE" -> "Rapid Fire". */
function titleCase(type: string): string {
  return type.split('_').map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
}

/** `Frame.boosts` (flat typeIndex/ticksLeft pairs) into HUD chips. */
function boostsFromFrame(flat: number[]): HudBoost[] {
  const list: HudBoost[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    const type = BOOST_BY_INDEX[flat[i]!];
    if (type === undefined) continue;
    const ticksLeft = flat[i + 1]!;
    const seconds = ticksLeft < 0 ? -1 : Math.ceil(ticksLeft / 60);
    list.push({ name: titleCase(type), color: RARITY_COLOR[BOOSTS[type].rarity] ?? '#FFFFFF', seconds });
  }
  return list;
}

function sameBoss(a: BossFrame | null, b: BossFrame | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return (
    a.kind === b.kind && a.hp === b.hp && a.maxHp === b.maxHp && a.phase === b.phase &&
    a.maxPhases === b.maxPhases && a.shieldHp === b.shieldHp && a.rage === b.rage && a.freeze === b.freeze
  );
}

function sameBoosts(a: HudBoost[], b: HudBoost[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.name !== b[i]!.name || a[i]!.seconds !== b[i]!.seconds || a[i]!.color !== b[i]!.color) return false;
  }
  return true;
}

interface Hud {
  score: number;
  lives: number;
  wave: number;
  kills: number;
  over: boolean;
  fps: number;
  boss: BossFrame | null;
  boosts: HudBoost[];
  shield: number;
  /** "WAVE N" / "LEVEL N · WAVE 1" / "PHASE N", shown centre-screen for `BANNER_FRAMES` frames. */
  banner: string | null;
  /** A pickup's name, shown under the HUD for `TOAST_FRAMES` frames. */
  toast: string | null;
}

const START_HUD: Hud = {
  score: 0, lives: 3, wave: 1, kills: 0, over: false, fps: 0,
  boss: null, boosts: [], shield: 0, banner: null, toast: null,
};

export interface RunOutcome {
  replay: Replay;
  score: number;
  wave: number;
  kills: number;
  ticks: number;
  /** false when the player quit before the game ended. */
  over: boolean;
  /** Ship lives remaining when the run ended. */
  livesLeft: number;
  /** True when a campaign level's win condition was met (`state.cleared`). */
  cleared: boolean;
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
  /** Campaign level config; used verbatim for `createGame` and the replay's level id/lives. Daily/practice runs omit it. */
  run?: RunConfig;
  /** Called once when the run ends (game over or quit), with the finished replay. */
  onRunOver?: (outcome: RunOutcome) => void;
  /** Replaces the default result view. `playAgain` restarts with the same props. */
  renderResult?: (outcome: RunOutcome, playAgain: () => void) => ReactNode;
}

/** A run of the game. Without `seed` it is practice on a fresh seed. Without `run` it is the daily/practice mapping from `mode`. */
export function GameScreen({ onExit, seed, mode = REPLAY_MODE.practice, hudMode = 'PRACTICE', note = 'Practice · unranked', run, onRunOver, renderResult }: GameScreenProps) {
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
  const [runIndex, setRunIndex] = useState(0);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const onRunOverRef = useRef(onRunOver);
  onRunOverRef.current = onRunOver;

  useEffect(() => {
    // Sprites load once on mount; hold the loop until they are ready (see the loading branch below).
    if (sprites === null) return;
    // Practice seed: the app may use the clock; only the core must not.
    const runSeed = seed ?? `practice-${runIndex}-${Date.now()}`;
    const config = run ?? (mode === REPLAY_MODE.daily ? DAILY_RUN : PRACTICE_RUN);
    const state = createGame(runSeed, config);
    const recorder = new ReplayRecorder(runSeed, mode, run?.level?.id ?? 0, run?.lives ?? SHIP.lives);
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
    // 0 so the first frame's wave (always 1) is treated as a change and announced.
    let prevWave = 0;
    let bannerText: string | null = null;
    let bannerFrames = 0;
    let toastText: string | null = null;
    let toastFrames = 0;

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
      // Wave/phase banner and pickup toast, from this frame's ticks; state.events is cleared below.
      if (state.wave !== prevWave) {
        bannerText = run?.level !== undefined && state.wave === 1 && prevWave === 0
          ? `LEVEL ${run.level.id} · WAVE 1`
          : `WAVE ${state.wave}`;
        bannerFrames = BANNER_FRAMES;
        prevWave = state.wave;
      }
      for (const ev of state.events) {
        if (ev.type === 'boss_phase') {
          bannerText = `PHASE ${state.boss?.phase ?? 0}`;
          bannerFrames = BANNER_FRAMES;
        } else if (ev.type === 'boost_pickup') {
          toastText = titleCase(ev.boost);
          toastFrames = TOAST_FRAMES;
        }
      }
      state.events.length = 0;
      if (bannerFrames > 0) {
        bannerFrames -= 1;
        if (bannerFrames === 0) bannerText = null;
      }
      if (toastFrames > 0) {
        toastFrames -= 1;
        if (toastFrames === 0) toastText = null;
      }
      const dx = state.ship.x - prevShipX;
      facing.value = dx > 20 ? 1 : dx < -20 ? -1 : 0;
      prevShipX = state.ship.x;
      const f = snapshot(state);
      frame.value = f;
      frames += 1;
      if (now - fpsSince >= 1000) {
        fps = Math.round((frames * 1000) / (now - fpsSince));
        frames = 0;
        fpsSince = now;
      }
      const over = state.over || state.cleared || quit.current;
      const next: Hud = {
        score: state.score, lives: state.ship.lives, wave: state.wave, kills: state.kills, over, fps,
        boss: f.boss, boosts: boostsFromFrame(f.boosts), shield: f.shield, banner: bannerText, toast: toastText,
      };
      if (
        next.score !== shown.score || next.lives !== shown.lives || next.wave !== shown.wave ||
        next.kills !== shown.kills || next.over !== shown.over || next.fps !== shown.fps ||
        next.shield !== shown.shield || next.banner !== shown.banner || next.toast !== shown.toast ||
        !sameBoss(next.boss, shown.boss) || !sameBoosts(next.boosts, shown.boosts)
      ) {
        shown = next;
        setHud(next);
      }
      if (over && !reported) {
        reported = true;
        const result: RunOutcome = {
          replay: recorder.finish(state.tick), score: state.score, wave: state.wave, kills: state.kills, ticks: state.tick,
          over: state.over, livesLeft: state.ship.lives, cleared: state.cleared,
        };
        setOutcome(result);
        onRunOverRef.current?.(result);
      }
      if (!over) handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, [runIndex, frame, facing, seed, mode, sprites, run]);

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
    setRunIndex((r) => r + 1);
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
          {hud.boss !== null && hud.boss.freeze > 0 && <View style={styles.frozen} pointerEvents="none" />}
          <GameHud
            mode={hudMode}
            score={hud.score}
            lives={hud.lives}
            boss={hud.boss}
            boosts={hud.boosts}
            shield={hud.shield}
            toast={hud.toast}
            hint={HINT}
            onPause={pause}
          />
          {hud.banner !== null && (
            <Text style={styles.banner} pointerEvents="none">
              {hud.banner}
            </Text>
          )}
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
  frozen: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(51,153,255,0.18)' },
  banner: {
    position: 'absolute', top: '40%', left: 0, right: 0, textAlign: 'center',
    fontFamily: FONTS.medium, fontSize: 22, letterSpacing: 1.2, color: COLORS.text,
  },
  fps: { position: 'absolute', left: 16, bottom: 64, fontFamily: FONTS.mono, fontSize: 10, color: COLORS.textTertiary },
});
