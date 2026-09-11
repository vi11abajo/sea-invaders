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

  it('rejects /me without a token', async () => {
    const res = await request(createApp()).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('answers 401 for /me with a malformed token', async () => {
    const res = await request(createApp()).get('/api/auth/me').set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'InvalidToken', message: 'Invalid token' });
  });
});
