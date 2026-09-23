// The rate limiters behind nginx: nginx on the same host appends the client's address to
// X-Forwarded-For, and the app trusts that loopback hop, so each client gets its own bucket.
// supertest connects over loopback, exactly like nginx does in production.
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/createApp.js';
import { apiLimiter, authLimiter } from '../src/middleware/rateLimit.js';

const PLAYER_A = '203.0.113.10';
const PLAYER_B = '198.51.100.20';

describe('rate limiting per forwarded client address', () => {
  let app;
  beforeEach(() => {
    for (const ip of [PLAYER_A, PLAYER_B, '127.0.0.1', '::ffff:127.0.0.1']) {
      authLimiter.resetKey(ip);
      apiLimiter.resetKey(`ip:${ip}`);
    }
    app = createApp();
  });

  it('reads the client address nginx forwards, not the proxy hop', () => {
    expect(app.get('trust proxy')).toBe('loopback');
  });

  it('keeps separate sign-in buckets for two forwarded addresses', async () => {
    // Failed sign-ins count against authLimiter; each address spends only its own budget.
    const fail = (ip) => request(app).post('/api/auth/siws/verify').set('X-Forwarded-For', ip).send({});
    const a1 = await fail(PLAYER_A);
    const a2 = await fail(PLAYER_A);
    const b1 = await fail(PLAYER_B);
    expect([a1.status, a2.status, b1.status]).toEqual([401, 401, 401]);
    expect(Number(a1.headers['ratelimit-remaining'])).toBe(49);
    expect(Number(a2.headers['ratelimit-remaining'])).toBe(48);
    expect(Number(b1.headers['ratelimit-remaining'])).toBe(49);
  });

  it('locks out only the address that used up its sign-in budget', async () => {
    for (let i = 0; i < 50; i++) {
      await request(app).post('/api/auth/siws/verify').set('X-Forwarded-For', PLAYER_A).send({});
    }
    const blocked = await request(app).post('/api/auth/siws/verify').set('X-Forwarded-For', PLAYER_A).send({});
    expect(blocked.status).toBe(429);
    const other = await request(app).post('/api/auth/siws/verify').set('X-Forwarded-For', PLAYER_B).send({});
    expect(other.status).toBe(401);
  });

  it('keeps separate anonymous API buckets for two forwarded addresses', async () => {
    // A route behind apiLimiter alone; every request counts there, whatever its answer.
    const hit = (ip) => request(app).get('/api/daily/seed/not-a-day').set('X-Forwarded-For', ip);
    const a1 = await hit(PLAYER_A);
    const a2 = await hit(PLAYER_A);
    const b1 = await hit(PLAYER_B);
    expect([a1.status, a2.status, b1.status]).toEqual([400, 400, 400]);
    const limit = Number(a1.headers['ratelimit-limit']);
    expect(Number(a1.headers['ratelimit-remaining'])).toBe(limit - 1);
    expect(Number(a2.headers['ratelimit-remaining'])).toBe(limit - 2);
    expect(Number(b1.headers['ratelimit-remaining'])).toBe(limit - 1);
  });

  it('keys on the address nginx appended, not on one the client wrote in front of it', async () => {
    // nginx appends the real peer address; a client-supplied value can only sit to its left.
    const spoofed = await request(app).post('/api/auth/siws/verify').set('X-Forwarded-For', `${PLAYER_B}, ${PLAYER_A}`).send({});
    const named = await request(app).post('/api/auth/siws/verify').set('X-Forwarded-For', PLAYER_B).send({});
    const real = await request(app).post('/api/auth/siws/verify').set('X-Forwarded-For', PLAYER_A).send({});
    expect(Number(spoofed.headers['ratelimit-remaining'])).toBe(49);
    expect(Number(named.headers['ratelimit-remaining'])).toBe(49); // the spoofed name was not charged
    expect(Number(real.headers['ratelimit-remaining'])).toBe(48); // the real sender was
  });
});
