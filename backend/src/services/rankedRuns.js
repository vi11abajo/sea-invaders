import { CORE_VERSION, MAX_REPLAY_TICKS, REPLAY_MODE, OCTOPI, TICKS_PER_SECOND, decodeReplay, runReplay } from '@sea-invaders/core';
import { v4 as uuidv4 } from 'uuid';
import * as db from '../db/rankedRuns.js';
import * as loadoutDb from '../db/loadout.js';
import { getConfig, getPlayer, getTokenBalance, getVaultBalance, getWeekPool } from '../chain/readers.js';
import { currentCluster } from '../chain/config.js';
import { dailySeed, dayOf, isDayOpen, secondsToNextDay, weekOf, weekdayOf } from './dailySeed.js';

const STATUS = {
  no_attempts: 403, run_not_found: 404, run_finished: 409, update_required: 426, bad_replay: 400, seed_mismatch: 400, too_fast: 400, day_closed: 400,
  no_verified_run: 404, already_recorded: 409, no_ticket: 409, no_player_account: 404, record_failed: 409, ticket_failed: 409,
};

/** Seconds of slack between replay length and wall-clock time, for latency and frame stalls. */
const CLOCK_SLACK_SECONDS = 5;

/** The longest replay upload accepted, in base64 characters (about 300 KB of replay); the finish route's 512 KB body limit (createApp.js) leaves room for it. */
export const MAX_REPLAY_BASE64 = 400_000;

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

/**
 * Startup check for the daily seed secret: in production a missing `DAILY_SEED_SECRET` stops the
 * server at once, instead of every ranked run failing later with a 500. Elsewhere it only warns.
 */
export function validateSeedConfig() {
  if (process.env.DAILY_SEED_SECRET) return true;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DAILY_SEED_SECRET is not configured; refusing to start in production');
  }
  console.warn('⚠️  DAILY_SEED_SECRET is not configured: ranked runs will fail until it is set');
  return false;
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

/** Clears the `getPlayer` cache for one wallet, or all wallets (and the shared week reads below) when called with no argument. */
export function clearPlayerCache(wallet) {
  if (wallet) {
    playerCache.delete(wallet);
    return;
  }
  playerCache.clear();
  weekReadsCache.clear();
}

const WEEK_READS_TTL_MS = 10_000;
const weekReadsCache = new Map(); // week -> { value: Promise<[config, weekPool, vaultBalance]>, expiresAt }

/**
 * The reads of `todayInfo` that are the same for every caller - the config, the week's pool and its
 * vault balance - shared for 10 s between signed-out callers, so their Home refreshes do not each hit the RPC.
 * A failed read is not kept. Only the current week is ever asked for, so older entries are dropped.
 */
