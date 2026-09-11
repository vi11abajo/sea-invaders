import { CORE_VERSION, REPLAY_MODE } from '@sea-invaders/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dailySeed, dayOf, dayStart, GRACE_SECONDS } from '../src/services/dailySeed.js';
import * as memory from './helpers/memoryRankedRuns.js';
import { playReplay } from './helpers/play.js';

vi.mock('../src/db/rankedRuns.js', () => import('./helpers/memoryRankedRuns.js'));

const SECRET = 's'.repeat(40);
process.env.DAILY_SEED_SECRET = SECRET;
process.env.DAILY_FREE_ATTEMPTS = '3';

const { startRun, finishRun, todayInfo, RankedRunError } = await import('../src/services/rankedRuns.js');

const NOON = Date.UTC(2026, 8, 11, 12) / 1000;
const DAY = dayOf(NOON);

describe('startRun', () => {
  beforeEach(() => memory.reset());

  it('returns the daily seed, the day and the attempts left', async () => {
    const run = await startRun({ userId: 7, now: NOON });
    expect(run).toMatchObject({ day: DAY, seed: dailySeed(SECRET, DAY), coreVersion: CORE_VERSION, attemptsLeft: 2 });
    expect(run.runId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('stops after the free attempts for the day', async () => {
    await startRun({ userId: 7, now: NOON });
    await startRun({ userId: 7, now: NOON + 1 });
    await startRun({ userId: 7, now: NOON + 2 });
    await expect(startRun({ userId: 7, now: NOON + 3 })).rejects.toMatchObject({ code: 'no_attempts', status: 403 });
    expect((await todayInfo({ userId: 7, now: NOON + 3 })).attemptsLeft).toBe(0);
    const tomorrow = await startRun({ userId: 7, now: dayStart(DAY + 1) + 10 });
    expect(tomorrow.day).toBe(DAY + 1);
  });
});

describe('finishRun', () => {
  beforeEach(() => memory.reset());

  it('verifies a genuine replay and reports the day best', async () => {
    const { runId, seed } = await startRun({ userId: 7, now: NOON });
    const played = playReplay(seed, 1200);
    const result = await finishRun({ userId: 7, runId, replayBase64: played.base64, now: NOON + 30 });
    expect(result).toMatchObject({ runId, day: DAY, score: played.score, ticks: played.ticks, gameOver: played.over, isDayBest: true, dayBest: played.score });
    expect(result.hash).toMatch(/^[0-9a-f]{16}$/);
    expect((await memory.getRun(runId)).status).toBe('verified');
    expect((await todayInfo({ userId: 7, now: NOON + 31 })).todayBest).toBe(played.score);
    expect((await todayInfo({ userId: null, now: NOON + 31 })).todayBest).toBeNull();
  });

  it('rejects a replay recorded on another seed', async () => {
    const { runId } = await startRun({ userId: 7, now: NOON });
    const played = playReplay('someone-elses-seed', 600);
    await expect(finishRun({ userId: 7, runId, replayBase64: played.base64, now: NOON + 20 })).rejects.toMatchObject({ code: 'seed_mismatch', status: 400 });
    expect((await memory.getRun(runId)).status).toBe('rejected');
  });

  it('rejects a replay in practice mode', async () => {
    const { runId, seed } = await startRun({ userId: 7, now: NOON });
    const played = playReplay(seed, 600, REPLAY_MODE.practice);
    await expect(finishRun({ userId: 7, runId, replayBase64: played.base64, now: NOON + 20 })).rejects.toMatchObject({ code: 'seed_mismatch' });
  });

  it('rejects a replay longer than the wall clock allows', async () => {
    const { runId, seed } = await startRun({ userId: 7, now: NOON });
    const played = playReplay(seed, 1200);
    expect(played.ticks).toBeGreaterThan(300); // more than 5 s of play, which zero seconds of wall clock cannot fit
    await expect(finishRun({ userId: 7, runId, replayBase64: played.base64, now: NOON })).rejects.toMatchObject({ code: 'too_fast' });
  });

  it('rejects a run finished after the day window', async () => {
    const start = dayStart(DAY + 1) - 60;
    const { runId, seed } = await startRun({ userId: 7, now: start });
    const played = playReplay(seed, 600);
    await expect(finishRun({ userId: 7, runId, replayBase64: played.base64, now: dayStart(DAY + 1) + GRACE_SECONDS })).rejects.toMatchObject({ code: 'day_closed' });
    const ok = await startRun({ userId: 7, now: start + 1 });
    const okPlayed = playReplay(ok.seed, 600);
    await expect(finishRun({ userId: 7, runId: ok.runId, replayBase64: okPlayed.base64, now: dayStart(DAY + 1) + GRACE_SECONDS - 1 })).resolves.toMatchObject({ day: DAY });
  });

  it('rejects unknown, foreign, finished and malformed runs', async () => {
    const a = await startRun({ userId: 7, now: NOON });
    const b = await startRun({ userId: 7, now: NOON + 1 });
    const played = playReplay(a.seed, 300);
    await expect(finishRun({ userId: 8, runId: a.runId, replayBase64: played.base64, now: NOON + 10 })).rejects.toMatchObject({ code: 'run_not_found' });
    await expect(finishRun({ userId: 7, runId: '00000000-0000-0000-0000-000000000000', replayBase64: played.base64, now: NOON + 10 })).rejects.toMatchObject({ code: 'run_not_found' });
    // A malformed upload consumes the attempt: the run is marked rejected and cannot be retried.
    await expect(finishRun({ userId: 7, runId: b.runId, replayBase64: 'not base64 at all', now: NOON + 10 })).rejects.toMatchObject({ code: 'bad_replay' });
    expect((await memory.getRun(b.runId)).status).toBe('rejected');
    await expect(finishRun({ userId: 7, runId: b.runId, replayBase64: played.base64, now: NOON + 11 })).rejects.toMatchObject({ code: 'run_finished', status: 409 });
    await finishRun({ userId: 7, runId: a.runId, replayBase64: played.base64, now: NOON + 10 });
    await expect(finishRun({ userId: 7, runId: a.runId, replayBase64: played.base64, now: NOON + 11 })).rejects.toMatchObject({ code: 'run_finished', status: 409 });
  });

  it('asks for an update when the replay comes from another core version', async () => {
    const { runId, seed } = await startRun({ userId: 7, now: NOON });
    const bytes = Buffer.from(playReplay(seed, 300).base64, 'base64');
    bytes[0] = CORE_VERSION + 1; // the version is the first varint byte
    await expect(finishRun({ userId: 7, runId, replayBase64: bytes.toString('base64'), now: NOON + 10 })).rejects.toMatchObject({ code: 'update_required', status: 426 });
  });

  it('keeps the higher score as the day best', async () => {
    const a = await startRun({ userId: 7, now: NOON });
    const b = await startRun({ userId: 7, now: NOON + 1 });
    const longer = playReplay(a.seed, 2400);
    const shorter = playReplay(b.seed, 600);
    // b finishes before a: ties in score must be broken by finish time, so b (finished first) stays the
    // day best unless a's score strictly beats it — not whichever run started first.
    const firstFinished = await finishRun({ userId: 7, runId: b.runId, replayBase64: shorter.base64, now: NOON + 60 });
    const secondFinished = await finishRun({ userId: 7, runId: a.runId, replayBase64: longer.base64, now: NOON + 61 });
    expect(firstFinished.isDayBest).toBe(true);
    expect(secondFinished.isDayBest).toBe(longer.score > shorter.score);
    expect(secondFinished.dayBest).toBe(Math.max(longer.score, shorter.score));
  });

  it('exposes RankedRunError', () => {
    expect(new RankedRunError('bad_replay', 'x')).toMatchObject({ code: 'bad_replay', status: 400 });
  });
});
