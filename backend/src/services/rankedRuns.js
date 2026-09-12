import { CORE_VERSION, MAX_REPLAY_TICKS, REPLAY_MODE, TICKS_PER_SECOND, decodeReplay, runReplay } from '@sea-invaders/core';
import { v4 as uuidv4 } from 'uuid';
import * as db from '../db/rankedRuns.js';
import { getConfig, getPlayer, getTokenBalance, getVaultBalance, getWeekPool } from '../chain/readers.js';
import { dailySeed, dayOf, isDayOpen, secondsToNextDay, weekOf, weekdayOf } from './dailySeed.js';

const STATUS = {
  no_attempts: 403, run_not_found: 404, run_finished: 409, update_required: 426, bad_replay: 400, seed_mismatch: 400, too_fast: 400, day_closed: 400,
  no_verified_run: 404, already_recorded: 409, no_ticket: 409, no_player_account: 404, record_failed: 409, ticket_failed: 409,
};

/** Seconds of slack between replay length and wall-clock time, for latency and frame stalls. */
const CLOCK_SLACK_SECONDS = 5;

export class RankedRunError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'RankedRunError';
    this.code = code;
    this.status = STATUS[code];
    this.extra = extra;
  }
}

/** Free ranked attempts per UTC day, granted regardless of on-chain tickets (default 0 now that tickets exist). */
export function freeAttempts() {
  const n = Number.parseInt(process.env.DAILY_FREE_ATTEMPTS ?? '0', 10);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

function seedSecret() {
  const secret = process.env.DAILY_SEED_SECRET;
  if (!secret) throw new Error('DAILY_SEED_SECRET is not configured');
  return secret;
}

const PLAYER_CACHE_TTL_MS = 5000;
const playerCache = new Map(); // wallet -> { value, expiresAt }

/** `getPlayer`, cached for 5 s per wallet so repeated Home refreshes don't each hit the RPC. */
export async function getCachedPlayer(wallet) {
  if (!wallet) return null;
  const cached = playerCache.get(wallet);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;
  const value = await getPlayer(wallet);
  playerCache.set(wallet, { value, expiresAt: now + PLAYER_CACHE_TTL_MS });
  return value;
}

/** Clears the `getPlayer` cache for one wallet, or all wallets when called with no argument. */
export function clearPlayerCache(wallet) {
  if (wallet) playerCache.delete(wallet);
  else playerCache.clear();
}

/** Attempts bought today via an on-chain ticket: only valid while `ticketDay` still matches today. */
export function attemptsBoughtToday(player, day) {
  return player && player.ticketDay === day ? player.attemptsBought : 0;
}

export async function todayInfo({ userId, wallet, now }) {
  const day = dayOf(now);
  const week = weekOf(day);
  const weekday = weekdayOf(day);

  const used = userId ? await db.countRunsForDay(userId, day) : 0;
  const best = userId ? await db.bestForDay(userId, day) : null;

  const [config, player, weekPool, vaultBalance, skrBalance] = await Promise.all([
    getConfig(),
    wallet ? getCachedPlayer(wallet) : null,
    getWeekPool(week),
    getVaultBalance(week),
    wallet ? getTokenBalance(wallet) : 0n,
  ]);

  const boughtToday = attemptsBoughtToday(player, day);
  const attemptsAllowed = freeAttempts() + boughtToday;
  const inCurrentWeek = player && player.week === week;
  const weekRank = weekPool && wallet ? (() => {
    const idx = weekPool.top.findIndex((entry) => entry.player === wallet);
    return idx === -1 ? null : idx + 1;
  })() : null;

  return {
    day,
    secondsToNextDay: secondsToNextDay(now),
    attemptsLeft: Math.max(0, attemptsAllowed - used),
    todayBest: best ? best.score : null,
    attemptsBought: boughtToday,
    freeAttempts: freeAttempts(),
    hasPlayerAccount: Boolean(player),
    recordedBest: inCurrentWeek ? player.dayBests[weekday] : 0,
    ticketPriceSkr: config ? Number(config.ticketPrice) / 1e6 : null,
    poolSkr: Number(vaultBalance) / 1e6,
    weekTotal: inCurrentWeek ? player.dayBests.reduce((sum, score) => sum + score, 0) : 0,
    weekRank,
    skrBalance: Number(skrBalance) / 1e6,
    cluster: process.env.SOLANA_CLUSTER || 'devnet',
  };
}

export async function startRun({ userId, wallet, now }) {
  const day = dayOf(now);
  const used = await db.countRunsForDay(userId, day);
  const player = wallet ? await getCachedPlayer(wallet) : null;
  const attemptsAllowed = freeAttempts() + attemptsBoughtToday(player, day);
  if (used >= attemptsAllowed) throw new RankedRunError('no_attempts', 'No ranked attempts left today', { attemptsLeft: 0 });
  const run = { id: uuidv4(), userId, day, seed: dailySeed(seedSecret(), day), coreVersion: CORE_VERSION, startedAt: now };
  await db.insertRun(run);
  return { runId: run.id, day, seed: run.seed, coreVersion: CORE_VERSION, attemptsLeft: attemptsAllowed - used - 1 };
}

function decode(replayBase64) {
  if (typeof replayBase64 !== 'string' || replayBase64.length === 0 || replayBase64.length > 400_000) {
    throw new RankedRunError('bad_replay', 'Replay is missing or too large');
  }
  const bytes = new Uint8Array(Buffer.from(replayBase64, 'base64'));
  if (bytes.length === 0) throw new RankedRunError('bad_replay', 'Replay is not valid base64');
  let replay;
  try {
    replay = decodeReplay(bytes);
  } catch (error) {
    throw new RankedRunError('bad_replay', `Replay does not decode: ${error.message}`);
  }
  if (replay.version !== CORE_VERSION) throw new RankedRunError('update_required', `Replay core version ${replay.version}, server has ${CORE_VERSION}`);
  return { replay, bytes };
}

export async function finishRun({ userId, runId, replayBase64, now }) {
  const run = await db.getRun(runId);
  if (!run || run.userId !== userId) throw new RankedRunError('run_not_found', 'Run not found');
  if (run.status !== 'started') throw new RankedRunError('run_finished', 'Run already finished');

  const reject = async (code, message) => {
    await db.finishRun(runId, { finishedAt: now, status: 'rejected', rejectReason: code });
    throw new RankedRunError(code, message);
  };

  let decoded;
  try {
    decoded = decode(replayBase64);
  } catch (error) {
    if (error instanceof RankedRunError && error.code !== 'update_required') await reject(error.code, error.message);
    throw error;
  }
  const { replay, bytes } = decoded;
  if (!isDayOpen(run.day, now)) await reject('day_closed', 'The day window for this run has closed');
  if (replay.ticks > MAX_REPLAY_TICKS) await reject('bad_replay', 'Replay too long');
  if (replay.ticks / TICKS_PER_SECOND > now - run.startedAt + CLOCK_SLACK_SECONDS) {
    await reject('too_fast', 'Replay is longer than the time since the run started');
  }

  let result;
  try {
    result = runReplay(replay, { seed: run.seed, mode: REPLAY_MODE.daily });
  } catch (error) {
    await reject('seed_mismatch', error.message);
  }

  await db.finishRun(runId, {
    finishedAt: now, ticks: result.ticks, score: result.score, stateHash: result.hash, gameOver: result.over,
    replay: Buffer.from(bytes), status: 'verified',
  });
  const best = await db.bestForDay(userId, run.day);
  const dayBest = best ? best.score : result.score;
  return { runId, day: run.day, score: result.score, ticks: result.ticks, gameOver: result.over, hash: result.hash, dayBest, isDayBest: best ? best.runId === runId : true };
}
