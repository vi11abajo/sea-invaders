// The app's global error handler and its request body limits: what a client is told when a route
// fails, and which uploads the JSON parser accepts.
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tokenFor } from './helpers/jwt.js';

const DB_FAILURE = 'relation "ranked_runs" does not exist';

vi.mock('../src/db/rankedRuns.js', () => ({
  leaderboardForDay: vi.fn(async () => {
    throw new Error(DB_FAILURE);
  }),
}));

const { createApp } = await import('../src/createApp.js');
const auth = { Authorization: `Bearer ${tokenFor({ id: 7, wallet_address: 'Ab12xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxCd34', username: 'Ab12...Cd34' })}` };

describe('the global error handler', () => {
  const { NODE_ENV } = process.env;
  let logged;
  beforeEach(() => {
    logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    process.env.NODE_ENV = NODE_ENV;
    logged.mockRestore();
  });

  it('answers a fixed message for a server fault in production, keeping the details in the log', async () => {
    const app = createApp();
    process.env.NODE_ENV = 'production';
    const res = await request(app).get('/api/daily/leaderboard');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal', message: 'Something went wrong' });
    expect(JSON.stringify(res.body)).not.toContain('ranked_runs');
    expect(logged).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ message: DB_FAILURE }));
  });

  it('keeps the message of a request error in production', async () => {
    const app = createApp();
    process.env.NODE_ENV = 'production';
    const res = await request(app).put('/api/campaign').set(auth).set('Content-Type', 'application/json').send('{"progress": ');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'SyntaxError', message: expect.any(String) });
    expect(res.body.message).not.toBe('Something went wrong');
    expect(res.body.stack).toBeUndefined();
  });

  it('shows the message and the stack outside production', async () => {
    const res = await request(createApp()).get('/api/daily/leaderboard');
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ error: 'Error', message: DB_FAILURE, stack: expect.any(String) });
  });
});

describe('request body limits', () => {
  let logged;
  beforeEach(() => {
    logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    logged.mockRestore();
  });

  /** A JSON body of about `kb` kilobytes. */
  const bodyOf = (kb) => ({ replay: 'A'.repeat(kb * 1024) });

  it('lets a finished run upload a replay up to the 400,000-character cap, past the 256 KB default', async () => {
    // A non-UUID run id answers 404 from the route itself, which the request only reaches once the
    // body has been parsed - a body over the limit would be refused with 413 first.
    const res = await request(createApp()).post('/api/daily/runs/not-a-uuid/finish').set(auth).send({ replay: 'A'.repeat(400_000) });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'run_not_found' });
  });

  it('still refuses a finished-run body over 512 KB', async () => {
    const res = await request(createApp()).post('/api/daily/runs/not-a-uuid/finish').set(auth).send(bodyOf(520));
    expect(res.status).toBe(413);
  });

  it('keeps the 256 KB limit on every other route', async () => {
    const res = await request(createApp()).put('/api/campaign').set(auth).send(bodyOf(300));
    expect(res.status).toBe(413);
  });
});
