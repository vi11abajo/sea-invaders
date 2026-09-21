import {
  applyLevelResult, bonusLivesFor, currentLevelId, formatInt, levelById, levelSeed, LEVELS_PER_REEF, REPLAY_MODE,
  type CampaignProgress, type OctopiVariant, type RunConfig,
} from '@sea-invaders/core';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { hapticUnlocked } from '../audio/haptics';
import { playSfx } from '../audio/sfx';
import { GameScreen, type DownedRun, type RunOutcome } from '../game/GameScreen';
import { VARIANT_OCTOPI } from '../loadout/items';
import type { LoadoutApi } from '../loadout/useLoadout';
import { levelState, VISIBLE_LEVELS } from './reefs';
import { ReefBackdrop } from './ReefBackdrop';
import { ResultView } from '../game/ResultView';
import { TideSheet } from '../tide/TideSheet';
import { PillButton } from '../ui/PillButton';
import { COLORS } from '../ui/tokens';
import { BossIntro } from './BossIntro';
import { LevelIntro } from './LevelIntro';
import type { FinishLevelInput } from './useCampaign';

/** The level-result kind `finishLevel` reports, from the core's progress rules (spec §6.1). */
type Outcome = ReturnType<typeof applyLevelResult>['outcome'];

/** The Level start screen, then (with the run built when Start was pressed) the boss reveal and the run. */
type Phase = { kind: 'intro' } | { kind: 'boss-intro' | 'playing'; run: RunConfig };

/** The result screen's state: a real outcome carries the post-result progress, `error` does not. */
type LevelResult =
  | { outcome: RunOutcome; kind: Outcome; next: CampaignProgress }
  | { outcome: RunOutcome; kind: 'error' };

const TITLE: Record<Outcome, string> = {
  cleared: 'Level cleared',
  failed: 'Level failed',
  reef_lost: 'Reef lost',
  campaign_complete: 'Campaign complete',
  practice: 'Practice over',
};

/** Task 3B hook: flips true once a paid/ad-gated revive launches. */
const REVIVE_ENABLED = false;

/** Tide revives one level attempt allows (design §3.6, a client rule); the next loss ends the level. */
const REVIVES_PER_ATTEMPT = 3;

/**
 * The outcome the result screen shows. The core's campaign runs past the reefs this app draws, so
 * clearing the last visible level moves the pointer on to a reef with no map and no level to open:
 * to the player that is the end of the campaign until a later task opens the rest.
 */
function visibleOutcome(kind: Outcome, next: CampaignProgress): Outcome {
  return kind === 'cleared' && currentLevelId(next) > VISIBLE_LEVELS ? 'campaign_complete' : kind;
}

/** A loss the Tide sheet is offering a revive for. */
interface Down {
  /** Counts losses in this attempt, so each one mounts a fresh sheet. */
  id: number;
  run: DownedRun;
  /** Revives left in this attempt, this one included. */
  revivesLeft: number;
}

interface CampaignLevelScreenProps {
  levelId: number;
  practice: boolean;
  /** Practice walk-on only: the hearts carried over from the level just cleared (a full reef's lives otherwise). */
  lives?: number;
  /** QA deep link `?tide=1`: offer the Tide on this practice run's last life, so a revive can be tried on a cleared campaign. */
  qaTide?: boolean;
  /**
   * The campaign progress before this level's result is applied. Deliberately unused for the
   * result screen: deriving "Next level"/"Retry reef" targets or the "Best" stat from this prop
   * would only be correct because React happens to batch the parent's `setProgress` with this
   * component's own `setResult` — not a guarantee. `finishLevel`'s returned `next` progress is
   * used instead, which is correct regardless of render timing.
   */
  progress: CampaignProgress;
  startLevel: (id: number, practice: boolean, octopi: OctopiVariant, carried?: number) => RunConfig;
  finishLevel: (result: FinishLevelInput) => Promise<{ outcome: Outcome; next: CampaignProgress }>;
  /** The loadout: the Level start picker equips its variant, and the run is played with it. */
  loadout: LoadoutApi;
  /** False when signed out: only the base Octopi can be picked. */
  signedIn: boolean;
  /** True while a wallet sign-in is in flight. */
  connecting: boolean;
  /** A failed sign-in's message. */
  signInError: string | null;
  /** Starts the wallet sign-in, from the Level start's Connect sheet. */
  onConnect: () => void;
  /** Opens the Shop, from a locked octopi tile. */
  onOpenShop: () => void;
  /**
   * Opens a level id — "Next level", "Retry level" or "Retry reef". `practice` opens it as an
   * unranked replay: the walk on through a reef the player has already cleared, `lives` carrying
   * the hearts left over from the level just cleared.
   */
  onNext: (id: number, practice?: boolean, lives?: number) => void;
  /** Called once the player leaves the result screen. */
  onDone: (outcome: Outcome) => void;
  onExit: () => void;
}

