import { useCallback, useEffect, useState } from 'react';
import { applyLevelResult, levelById, livesForEntry, revive, type CampaignProgress, type RunConfig } from '@sea-invaders/core';
import { loadProgress, saveProgress } from './store';

type LevelResult = Parameters<typeof applyLevelResult>[1];
type Outcome = ReturnType<typeof applyLevelResult>['outcome'];

/** Everything but `now`: the hook stamps the current time itself, keeping callers free of it. */
export type FinishLevelInput = Omit<LevelResult, 'now'>;

/**
 * The player's campaign progress, restored from storage on mount (`progress` is `null` while
 * loading). Kept free of UI: screens read `progress` and call `startLevel` / `finishLevel` / `reviveNow`.
 */
export function useCampaign() {
  const [progress, setProgress] = useState<CampaignProgress | null>(null);

  useEffect(() => {
    let alive = true;
    loadProgress().then((p) => {
      if (alive) setProgress(p);
    });
    return () => {
      alive = false;
    };
  }, []);

  const startLevel = useCallback(
    (id: number, practice: boolean): RunConfig => {
      if (!progress) throw new Error('campaign progress not loaded yet');
      return {
        mode: practice ? 'practice' : 'campaign',
        level: levelById(id),
        lives: practice ? 3 : livesForEntry(progress),
        features: { boosts: true },
      };
    },
    [progress],
  );

  const finishLevel = useCallback(
    async (result: FinishLevelInput): Promise<Outcome> => {
      if (!progress) throw new Error('campaign progress not loaded yet');
      const { next, outcome } = applyLevelResult(progress, { ...result, now: Date.now() });
      await saveProgress(next);
      setProgress(next);
      return outcome;
    },
    [progress],
  );

  const reviveNow = useCallback(async (): Promise<void> => {
    if (!progress) throw new Error('campaign progress not loaded yet');
    const next = revive(progress, Date.now());
    await saveProgress(next);
    setProgress(next);
  }, [progress]);

  return { progress, startLevel, finishLevel, reviveNow };
}
