import {
  applyLevelResult, currentLevelId, formatInt, levelById, levelSeed, REPLAY_MODE, type CampaignProgress, type RunConfig,
} from '@sea-invaders/core';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GameScreen, type RunOutcome } from '../game/GameScreen';
import { ResultView } from '../game/ResultView';
import { PillButton } from '../ui/PillButton';
import { COLORS } from '../ui/tokens';
import { BossIntro } from './BossIntro';
import { LevelIntro } from './LevelIntro';
import type { FinishLevelInput } from './useCampaign';

/** The level-result kind `finishLevel` reports, from the core's progress rules (spec §6.1). */
type Outcome = ReturnType<typeof applyLevelResult>['outcome'];

type Phase = 'intro' | 'boss-intro' | 'playing';

const TITLE: Record<Outcome, string> = {
  cleared: 'Level cleared',
  failed: 'Level failed',
  reef_lost: 'Reef lost',
  campaign_complete: 'Campaign complete',
  practice: 'Practice over',
};

/** Task 3B hook: flips true once a paid/ad-gated revive ships. */
const REVIVE_ENABLED = false;

interface CampaignLevelScreenProps {
  levelId: number;
  practice: boolean;
  /** The campaign progress before this level's result is applied; used to show the prior best. */
  progress: CampaignProgress;
  startLevel: (id: number, practice: boolean) => RunConfig;
  finishLevel: (result: FinishLevelInput) => Promise<Outcome>;
  /** Opens a level id (always non-practice) — "Next level", "Retry level" or "Retry reef". */
  onNext: (id: number) => void;
  /** Called once the player leaves the result screen. */
  onDone: (outcome: Outcome) => void;
  onExit: () => void;
}

/** One campaign level: the intro card, the boss reveal on boss rows, then the run and its result. */
export function CampaignLevelScreen({ levelId, practice, progress, startLevel, finishLevel, onNext, onDone, onExit }: CampaignLevelScreenProps) {
  const level = useMemo(() => levelById(levelId), [levelId]);
  // Computed once per screen instance: a fresh RunConfig/seed each time the player re-enters this
  // level, but stable across this screen's own re-renders so the game loop is not restarted.
  const [run] = useState<RunConfig>(() => startLevel(levelId, practice));
  const [seed] = useState<string>(() => levelSeed(`campaign-${Date.now()}`, levelId));
  const [phase, setPhase] = useState<Phase>('intro');
  // 'error' covers a rejected finishLevel — e.g. the QA deep link opening a level that is not
  // `currentLevelId(progress)`, which `applyLevelResult` refuses for a non-practice result.
  const [result, setResult] = useState<{ outcome: RunOutcome; kind: Outcome | 'error' } | null>(null);

  const beginPlay = () => setPhase(level.boss !== undefined ? 'boss-intro' : 'playing');

  const handleRunOver = (outcome: RunOutcome) => {
    finishLevel({ levelId, practice, cleared: outcome.cleared, livesLeft: outcome.livesLeft, score: outcome.score })
      .then((kind) => setResult({ outcome, kind }))
      .catch(() => setResult({ outcome, kind: 'error' }));
  };

  if (phase === 'intro') {
    return <LevelIntro level={level} practice={practice} lives={run.lives} onPlay={beginPlay} onBack={onExit} />;
  }
  if (phase === 'boss-intro' && level.boss !== undefined) {
    return <BossIntro kind={level.boss} onDone={() => setPhase('playing')} />;
  }

  return (
    <GameScreen
      run={run}
      seed={seed}
      mode={practice ? REPLAY_MODE.practice : REPLAY_MODE.campaign}
      hudMode={`LEVEL ${levelId}`}
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
        const best = Math.max(progress.best[levelId - 1] ?? 0, outcome.score);
        const stats = [
          { label: 'Score', value: formatInt(outcome.score) },
          { label: 'Best', value: formatInt(best) },
          { label: 'Lives left', value: String(outcome.livesLeft) },
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
                onPlayAgain={() => onNext(currentLevelId(progress))}
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
                onPlayAgain={() => onNext(currentLevelId(progress))}
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
