import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dailySeed, dayOf, dayStart, GRACE_SECONDS } from '../src/services/dailySeed.js';
import { tokenFor } from './helpers/jwt.js';
import * as memory from './helpers/memoryRankedRuns.js';
import { playReplay } from './helpers/play.js';

vi.mock('../src/db/rankedRuns.js', () => import('./helpers/memoryRankedRuns.js'));

const SECRET = 'd'.repeat(40);
process.env.DAILY_SEED_SECRET = SECRET;
process.env.DAILY_FREE_ATTEMPTS = '2';

const { createApp } = await import('../src/createApp.js');
const user = memory.TEST_USER;
const auth = { Authorization: `Bearer ${tokenFor(user)}` };

describe('/api/daily', () => {
  let app;
  beforeEach(() => {
    memory.reset();
    app = createApp();
  });

  it('describes today for anonymous and signed-in callers', async () => {
    const anon = await request(app).get('/api/daily/today');
    expect(anon.status).toBe(200);
    expect(anon.body).toMatchObject({ day: dayOf(Date.now() / 1000), attemptsLeft: 2, coreVersion: 2 });
    expect(anon.body.secondsToNextDay).toBeGreaterThan(0);
    const mine = await request(app).get('/api/daily/today').set(auth);
    expect(mine.body.attemptsLeft).toBe(2);
  });

  it('requires a token to start a run', async () => {
    expect((await request(app).post('/api/daily/runs')).status).toBe(401);
  });

  it('answers 401 (not 403) for a malformed token', async () => {
    const res = await request(app).post('/api/daily/runs').set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'InvalidToken', message: 'Invalid access token' });
  });

  it('starts, finishes and ranks a run', async () => {
    const started = await request(app).post('/api/daily/runs').set(auth);
    expect(started.status).toBe(201);
    const { runId, seed, day } = started.body;
    expect(seed).toBe(dailySeed(SECRET, day));
    const played = playReplay(seed, 300);
    const finished = await request(app).post(`/api/daily/runs/${runId}/finish`).set(auth).send({ replay: played.base64 });
    expect(finished.status).toBe(200);
    expect(finished.body).toMatchObject({ runId, score: played.score, isDayBest: true });
    const board = await request(app).get('/api/daily/leaderboard');
    expect(board.body).toEqual({ day, entries: [{ rank: 1, username: 'Ab12...Cd34', walletAddress: user.wallet_address, score: played.score }] });
  });

  it('maps service errors to their status and code', async () => {
    await request(app).post('/api/daily/runs').set(auth);
    await request(app).post('/api/daily/runs').set(auth);
    const third = await request(app).post('/api/daily/runs').set(auth);
    expect(third.status).toBe(403);
    expect(third.body).toMatchObject({ error: 'RankedRun', code: 'no_attempts' });
    const missing = await request(app).post('/api/daily/runs/00000000-0000-0000-0000-000000000000/finish').set(auth).send({ replay: 'AAAA' });
    expect(missing.status).toBe(404);
  });

  it('answers 404 for a non-UUID run id instead of erroring', async () => {
    const res = await request(app).post('/api/daily/runs/not-a-uuid/finish').set(auth).send({ replay: 'AAAA' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'RunNotFound', message: 'Run not found' });
  });

  it('publishes a seed only after its day closes', async () => {
    const today = dayOf(Date.now() / 1000);
    expect((await request(app).get(`/api/daily/seed/${today}`)).status).toBe(404);
    const old = today - 2;
    const res = await request(app).get(`/api/daily/seed/${old}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ day: old, seed: dailySeed(SECRET, old) });
    expect((await request(app).get('/api/daily/seed/abc')).status).toBe(400);
  });
});
