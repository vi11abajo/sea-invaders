import { fromUint8Array } from 'js-base64';
import { apiFetch } from './client';

export interface TodayInfo {
  day: number;
  secondsToNextDay: number;
  attemptsLeft: number;
  /** The player's best verified score today; null when signed out or without a run. */
  todayBest: number | null;
  coreVersion: number;
}

export interface StartedRun {
  runId: string;
  day: number;
  seed: string;
  coreVersion: number;
  attemptsLeft: number;
}

export interface FinishedRun {
  runId: string;
  day: number;
  score: number;
  ticks: number;
  gameOver: boolean;
  hash: string;
  dayBest: number;
  isDayBest: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  walletAddress: string;
  score: number;
}

export function getToday(signedIn: boolean): Promise<TodayInfo> {
  return apiFetch<TodayInfo>('/api/daily/today', { auth: signedIn });
}

export function startRun(): Promise<StartedRun> {
  return apiFetch<StartedRun>('/api/daily/runs', { method: 'POST', auth: true });
}

export function finishRun(runId: string, replay: Uint8Array): Promise<FinishedRun> {
  return apiFetch<FinishedRun>(`/api/daily/runs/${runId}/finish`, { method: 'POST', auth: true, body: { replay: fromUint8Array(replay) } });
}

export function getLeaderboard(day?: number): Promise<{ day: number; entries: LeaderboardEntry[] }> {
  return apiFetch(`/api/daily/leaderboard${day === undefined ? '' : `?day=${day}`}`);
}
