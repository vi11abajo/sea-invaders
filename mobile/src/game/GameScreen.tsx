import { Canvas, Picture, Skia } from '@shopify/react-native-skia';
import {
  BOOST_INDEX, DAILY_RUN, EMPTY_FRAME, FixedStepper, INITIAL_INPUT, PRACTICE_RUN, REPLAY_MODE, ReplayRecorder,
  OCTOPI, createGame, fitField, formatInt, revive, snapshot, step, touchToInput,
  type BoostType, type BossFrame, type Crab, type Frame, type GameEvent, type Input, type OctopiVariant, type Replay, type ReplayMode, type RunConfig,
} from '@sea-invaders/core';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BackHandler, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { startAmbience, stopAmbience } from '../audio/music';
import { playSfx, type SfxId } from '../audio/sfx';
import { ITEM_NAMES, itemOfOctopi } from '../loadout/items';
import { ITEM_TINT, tintWithAlpha } from '../shop/tints';
import { Backdrop } from '../ui/Backdrop';
import { Txt } from '../ui/Txt';
import { COLORS, FONTS } from '../ui/tokens';
import { GameHud, type HudBadge, type HudBoost } from './GameHud';
import { PauseSheet } from './PauseSheet';
import { RESULT_POSE_SIZE, ResultView } from './ResultView';
import { drawFrame, type WaveBlast } from './draw';
import { RunOctopiContext, octopiTint, useActiveSkin } from './skins';
import { primeOctopiArt, usePreparedSprites, useSprites } from './sprites';

/** Milli-units between the finger and Octopi's centre, so the finger never covers Octopi. */
const FINGER_LIFT = 600;

const HINT = 'Drag anywhere — Octopi follows above your finger. Auto-fire.';

/** The octopi badge's fill: the item's Shop colour at the alpha of the HUD's other tags (RAGE, FROZEN). */
const BADGE_ALPHA = 0.35;

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

/** "RAPID_FIRE" -> "Rapid Fire". */
function titleCase(type: string): string {
  return type.split('_').map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
}

/**
 * `GameEvent.type` -> sound id, for every event that plays the same sound every time (sound design
 * doc, table A). `boss_ability` and `boost_pickup` carry a payload that picks between several
 * sounds, so they are handled separately in the frame loop below rather than through this map.
 */
const SFX_FOR_EVENT: Partial<Record<GameEvent['type'], SfxId>> = {
  player_hit: 'player_hit',
  shield_break: 'shield_break',
  wave_start: 'wave_start',
  wave_cleared: 'wave_cleared',
  level_cleared: 'level_cleared',
  boss_spawn: 'boss_spawn',
  boss_phase: 'boss_phase',
  boss_dead: 'boss_dead',
  boss_teleport: 'boss_teleport',
  boss_clone: 'boss_clone',
  meteor_warning: 'meteor_warning',
  boost_drop: 'boost_drop',
  boost_expire: 'boost_expire',
  player_freeze: 'player_freeze',
  revived: 'revived',
};

/** `boss_ability`'s `name` -> sound id (table A). */
const BOSS_ABILITY_SFX: Record<'regen' | 'shield' | 'meteor' | 'rage' | 'freeze', SfxId> = {
  regen: 'boss_regen',
  shield: 'boss_shield',
  meteor: 'meteor_impact',
  rage: 'boss_rage',
  freeze: 'boss_freeze',
};

/** A `boost_pickup`'s boost type -> the stinger layered over the generic `boost_pickup` pop (table A rows 35-38). Boosts absent here get the pop alone. */
const BOOST_STINGER: Partial<Record<BoostType, SfxId>> = {
  INVINCIBILITY: 'boost_invincibility',
  ICE_FREEZE: 'boost_ice',
  WAVE_BLAST: 'boost_blast',
  COIN_SHOWER: 'boost_coins',
  SCORE_MULTIPLIER: 'boost_coins',
};

