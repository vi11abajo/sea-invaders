import type { CampaignProgress } from '@sea-invaders/core';
import { apiFetch } from './client';

/**
 * The caller's server-stored campaign progress. Rejects with `ApiError` (404, code `not_found`)
 * when the wallet has never synced — callers should treat that as "no server copy yet".
 */
export function getCampaign(): Promise<{ progress: CampaignProgress }> {
  return apiFetch<{ progress: CampaignProgress }>('/api/campaign', { auth: true });
}

/**
 * Pushes local progress to the server, which merges it with its stored copy (`mergeProgress`)
 * and returns the merge. Rejects with `ApiError` (400, code `invalid_progress`) if malformed.
 */
export function putCampaign(progress: CampaignProgress): Promise<{ progress: CampaignProgress }> {
  return apiFetch<{ progress: CampaignProgress }>('/api/campaign', { method: 'PUT', auth: true, body: { progress } });
}
