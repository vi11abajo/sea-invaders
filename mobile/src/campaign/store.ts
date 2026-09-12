import AsyncStorage from '@react-native-async-storage/async-storage';
import { isValidProgress, newProgress, type CampaignProgress } from '@sea-invaders/core';

const KEY = 'campaign.v1';

/** The stored campaign progress, or a fresh one when nothing valid is stored. */
export async function loadProgress(): Promise<CampaignProgress> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return newProgress(Date.now());
    const parsed: unknown = JSON.parse(raw);
    return isValidProgress(parsed) ? parsed : newProgress(Date.now());
  } catch {
    return newProgress(Date.now());
  }
}

export async function saveProgress(p: CampaignProgress): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(p));
}