/** Armored crabs sitting at 1 hp (one hit taken, one more to kill) - the only crabs that can ever "survive a hit", since every other type has 1 hp and dies on the first. Comparing this count frame to frame is how `crab_armored_tok` is detected without per-crab identity tracking. */
function armoredAtHalfHp(crabs: readonly Crab[]): number {
  let count = 0;
  for (const c of crabs) if (c.type === 'armored' && c.hp === 1) count += 1;
  return count;
}

/**
 * `Frame.boosts` (flat typeIndex/ticksLeft pairs) into HUD chips. `tamerStacks` is read from the
 * live `GameState` (not `Frame`, which never carries it: `activateBoost` pushes a `-1`-duration
 * `active` entry once and re-applies `applyEffect` on every later pickup, so SPEED_TAMER's
 * `ticksLeft` stays -1 forever and its real count lives only in `state.boosts.tamerStacks`).
 */
function boostsFromFrame(flat: number[], tamerStacks: number): HudBoost[] {
  const list: HudBoost[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    const type = BOOST_BY_INDEX[flat[i]!];
    if (type === undefined) continue;
    const ticksLeft = flat[i + 1]!;
    const seconds = ticksLeft < 0 ? -1 : Math.ceil(ticksLeft / 60);
    const count = type === 'SPEED_TAMER' ? tamerStacks : undefined;
    list.push({ type, name: titleCase(type), seconds, count });
  }
  return list;
}

/** The HUD badge of a run played with a campaign octopi (`HARPOON` in Harpoon's colour); none for the base Octopi. */
function octopiBadge(octopi: OctopiVariant): HudBadge | undefined {
  const itemId = itemOfOctopi(octopi);
  if (itemId === null) return undefined;
  const name = ITEM_NAMES[itemId];
  const tint = ITEM_TINT[itemId];
  if (name === undefined || tint === undefined) return undefined;
  return { text: name.toUpperCase(), color: tintWithAlpha(tint, BADGE_ALPHA) };
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
    if (a[i]!.type !== b[i]!.type || a[i]!.seconds !== b[i]!.seconds || a[i]!.count !== b[i]!.count) return false;
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
  /** Octopi lives remaining when the run ended. */
  livesLeft: number;
  /** True when a campaign level's win condition was met (`state.cleared`). */
  cleared: boolean;
}

/** A run held at the loss of its last life (see `onDown`). The first of `revive`/`end` settles it; later calls do nothing. */
export interface DownedRun {
  /**
   * Revives Octopi through the core (`revive(state)`: `TIDE_REVIVE_LIVES` lives, 2 s invulnerability, enemy shots
   * cleared) and resumes the run. True when the run is playing again.
   */
  revive: () => boolean;
  /** Ends the run as if it had never been held: the outcome goes to `onRunOver` and the result shows. */
  end: () => void;
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
  /**
   * Campaign level config; used verbatim for `createGame` and the replay's level id/lives/octopi, and
   * its octopi is badged in the HUD. Daily/practice runs omit it (the base Octopi).
   */
  run?: RunConfig;
  /** Called once when the run ends (game over or quit), with the finished replay. */
  onRunOver?: (outcome: RunOutcome) => void;
  /** Replaces the default result view. `playAgain` restarts with the same props. */
  renderResult?: (outcome: RunOutcome, playAgain: () => void) => ReactNode;
  /**
   * The world behind the run (`over` once the result shows), e.g. a campaign reef. The field is then
   * drawn without its solid fill so the world shows through; without it, the generic backdrop and a
   * solid dark field are used.
   */
  backdrop?: (over: boolean) => ReactNode;
  /**
   * Called when Octopi loses its last life (not when crabs reach the reef line, a level clears or
   * the run is quit). Return true to hold the run: the clock stops as in a pause, nothing is reported,
   * and the host settles it through `down.revive()` or `down.end()`. While held, System Back goes to
   * the `overlay`'s own handler. Omit it, or return false, and the run ends as usual.
   */
  onDown?: (down: DownedRun) => boolean;
  /** Drawn over the HUD while the run is on screen, e.g. the host's sheet over a held run. */
  overlay?: ReactNode;
}

