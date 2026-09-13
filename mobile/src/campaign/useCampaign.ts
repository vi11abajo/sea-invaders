import { useCallback, useEffect, useState } from 'react';
import {
  applyLevelResult, levelById, livesForEntry, reviveReef, type CampaignProgress, type OctopiVariant, type RunConfig,
} from '@sea-invaders/core';
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

  /**
   * The run config for level `id`, played with the variant `octopi` (design doc §4–5: every campaign
   * run, practice replays of cleared levels included; the core adds Anchor's extra life itself).
   */
  const startLevel = useCallback(
    (id: number, practice: boolean, octopi: OctopiVariant): RunConfig => {
      if (!progress) throw new Error('campaign progress not loaded yet');
      return {
        mode: practice ? 'practice' : 'campaign',
        level: levelById(id),
        lives: practice ? 3 : livesForEntry(progress),
        features: { boosts: true },
        octopi,
      };
    },
    [progress],
  );

  const finishLevel = useCallback(
    async (result: FinishLevelInput): Promise<{ outcome: Outcome; next: CampaignProgress }> => {
      if (!progress) throw new Error('campaign progress not loaded yet');
      const { next, outcome } = applyLevelResult(progress, { ...result, now: Date.now() });
      await saveProgress(next);
      setProgress(next);
      return { outcome, next };
    },
    [progress],
  );

  const reviveNow = useCallback(async (): Promise<void> => {
    if (!progress) throw new Error('campaign progress not loaded yet');
    const next = reviveReef(progress, Date.now());
    await saveProgress(next);
    setProgress(next);
  }, [progress]);

  /** Replaces progress wholesale (a server merge after sign-in) and persists it. */
  const replaceProgress = useCallback(async (next: CampaignProgress): Promise<void> => {
    await saveProgress(next);
    setProgress(next);
  }, []);

  return { progress, startLevel, finishLevel, reviveNow, replaceProgress };
}
