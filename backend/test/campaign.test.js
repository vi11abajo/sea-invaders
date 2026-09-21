import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tokenFor } from './helpers/jwt.js';
import * as memory from './helpers/memoryRankedRuns.js';
import * as memoryCampaign from './helpers/memoryCampaign.js';

vi.mock('../src/db/campaign.js', () => import('./helpers/memoryCampaign.js'));

const { createApp } = await import('../src/createApp.js');
const user = memory.TEST_USER;
const auth = { Authorization: `Bearer ${tokenFor(user)}` };

/** Levels a current app sends, and the length every answer comes back with. */
const TOTAL = 60;
/** Levels an app from before reefs 6-10 sends: the server pads those records before it merges. */
const LEGACY_TOTAL = 30;

function makeProgress(overrides = {}) {
  return {
    v: 1,
    reef: 1,
    level: 1,
    lives: 5,
    cleared: new Array(TOTAL).fill(false),
    best: new Array(TOTAL).fill(0),
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
    const cleared1 = new Array(TOTAL).fill(false);
    cleared1[0] = true;
    const best1 = new Array(TOTAL).fill(0);
    best1[0] = 500;
    const first = makeProgress({ reef: 1, level: 2, lives: 3, cleared: cleared1, best: best1, updatedAt: 1000 });
    await request(app).put('/api/campaign').set(auth).send({ progress: first });

    const cleared2 = new Array(TOTAL).fill(false);
    cleared2[1] = true;
    const best2 = new Array(TOTAL).fill(0);
    best2[0] = 300; // lower than first's 500 at the same index
    best2[1] = 800;
    const second = makeProgress({ reef: 2, level: 4, lives: 5, cleared: cleared2, best: best2, updatedAt: 2000 });
    const res = await request(app).put('/api/campaign').set(auth).send({ progress: second });

    expect(res.status).toBe(200);
    const expectedCleared = new Array(TOTAL).fill(false);
    expectedCleared[0] = true;
    expectedCleared[1] = true;
    const expectedBest = new Array(TOTAL).fill(0);
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

  it('accepts a thirty-level record from an older app and answers with sixty', async () => {
    const cleared = new Array(LEGACY_TOTAL).fill(false);
    cleared[0] = true;
    const best = new Array(LEGACY_TOTAL).fill(0);
    best[0] = 400;
    const old = makeProgress({ reef: 1, level: 2, lives: 4, cleared, best, updatedAt: 1000 });

    const put = await request(app).put('/api/campaign').set(auth).send({ progress: old });
    expect(put.status).toBe(200);
    expect(put.body.progress.cleared).toHaveLength(TOTAL);
    expect(put.body.progress.best).toHaveLength(TOTAL);
    expect(put.body.progress.cleared[0]).toBe(true);
    expect(put.body.progress.best[0]).toBe(400);
    expect(put.body.progress.cleared.slice(LEGACY_TOTAL)).toEqual(new Array(TOTAL - LEGACY_TOTAL).fill(false));
    expect(put.body.progress.best.slice(LEGACY_TOTAL)).toEqual(new Array(TOTAL - LEGACY_TOTAL).fill(0));

    // The stored copy is the padded one, so a later sixty-level PUT merges against it.
    const grown = makeProgress({ reef: 1, level: 3, lives: 5, updatedAt: 2000 });
    grown.cleared[1] = true;
    const merged = await request(app).put('/api/campaign').set(auth).send({ progress: grown });
    expect(merged.status).toBe(200);
    expect(merged.body.progress.cleared[0]).toBe(true);
    expect(merged.body.progress.cleared[1]).toBe(true);
    expect(merged.body.progress.best[0]).toBe(400);
    expect(merged.body.progress.cleared).toHaveLength(TOTAL);
  });

  it('answers 400 BadRequest for a malformed progress body', async () => {
    const res = await request(app).put('/api/campaign').set(auth).send({ progress: { v: 1, reef: 11, level: 1, lives: 5, cleared: [], best: [], updatedAt: 1 } });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'BadRequest', code: 'invalid_progress' });
  });

  it('answers 400 BadRequest when the progress field is missing entirely', async () => {
    const res = await request(app).put('/api/campaign').set(auth).send({});
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'BadRequest', code: 'invalid_progress' });
  });
});
