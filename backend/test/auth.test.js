import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/createApp.js';

describe('/api/auth', () => {
  it('has no Discord sign-in routes', async () => {
    const app = createApp();
    for (const path of ['/api/auth/discord', '/api/auth/discord/callback']) {
      const res = await request(app).get(path);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('NotFound');
    }
  });
});

describe('the retired web-game routes', () => {
  it('are no longer served: sign-in goes through /api/auth/siws and the boards through /api/daily', async () => {
    const app = createApp();
    const retired = [
      ['get', '/api/auth/me'],
      ['post', '/api/auth/logout'],
      ['post', '/api/scores/session/start'],
      ['post', '/api/scores/session/heartbeat'],
      ['post', '/api/scores/submit'],
      ['get', '/api/scores/my-scores'],
      ['get', '/api/leaderboard'],
      ['get', '/api/leaderboard/test'],
      ['get', '/api/leaderboard/main'],
      ['get', '/api/leaderboard/stats'],
    ];
    for (const [method, path] of retired) {
      const res = await request(app)[method](path);
      expect(res.status, `${method.toUpperCase()} ${path}`).toBe(404);
      expect(res.body.error).toBe('NotFound');
    }
  });

  it('no longer lists them among the endpoints', async () => {
    const res = await request(createApp()).get('/');
    expect(res.body.endpoints).toEqual({ auth: '/api/auth/siws', daily: '/api/daily' });
  });
});
