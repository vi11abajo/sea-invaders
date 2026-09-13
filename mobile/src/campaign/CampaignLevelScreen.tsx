import {
  applyLevelResult, bonusLivesFor, currentLevelId, formatInt, levelById, levelSeed, LEVELS_PER_REEF, REPLAY_MODE,
  type CampaignProgress, type OctopiVariant, type RunConfig,
} from '@sea-invaders/core';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GameScreen, type RunOutcome } from '../game/GameScreen';
import { VARIANT_OCTOPI } from '../loadout/items';
import type { LoadoutApi } from '../loadout/useLoadout';
import { ReefBackdrop } from './ReefBackdrop';
import { ResultView } from '../game/ResultView';
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

interface CampaignLevelScreenProps {
  levelId: number;
  practice: boolean;
  /**
   * The campaign progress before this level's result is applied. Deliberately unused for the
   * result screen: deriving "Next level"/"Retry reef" targets or the "Best" stat from this prop
   * would only be correct because React happens to batch the parent's `setProgress` with this
   * component's own `setResult` — not a guarantee. `finishLevel`'s returned `next` progress is
   * used instead, which is correct regardless of render timing.
   */
  progress: CampaignProgress;
  startLevel: (id: number, practice: boolean, octopi: OctopiVariant) => RunConfig;
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
  /** Opens a level id (always non-practice) — "Next level", "Retry level" or "Retry reef". */
  onNext: (id: number) => void;
  /** Called once the player leaves the result screen. */
  onDone: (outcome: Outcome) => void;
  onExit: () => void;
}

/**
 * The reef lives a finished level hands back to the progress. An octopi's extra life (Anchor's, added
 * by the core at `createGame`) belongs to that one level: a hit spends it first, and one still unspent
 * at the end does not carry over, so a clean Anchor run returns the lives it came in with (owner
 * ruling 2026-09-14). Lives won from HEALTH_BOOST still carry.
 */
function reefLivesAfter(livesLeft: number, run: RunConfig | null): number {
  if (run === null) return livesLeft;
  const bonus = bonusLivesFor(run.octopi);
  return bonus > 0 && livesLeft > run.lives ? livesLeft - Math.min(bonus, livesLeft - run.lives) : livesLeft;
}

/** One campaign level: the Level start screen, the boss reveal on boss rows, then the run and its result. */
export function CampaignLevelScreen({
  levelId, practice, startLevel, finishLevel, loadout, signedIn, connecting, signInError, onConnect, onOpenShop,
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

  // The RunConfig is built when Start is pressed, so it carries the octopi picked just before; kept
  // in the phase from then on, so it stays the same object and the game loop is not restarted.
  const beginPlay = () => {
    const run = startLevel(levelId, practice, octopi);
    setPhase({ kind: level.boss !== undefined ? 'boss-intro' : 'playing', run });
  };

  const handleRunOver = (outcome: RunOutcome) => {
    const livesLeft = reefLivesAfter(outcome.livesLeft, phase.kind === 'intro' ? null : phase.run);
    finishLevel({ levelId, practice, cleared: outcome.cleared, livesLeft, score: outcome.score })
      .then(({ outcome: kind, next }) => setResult({ outcome, kind, next }))
      .catch(() => setResult({ outcome, kind: 'error' }));
  };

  if (phase.kind === 'intro') {
    // The lives the run will start with: the level's entry lives plus the picked octopi's (Anchor's
    // extra life is added by the core's createGame; the reef lives in the progress are untouched).
    const preview = startLevel(levelId, practice, octopi);
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
        const stats = [
          { label: 'Score', value: formatInt(outcome.score) },
          { label: 'Best', value: formatInt(best) },
          { label: 'Lives left', value: String(reefLivesAfter(outcome.livesLeft, phase.run)) },
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
          case 'practice':
            return (
              <ResultView
                title={TITLE.practice}
                score={outcome.score}
                stats={stats}
                onPlayAgain={playAgain}
                secondary={toMap}
                onBack={onExit}
              />
            );
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
