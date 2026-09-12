import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tokenFor } from './helpers/jwt.js';
import * as memory from './helpers/memoryRankedRuns.js';
import * as memoryCampaign from './helpers/memoryCampaign.js';

vi.mock('../src/db/campaign.js', () => import('./helpers/memoryCampaign.js'));

const { createApp } = await import('../src/createApp.js');
const user = memory.TEST_USER;
const auth = { Authorization: `Bearer ${tokenFor(user)}` };

function makeProgress(overrides = {}) {
  return {
    v: 1,
    reef: 1,
    level: 1,
    lives: 5,
    cleared: new Array(30).fill(false),
    best: new Array(30).fill(0),
    updatedAt: 1000,
    ...overrides,
  };
}

describe('/api/campaign', () => {
  let app;
  beforeEach(() => {
    memoryCampaign.reset();
    app = createApp();
  });

  it('requires a token for GET and PUT', async () => {
    expect((await request(app).get('/api/campaign')).status).toBe(401);
    expect((await request(app).put('/api/campaign').send({ progress: makeProgress() })).status).toBe(401);
  });

  it('answers 404 before any PUT', async () => {
    const res = await request(app).get('/api/campaign').set(auth);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'CampaignProgress', code: 'not_found', message: 'No campaign progress yet' });
  });

  it('stores and returns progress on PUT, then GET reflects it', async () => {
    const progress = makeProgress({ reef: 2, level: 3, lives: 4, updatedAt: 2000 });
    const put = await request(app).put('/api/campaign').set(auth).send({ progress });
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ progress });

    const get = await request(app).get('/api/campaign').set(auth);
    expect(get.status).toBe(200);
    expect(get.body).toEqual({ progress });
  });

  it('merges a second PUT: cleared union, best max, newer position wins', async () => {
    const cleared1 = new Array(30).fill(false);
    cleared1[0] = true;
    const best1 = new Array(30).fill(0);
    best1[0] = 500;
    const first = makeProgress({ reef: 1, level: 2, lives: 3, cleared: cleared1, best: best1, updatedAt: 1000 });
    await request(app).put('/api/campaign').set(auth).send({ progress: first });

    const cleared2 = new Array(30).fill(false);
    cleared2[1] = true;
    const best2 = new Array(30).fill(0);
    best2[0] = 300; // lower than first's 500 at the same index
    best2[1] = 800;
    const second = makeProgress({ reef: 2, level: 4, lives: 5, cleared: cleared2, best: best2, updatedAt: 2000 });
    const res = await request(app).put('/api/campaign').set(auth).send({ progress: second });

    expect(res.status).toBe(200);
    const expectedCleared = new Array(30).fill(false);
    expectedCleared[0] = true;
    expectedCleared[1] = true;
    const expectedBest = new Array(30).fill(0);
    expectedBest[0] = 500; // max(500, 300)
    expectedBest[1] = 800;
    expect(res.body).toEqual({
      progress: {
        v: 1,
        reef: 2, // second is newer (updatedAt 2000 > 1000)
        level: 4,
        lives: 5,
        cleared: expectedCleared,
        best: expectedBest,
        updatedAt: 2000,
      },
    });
  });

  it('answers 400 BadRequest for a malformed progress body', async () => {
    const res = await request(app).put('/api/campaign').set(auth).send({ progress: { v: 1, reef: 6, level: 1, lives: 5, cleared: [], best: [], updatedAt: 1 } });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'BadRequest', code: 'invalid_progress' });
  });

  it('answers 400 BadRequest when the progress field is missing entirely', async () => {
    const res = await request(app).put('/api/campaign').set(auth).send({});
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'BadRequest', code: 'invalid_progress' });
  });
});
