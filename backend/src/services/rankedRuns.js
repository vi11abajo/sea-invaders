import { CORE_VERSION, MAX_REPLAY_TICKS, REPLAY_MODE, TICKS_PER_SECOND, decodeReplay, runReplay } from '@sea-invaders/core';
import { v4 as uuidv4 } from 'uuid';
import * as db from '../db/rankedRuns.js';
import { dailySeed, dayOf, isDayOpen, secondsToNextDay } from './dailySeed.js';

const STATUS = { no_attempts: 403, run_not_found: 404, run_finished: 409, update_required: 426, bad_replay: 400, seed_mismatch: 400, too_fast: 400, day_closed: 400 };

/** Seconds of slack between replay length and wall-clock time, for latency and frame stalls. */
const CLOCK_SLACK_SECONDS = 5;

export class RankedRunError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RankedRunError';
    this.code = code;
    this.status = STATUS[code];
  }
}

/** Temporary stand-in for on-chain tickets (Phase 2B): free attempts per UTC day. */
export function attemptsPerDay() {
  const n = Number.parseInt(process.env.DAILY_FREE_ATTEMPTS ?? '3', 10);
  return Number.isInteger(n) && n > 0 ? n : 3;
}

function seedSecret() {
  const secret = process.env.DAILY_SEED_SECRET;
  if (!secret) throw new Error('DAILY_SEED_SECRET is not configured');
  return secret;
}

export async function todayInfo({ userId, now }) {
  const day = dayOf(now);
  const used = userId ? await db.countRunsForDay(userId, day) : 0;
  const best = userId ? await db.bestForDay(userId, day) : null;
  return { day, secondsToNextDay: secondsToNextDay(now), attemptsLeft: Math.max(0, attemptsPerDay() - used), todayBest: best ? best.score : null };
}

export async function startRun({ userId, now }) {
  const day = dayOf(now);
  const used = await db.countRunsForDay(userId, day);
  if (used >= attemptsPerDay()) throw new RankedRunError('no_attempts', 'No ranked attempts left today');
  const run = { id: uuidv4(), userId, day, seed: dailySeed(seedSecret(), day), coreVersion: CORE_VERSION, startedAt: now };
  await db.insertRun(run);
  return { runId: run.id, day, seed: run.seed, coreVersion: CORE_VERSION, attemptsLeft: attemptsPerDay() - used - 1 };
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
