import {
  applyLevelResult, formatInt, levelById, levelSeed, REPLAY_MODE, type CampaignProgress, type RunConfig,
} from '@sea-invaders/core';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GameScreen, type RunOutcome } from '../game/GameScreen';
import { ResultView } from '../game/ResultView';
import { COLORS } from '../ui/tokens';
import { BossIntro } from './BossIntro';
import { LevelIntro } from './LevelIntro';
import type { FinishLevelInput } from './useCampaign';

/** The level-result kind `finishLevel` reports, from the core's progress rules (spec §6.1). */
type Outcome = ReturnType<typeof applyLevelResult>['outcome'];

type Phase = 'intro' | 'boss-intro' | 'playing';

/** Task 19 replaces these with the proper per-outcome copy and buttons. */
const TITLE: Record<Outcome, string> = {
  cleared: 'Level cleared',
  failed: 'Level failed',
  reef_lost: 'Reef lost',
  campaign_complete: 'Campaign complete',
  practice: 'Practice over',
};

interface CampaignLevelScreenProps {
  levelId: number;
  practice: boolean;
  /** The campaign progress before this level's result is applied; used to show the prior best. */
  progress: CampaignProgress;
  startLevel: (id: number, practice: boolean) => RunConfig;
  finishLevel: (result: FinishLevelInput) => Promise<Outcome>;
  /** Called once the player leaves the result screen. */
  onDone: (outcome: Outcome) => void;
  onExit: () => void;
}

/** One campaign level: the intro card, the boss reveal on boss rows, then the run and its result. */
export function CampaignLevelScreen({ levelId, practice, progress, startLevel, finishLevel, onDone, onExit }: CampaignLevelScreenProps) {
  const level = useMemo(() => levelById(levelId), [levelId]);
  // Computed once per screen instance: a fresh RunConfig/seed each time the player re-enters this
  // level, but stable across this screen's own re-renders so the game loop is not restarted.
  const [run] = useState<RunConfig>(() => startLevel(levelId, practice));
  const [seed] = useState<string>(() => levelSeed(`campaign-${Date.now()}`, levelId));
  const [phase, setPhase] = useState<Phase>('intro');
  const [result, setResult] = useState<{ outcome: RunOutcome; kind: Outcome } | null>(null);

  const beginPlay = () => setPhase(level.boss !== undefined ? 'boss-intro' : 'playing');

  const handleRunOver = (outcome: RunOutcome) => {
    void finishLevel({ levelId, practice, cleared: outcome.cleared, livesLeft: outcome.livesLeft, score: outcome.score }).then(
      (kind) => setResult({ outcome, kind }),
    );
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
      renderResult={(outcome) => {
        if (result === null) {
          return (
            <View style={styles.overlay}>
              <ActivityIndicator color={COLORS.text} />
            </View>
          );
        }
        const best = Math.max(progress.best[levelId - 1] ?? 0, outcome.score);
        return (
          <ResultView
            title={TITLE[result.kind]}
            score={outcome.score}
            stats={[
              { label: 'Score', value: formatInt(outcome.score) },
              { label: 'Best', value: formatInt(best) },
              { label: 'Lives left', value: String(outcome.livesLeft) },
            ]}
            onPlayAgain={() => onDone(result.kind)}
            onBack={onExit}
          />
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
});