function weekReads(week) {
  const now = Date.now();
  const cached = weekReadsCache.get(week);
  if (cached && cached.expiresAt > now) return cached.value;
  const value = Promise.all([getConfig(), getWeekPool(week), getVaultBalance(week)]);
  weekReadsCache.clear();
  weekReadsCache.set(week, { value, expiresAt: now + WEEK_READS_TTL_MS });
  value.catch(() => {
    if (weekReadsCache.get(week)?.value === value) weekReadsCache.delete(week);
  });
  return value;
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

  // A signed-in caller always reads fresh (its week rank moves with every record); a signed-out
  // Home refresh shares the last 10 s of the same reads.
  const [[config, weekPool, vaultBalance], player, skrBalance] = await Promise.all([
    wallet ? Promise.all([getConfig(), getWeekPool(week), getVaultBalance(week)]) : weekReads(week),
    wallet ? getCachedPlayer(wallet) : null,
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
    todayBestSkin: best ? best.skin : 0,
    attemptsBought: boughtToday,
    freeAttempts: freeAttempts(),
    hasPlayerAccount: Boolean(player),
    recordedBest: inCurrentWeek ? player.dayBests[weekday] : 0,
    ticketPriceSkr: config ? Number(config.ticketPrice) / 1e6 : null,
    attemptsPerTicket: config ? config.attemptsPerTicket : null,
    poolSkr: Number(vaultBalance) / 1e6,
    weekTotal: inCurrentWeek ? player.dayBests.reduce((sum, score) => sum + score, 0) : 0,
    weekRank,
    skrBalance: Number(skrBalance) / 1e6,
    seeker: Boolean(player?.seeker),
    cluster: currentCluster(),
  };
}

export async function startRun({ userId, wallet, now }) {
  const day = dayOf(now);
  const player = wallet ? await getCachedPlayer(wallet) : null;
  const attemptsAllowed = freeAttempts() + attemptsBoughtToday(player, day);
  const noAttempts = () => new RankedRunError('no_attempts', 'No ranked attempts left today', { attemptsLeft: 0 });
  if (attemptsAllowed === 0) throw noAttempts();
  // The skin snapshotted here is the run's own record forever after - ownership was validated
  // when it was equipped; a boss award can be un-earned later (a campaign reset), but the
  // snapshot is the run's record regardless.
  const loadout = wallet ? await loadoutDb.getLoadout(wallet) : null;
  const skin = loadout?.activeSkin ?? 0;
  const run = { id: uuidv4(), userId, day, seed: dailySeed(seedSecret(), day), coreVersion: CORE_VERSION, startedAt: now, skin };
  // Counting the day's runs and inserting this one is a single locked step per user, so parallel
  // starts queue up instead of all reading the same count and each creating a run.
  const { inserted, used } = await db.insertRunWithinAttempts(run, attemptsAllowed);
  if (!inserted) throw noAttempts();
  return { runId: run.id, day, seed: run.seed, coreVersion: CORE_VERSION, attemptsLeft: attemptsAllowed - used - 1 };
}

function decode(replayBase64) {
  if (typeof replayBase64 !== 'string' || replayBase64.length === 0 || replayBase64.length > MAX_REPLAY_BASE64) {
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
  return { replay, bytes };
}

export async function finishRun({ userId, runId, replayBase64, now }) {
  const run = await db.getRun(runId);
  if (!run || run.userId !== userId) throw new RankedRunError('run_not_found', 'Run not found');
  if (run.status !== 'started') throw new RankedRunError('run_finished', 'Run already finished');

  // Closes the run once: a concurrent finish of the same run that got there first wins.
  const close = async (patch) => {
    if (!(await db.finishRun(runId, { finishedAt: now, ...patch }))) throw new RankedRunError('run_finished', 'Run already finished');
  };
  const reject = async (code, message, reason = code) => {
    await close({ status: 'rejected', rejectReason: reason });
    throw new RankedRunError(code, message);
  };

  // The server's own core changed between this run's start and its finish (a deploy landed
  // mid-run), so it can no longer verify the run. That is never the player's doing: the run is
  // closed as `update_required`, which `countRunsForDay` skips, and the attempt - free or bought -
  // is left for a fresh run (migration 011). Only the version the server stored at the start
  // decides this, never the replay's own version byte, which the client writes.
  if (run.coreVersion !== CORE_VERSION) {
    await close({ status: 'update_required', rejectReason: 'update_required' });
    throw new RankedRunError('update_required', `The server moved from core version ${run.coreVersion} to ${CORE_VERSION} during this run`);
  }

  let decoded;
  try {
    decoded = decode(replayBase64);
  } catch (error) {
    if (error instanceof RankedRunError) await reject(error.code, error.message);
    throw error;
  }
  const { replay, bytes } = decoded;
  // A replay from any other core than the one the run started on spends the attempt like any other
  // bad upload. An app on an older core is still told to update, but gets no refund for it.
  if (replay.version !== run.coreVersion) {
    await reject('update_required', `Replay core version ${replay.version}, this run needs ${run.coreVersion}`, 'version_mismatch');
  }
  if (!isDayOpen(run.day, now)) await reject('day_closed', 'The day window for this run has closed');
  if (replay.ticks > MAX_REPLAY_TICKS) await reject('bad_replay', 'Replay too long');
  if (replay.ticks / TICKS_PER_SECOND > now - run.startedAt + CLOCK_SLACK_SECONDS) {
    await reject('too_fast', 'Replay is longer than the time since the run started');
  }

  let result;
  try {
    result = runReplay(replay, { seed: run.seed, mode: REPLAY_MODE.daily, levelId: 0, lives: OCTOPI.lives, octopi: 'base' });
  } catch (error) {
    await reject('seed_mismatch', error.message);
  }

  await close({
    ticks: result.ticks, score: result.score, stateHash: result.hash, gameOver: result.over,
    replay: Buffer.from(bytes), status: 'verified',
  });
  const best = await db.bestForDay(userId, run.day);
  const dayBest = best ? best.score : result.score;
  return { runId, day: run.day, score: result.score, ticks: result.ticks, gameOver: result.over, hash: result.hash, dayBest, isDayBest: best ? best.runId === runId : true };
}