/** A run of the game. Without `seed` it is practice on a fresh seed. Without `run` it is the daily/practice mapping from `mode`. */
export function GameScreen({ onExit, seed, mode = REPLAY_MODE.practice, hudMode = 'PRACTICE', note = 'Practice · unranked', run, onRunOver, renderResult, backdrop, onDown, overlay }: GameScreenProps) {
  const { width, height } = useWindowDimensions();
  const layout = useMemo(() => fitField(width, height), [width, height]);
  const fieldRect = useMemo(() => ({ x: layout.offsetX, y: layout.offsetY, width: layout.width, height: layout.height }), [layout]);
  const sprites = useSprites();
  // Daily and practice runs play the base Octopi (their configs are base), so they show the skin or
  // Octopi's own colours; a campaign octopi shows in its colour unless a skin is equipped.
  const octopi = run?.octopi ?? 'base';
  const tint = octopiTint(useActiveSkin(), octopi);
  const prepared = usePreparedSprites(sprites, layout, tint);
  const badge = useMemo(() => octopiBadge(octopi), [octopi]);
  const frame = useSharedValue<Frame>(EMPTY_FRAME);
  /** The last WAVE_BLAST of this run, for its shock rings (view only, never fed back to the sim). */
  const blast = useSharedValue<WaveBlast | null>(null);
  const input = useRef<Input>(INITIAL_INPUT);
  const paused = useRef(false);
  const quit = useRef(false);
  const [hud, setHud] = useState<Hud>(START_HUD);
  const [showPause, setShowPause] = useState(false);
  const [runIndex, setRunIndex] = useState(0);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const onRunOverRef = useRef(onRunOver);
  onRunOverRef.current = onRunOver;
  const onDownRef = useRef(onDown);
  onDownRef.current = onDown;
  /** True while the run is held at its last life, waiting for the host's `revive`/`end`. */
  const held = useRef(false);
  // Read through a ref inside the loop below so a layout change (which rebuilds `prepared`, the
  // pre-scaled sprites) never appears in the run effect's deps and never calls `createGame` again.
  const preparedRef = useRef(prepared);
  preparedRef.current = prepared;

  // The result screen's Octopi, made now from the sprite this run already decoded, so the pose is
  // there the moment the run ends instead of decoding the asset again at that point.
  useEffect(() => {
    if (sprites !== null) primeOctopiArt(sprites.octopi.front, tint, RESULT_POSE_SIZE);
  }, [sprites, tint]);

  // The reef ambience loop plays under every run (design doc table A row 42 / section F), from
  // practice, Daily and campaign alike, since they all mount this same screen; it fades out again
  // once the run is left (including through the result screen, which is still this component).
  useEffect(() => {
    startAmbience();
    return () => stopAmbience();
  }, []);

  useEffect(() => {
    // Practice seed: the app may use the clock; only the core must not.
    const runSeed = seed ?? `practice-${runIndex}-${Date.now()}`;
    const config = run ?? (mode === REPLAY_MODE.daily ? DAILY_RUN : PRACTICE_RUN);
    const state = createGame(runSeed, config);
    const recorder = new ReplayRecorder(runSeed, mode, run?.level?.id ?? 0, run?.lives ?? OCTOPI.lives, config.octopi);
    const stepper = new FixedStepper();
    input.current = INITIAL_INPUT;
    paused.current = false;
    quit.current = false;
    held.current = false;
    blast.value = null;
    let shown = START_HUD;
    let reported = false;
    // A held loss the host ended: reported on the next frame, never offered again.
    let downEnded = false;
    // False once this run's effect is cleaned up, so a `DownedRun` handed out for it does nothing.
    let live = true;
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
    // Sound triggers read as state deltas (table A): the value at the end of the previous rendered
    // frame, compared against the value after this frame's ticks. Seeded from the just-created state
    // rather than 0/null so a run that somehow starts non-empty never fires a spurious first sound.
    let prevShotsLen = state.shots.length;
    let prevEnemyShotsLen = state.enemyShots.length;
    let prevKillsCount = state.kills;
    let prevBossHp: number | null = state.boss?.hp ?? null;
    let prevArmoredHalfHp = armoredAtHalfHp(state.crabs);
    // Set once `game_over` has played for this run, so the single frame where the loop stops can
    // never be revisited and replay it.
    let gameOverPlayed = false;

    /** Offers this loss to the host; true when the host holds the run. */
    const offerDown = (): boolean => {
      let settled = false;
      const down: DownedRun = {
        revive: () => {
          if (settled || !live) return false;
          settled = true;
          revive(state);
          held.current = false;
          // A revive always resumes into a running state, never a paused one, regardless of how
          // `paused`/`showPause` got set (`pause()` itself now refuses while held).
          paused.current = false;
          setShowPause(false);
          return !state.over;
        },
        end: () => {
          if (settled || !live) return;
          settled = true;
          downEnded = true;
          held.current = false;
        },
      };
      const holding = onDownRef.current?.(down) === true;
      // A host that settled the loss inside `onDown` itself leaves nothing to hold.
      return holding && !settled;
    };

    const loop = () => {
      if (preparedRef.current === null) {
        // Sprites not ready yet: hold the clock (no ticks, no stepper.advance) so none are lost or
        // burst once they are (FixedStepper.advance only starts counting from its first call).
        handle = requestAnimationFrame(loop);
        return;
      }
      const now = performance.now();
      if (paused.current || held.current) {
        // Restart the clock on every paused or held frame, so resuming does not replay the wait.
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
      // Sounds this frame, collected here and played once each after the loop below (never inside
      // the tick loop above, and never more than once per id per frame) — design doc section F.
      const sounds: SfxId[] = [];
      for (const ev of state.events) {
        if (ev.type === 'boss_phase') {
          bannerText = `PHASE ${state.boss?.phase ?? 0}`;
          bannerFrames = BANNER_FRAMES;
        } else if (ev.type === 'boost_pickup') {
          toastText = titleCase(ev.boost);
          toastFrames = TOAST_FRAMES;
          // Only emitted when the blast actually fired (with no crabs the drop is not consumed).
          if (ev.boost === 'WAVE_BLAST') blast.value = { tick: ev.tick, x: state.octopi.x, y: state.octopi.y };
        }
        if (ev.type === 'boss_ability') {
          sounds.push(BOSS_ABILITY_SFX[ev.name]);
        } else if (ev.type === 'boost_pickup') {
          sounds.push('boost_pickup');
          const stinger = BOOST_STINGER[ev.boost];
          if (stinger !== undefined) sounds.push(stinger);
        } else {
          const sound = SFX_FOR_EVENT[ev.type];
          if (sound !== undefined) sounds.push(sound);
        }
      }
      state.events.length = 0;
      // State deltas (table A): read once per rendered frame, across however many ticks it just ran.
      if (state.shots.length > prevShotsLen) sounds.push('octopi_shot');
      if (state.enemyShots.length > prevEnemyShotsLen) sounds.push('crab_shot');
      if (state.kills > prevKillsCount) sounds.push('crab_hit');
      const bossHpNow = state.boss?.hp ?? null;
      if (prevBossHp !== null && bossHpNow !== null && bossHpNow < prevBossHp) sounds.push('boss_hit');
      const armoredHalfHpNow = armoredAtHalfHp(state.crabs);
      if (armoredHalfHpNow > prevArmoredHalfHp) sounds.push('crab_armored_tok');
      prevShotsLen = state.shots.length;
      prevEnemyShotsLen = state.enemyShots.length;
      prevKillsCount = state.kills;
      prevBossHp = bossHpNow;
      prevArmoredHalfHp = armoredHalfHpNow;
      if (bannerFrames > 0) {
        bannerFrames -= 1;
        if (bannerFrames === 0) bannerText = null;
      }
      if (toastFrames > 0) {
        toastFrames -= 1;
        if (toastFrames === 0) toastText = null;
      }
      const f = snapshot(state);
      frame.value = f;
      frames += 1;
      if (now - fpsSince >= 1000) {
        fps = Math.round((frames * 1000) / (now - fpsSince));
        frames = 0;
        fpsSince = now;
      }
      // The last life lost (not a clear, a quit or crabs on the reef line): the host may hold the run.
      if (
        state.over && state.octopi.lives === 0 && !state.cleared && !quit.current &&
        !held.current && !downEnded && !reported
      ) {
        held.current = offerDown();
      }
      const over = (state.over && !held.current) || state.cleared || quit.current;
      // The run truly ended with no Tide offered — not a clear (its own fanfare) and not a quit
      // (the player's own choice). `over` already folds in whether the host is holding for a
      // revive, and once it is true this loop never runs again for this effect, so this can only
      // fire once; `gameOverPlayed` is just belt-and-suspenders against a future refactor.
      if (over && !state.cleared && !quit.current && !gameOverPlayed) {
        gameOverPlayed = true;
        sounds.push('game_over');
      }
      const next: Hud = {
        score: state.score, lives: state.octopi.lives, wave: state.wave, kills: state.kills, over, fps,
        boss: f.boss, boosts: boostsFromFrame(f.boosts, state.boosts.tamerStacks), shield: f.shield, banner: bannerText, toast: toastText,
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
          over: state.over, livesLeft: state.octopi.lives, cleared: state.cleared,
        };
        setOutcome(result);
        onRunOverRef.current?.(result);
      }
      // Played after the step loop, never inside it; de-duped so an id fired from more than one
      // source this frame (unlikely, but e.g. `state.events` holding two of the same type across a
      // multi-tick frame) still plays once.
      if (sounds.length > 0) {
        for (const id of new Set(sounds)) playSfx(id);
      }
      if (!over) handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => {
      live = false;
      held.current = false;
      cancelAnimationFrame(handle);
    };
  }, [runIndex, frame, blast, seed, mode, run]);

  const solidField = backdrop === undefined;
  const recorder = useMemo(() => Skia.PictureRecorder(), []);
  const paint = useMemo(() => Skia.Paint(), []);
  const picture = useDerivedValue(() => {
    'worklet';
    if (prepared === null) {
      recorder.beginRecording(Skia.XYWHRect(0, 0, width, height));
      return recorder.finishRecordingAsPicture();
    }
    return drawFrame(recorder, paint, frame.value, layout, width, height, prepared, fieldRect, blast.value, solidField);
  });

  const onTouch = (e: GestureResponderEvent) => {
    input.current = touchToInput(layout, e.nativeEvent.pageX, e.nativeEvent.pageY, FINGER_LIFT);
  };

  const pause = () => {
    // A tap in the single frame between the loss and the host's overlay mounting must not pause: the
    // run would then stay paused after a revive, with nothing left to show a Resume button.
    if (held.current) return;
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

  // System back: pauses a run, closes the pause sheet, and leaves from the result screen. A held run
  // passes it on to the handler of the host's overlay (mounted as a child, so registered just under
  // this one); until that overlay is on screen, it is swallowed.
  const hasOverlay = overlay !== undefined && overlay !== null && overlay !== false;
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (held.current) return !hasOverlay;
      if (hud.over) onExit();
      else if (showPause) resume();
      else pause();
      return true;
    });
    return () => sub.remove();
  });

  return (
    <View style={styles.root}>
      {backdrop !== undefined ? backdrop(hud.over) : <Backdrop variant={hud.over ? 'menu' : 'play'} />}
      {prepared === null ? (
        <View style={styles.loading} pointerEvents="none">
          <Txt variant="headline">Loading…</Txt>
        </View>
      ) : hud.over && outcome ? (
        // The result pose (`ActiveOctopi` in `ResultView`) takes the run's look through the context.
        <RunOctopiContext.Provider value={octopi}>
          {renderResult ? renderResult(outcome, playAgain) : (
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
          )}
        </RunOctopiContext.Provider>
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
          <GameHud
            mode={hudMode}
            badge={badge}
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
          {overlay}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.app },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  loading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  banner: {
    position: 'absolute', top: '40%', left: 0, right: 0, textAlign: 'center',
    fontFamily: FONTS.medium, fontSize: 22, letterSpacing: 1.2, color: COLORS.text,
  },
  fps: { position: 'absolute', left: 16, bottom: 64, fontFamily: FONTS.mono, fontSize: 10, color: COLORS.textTertiary },
});