/**
 * The reef lives a finished level hands back to the progress. An octopi's extra life (Anchor's, added
 * by the core at `createGame`) belongs to that one level: a hit spends it first, and one still unspent
 * at the end does not carry over, so a clean Anchor run returns the lives it came in with (owner
 * ruling 2026-09-14). Lives won from HEALTH_BOOST still carry; after a Tide revive nothing is deducted.
 */
function reefLivesAfter(livesLeft: number, run: RunConfig | null, revived: boolean): number {
  if (run === null) return livesLeft;
  // A revive replaced the lives outright, so the bonus life it came in with is long spent.
  if (revived) return livesLeft;
  const bonus = bonusLivesFor(run.octopi);
  return bonus > 0 && livesLeft > run.lives ? livesLeft - Math.min(bonus, livesLeft - run.lives) : livesLeft;
}

/** One campaign level: the Level start screen, the boss reveal on boss rows, then the run and its result. */
export function CampaignLevelScreen({
  levelId, practice, lives: carried, qaTide = false, startLevel, finishLevel, loadout, signedIn, connecting, signInError, onConnect, onOpenShop,
  onNext, onDone, onExit,
}: CampaignLevelScreenProps) {
  const level = useMemo(() => levelById(levelId), [levelId]);
  // A fresh seed each time the player re-enters this level, stable across this screen's re-renders.
  const [seed] = useState<string>(() => levelSeed(`campaign-${Date.now()}`, levelId));
  const [phase, setPhase] = useState<Phase>({ kind: 'intro' });
  /** The octopi picked on the Level start screen: the loadout's variant, 'base' when signed out. */
  const octopi = VARIANT_OCTOPI[loadout.loadout.activeVariant];
  // 'error' covers a rejected finishLevel — e.g. the QA deep link opening a level that is not
  // the current level, which `applyLevelResult` refuses for a non-practice result. Non-error
  // results carry `next`, the post-result progress `applyLevelResult` computed, so the result
  // screen's targets and stats never depend on this component's own (pre-result) `progress` prop.
  const [result, setResult] = useState<LevelResult | null>(null);
  // The Tide: the loss on offer, and the revives this attempt has used. A "Retry level" remounts
  // this screen (App bumps its key), so every attempt starts with all of them.
  const [down, setDown] = useState<Down | null>(null);
  const revivesUsed = useRef(0);
  const losses = useRef(0);

  // The RunConfig is built when Start is pressed, so it carries the octopi picked just before; kept
  // in the phase from then on, so it stays the same object and the game loop is not restarted.
  const beginPlay = () => {
    const run = startLevel(levelId, practice, octopi, carried);
    setPhase({ kind: level.boss !== undefined ? 'boss-intro' : 'playing', run });
  };

  const handleRunOver = (outcome: RunOutcome) => {
    const livesLeft = reefLivesAfter(outcome.livesLeft, phase.kind === 'intro' ? null : phase.run, revivesUsed.current > 0);
    finishLevel({ levelId, practice, cleared: outcome.cleared, livesLeft, score: outcome.score })
      .then(({ outcome: kind, next }) => {
        const shown = visibleOutcome(kind, next);
        // `cleared` is the only outcome that opens something new on the map: the next level, or (on
        // a reef's last level) the next reef itself. `campaign_complete` finishes the run with
        // nothing left to unlock, so it does not get this chime.
        if (shown === 'cleared') {
          playSfx('reef_unlocked');
          hapticUnlocked();
        }
        setResult({ outcome, kind: shown, next });
      })
      .catch(() => setResult({ outcome, kind: 'error' }));
  };

  // The last life lost in a real attempt: hold the run for the Tide while revives are left. A
  // practice replay of a cleared level has nothing at stake, so it is never offered one - except
  // through the QA deep link's `?tide=1`, the only way to try a revive on a cleared campaign.
  const handleDown = (run: DownedRun): boolean => {
    const revivesLeft = REVIVES_PER_ATTEMPT - revivesUsed.current;
    if ((practice && !qaTide) || revivesLeft <= 0) return false;
    losses.current += 1;
    setDown({ id: losses.current, run, revivesLeft });
    return true;
  };
  // Confirmed on chain: revive the held run. `DownedRun` settles once, so a second call does nothing.
  const revived = (loss: Down) => {
    if (loss.run.revive()) revivesUsed.current += 1;
    setDown(null);
  };
  // End level: the run ends as the loss it was, and its outcome goes through `handleRunOver`.
  const endLevel = (loss: Down) => {
    loss.run.end();
    setDown(null);
  };

  if (phase.kind === 'intro') {
    // The lives the run will start with: the level's entry lives plus the picked octopi's (Anchor's
    // extra life is added by the core's createGame; the reef lives in the progress are untouched).
    const preview = startLevel(levelId, practice, octopi, carried);
    return (
      <LevelIntro
        level={level}
        practice={practice}
        lives={preview.lives + bonusLivesFor(preview.octopi)}
        loadout={loadout}
        signedIn={signedIn}
        connecting={connecting}
        signInError={signInError}
        onConnect={onConnect}
        onOpenShop={onOpenShop}
        onPlay={beginPlay}
        onBack={onExit}
      />
    );
  }
  const { run } = phase;
  if (phase.kind === 'boss-intro' && level.boss !== undefined) {
    return (
      <View style={StyleSheet.absoluteFill}>
        <ReefBackdrop reef={level.reef} />
        <BossIntro kind={level.boss} onDone={() => setPhase({ kind: 'playing', run })} />
      </View>
    );
  }

  return (
    <GameScreen
      run={run}
      seed={seed}
      mode={practice ? REPLAY_MODE.practice : REPLAY_MODE.campaign}
      hudMode={`LEVEL ${levelId}`}
      backdrop={(over) => <ReefBackdrop reef={level.reef} variant={over ? 'map' : 'play'} />}
      onExit={onExit}
      onRunOver={handleRunOver}
      onDown={handleDown}
      overlay={down !== null && (
        <TideSheet
          key={down.id}
          revivesLeft={down.revivesLeft}
          signedIn={signedIn}
          connecting={connecting}
          signInError={signInError}
          onConnect={onConnect}
          onRevived={() => revived(down)}
          onEndLevel={() => endLevel(down)}
        />
      )}
      renderResult={(outcome, playAgain) => {
        if (result === null) {
          return (
            <View style={styles.overlay}>
              <ActivityIndicator color={COLORS.text} />
            </View>
          );
        }
        if (result.kind === 'error') {
          return (
            <ResultView
              title="Could not save progress"
              score={outcome.score}
              stats={[{ label: 'Score', value: formatInt(outcome.score) }]}
              onPlayAgain={onExit}
              onBack={onExit}
            />
          );
        }
        const kind = result.kind;
        const next = result.next;
        const best = next.best[levelId - 1] ?? 0;
        const livesLeft = reefLivesAfter(outcome.livesLeft, phase.run, revivesUsed.current > 0);
        const stats = [
          { label: 'Score', value: formatInt(outcome.score) },
          { label: 'Best', value: formatInt(best) },
          { label: 'Lives left', value: String(livesLeft) },
        ];
        const toMap = { label: 'Map', onPress: () => onDone(kind) };

        switch (kind) {
          case 'cleared':
            return (
              <ResultView
                title={TITLE.cleared}
                score={outcome.score}
                stats={stats}
                primaryLabel="Next level"
                onPlayAgain={() => onNext(currentLevelId(next))}
                secondary={toMap}
                onBack={onExit}
              />
            );
          case 'failed':
            return (
              <ResultView
                title={TITLE.failed}
                score={outcome.score}
                stats={stats}
                primaryLabel="Retry level"
                onPlayAgain={() => onNext(levelId)}
                secondary={toMap}
                onBack={onExit}
              />
            );
          case 'reef_lost':
            return (
              <ResultView
                title={TITLE.reef_lost}
                score={outcome.score}
                stats={stats}
                primaryLabel="Retry reef"
                onPlayAgain={() => onNext((next.reef - 1) * LEVELS_PER_REEF + 1)}
                secondary={toMap}
                extra={REVIVE_ENABLED ? <PillButton label="Revive · 3 lives" kind="glass" disabled /> : undefined}
                onBack={onExit}
              />
            );
          case 'campaign_complete':
            return (
              <ResultView
                title={TITLE.campaign_complete}
                score={outcome.score}
                stats={stats}
                primaryLabel="Map"
                onPlayAgain={() => onDone(kind)}
                onBack={onExit}
              />
            );
          case 'practice': {
            // Walking on through a cleared reef: after a cleared replay the primary action opens the
            // next level instead of sending the player back to the map for every level, and the
            // hearts left over travel with the player (a real attempt takes the reef lives instead).
            // The reef's boss ends the walk (the next reef starts from the map), a locked level is
            // never opened this way, and a level the player has not cleared yet opens as the real
            // attempt, exactly as the map would open it. A lost level ends the walk: "Play again"
            // starts it over with a full reef's lives, not with the hearts it was entered with.
            const nextId = levelId + 1;
            const nextState = levelId % LEVELS_PER_REEF === 0 ? 'locked' : levelState(next, nextId);
            const walkOn = outcome.cleared && nextState !== 'locked';
            const nextPractice = nextState === 'cleared';
            const restart = carried === undefined ? playAgain : () => onNext(levelId, true);
            return (
              <ResultView
                title={TITLE.practice}
                score={outcome.score}
                stats={stats}
                primaryLabel={walkOn ? 'Next level' : undefined}
                onPlayAgain={walkOn ? () => onNext(nextId, nextPractice, nextPractice ? Math.max(1, livesLeft) : undefined) : restart}
                secondary={toMap}
                onBack={onExit}
              />
            );
          }
          default:
            return null;
        }
      }}
    />
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
});
