import { fromUint8Array } from 'js-base64';
import type { PreparedTx } from './chain';
import { apiFetch } from './client';
import type { Cluster } from './config';

export interface TodayInfo {
  day: number;
  secondsToNextDay: number;
  attemptsLeft: number;
  /** The player's best verified score today; null when signed out or without a run. */
  todayBest: number | null;
  coreVersion: number;
  /** Ranked attempts bought today on top of the free daily allowance. */
  attemptsBought: number;
  freeAttempts: number;
  /** Whether the wallet already has a player account on-chain. */
  hasPlayerAccount: boolean;
  /** The on-chain best recorded for today's weekday, 0 until a record transaction lands. */
  recordedBest: number;
  /** Null when the on-chain Config account cannot be read. */
  ticketPriceSkr: number | null;
  poolSkr: number;
  weekTotal: number;
  weekRank: number | null;
  skrBalance: number;
  cluster: Cluster;
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

/** Prepares the on-chain ticket purchase transaction for the caller to sign and send. */
export function requestTicket(): Promise<PreparedTx & { createsPlayer: boolean }> {
  return apiFetch('/api/daily/ticket', { method: 'POST', auth: true });
}

/** Devnet only: mints 100 test SKR to the caller's wallet server-side, no wallet interaction needed. */
export function requestFaucet(): Promise<{ signature: string; amountSkr: number }> {
  return apiFetch('/api/devnet/faucet', { method: 'POST', auth: true });
}

export interface ConfirmTicketResult {
  confirmed: boolean;
  /** Present once `confirmed` is true. */
  attemptsLeft?: number;
}

/**
 * Polls whether a ticket purchase landed. Resolves `{ confirmed: false }` (202) while the
 * transaction is not yet visible on-chain, `{ confirmed: true, attemptsLeft }` (200) once it
 * lands, or rejects with `ApiError` (code `ticket_failed`, 409) if it landed but errored.
 */
export function confirmTicket(signature: string): Promise<ConfirmTicketResult> {
  return apiFetch('/api/daily/ticket/confirm', { method: 'POST', auth: true, body: { signature } });
}
