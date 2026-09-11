import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/createApp.js';

describe('createApp', () => {
  it('serves /health without listening', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('runs the test suite with NODE_ENV=test (so morgan request logging is skipped)', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });

  it('returns JSON 404 for unknown routes', async () => {
    const res = await request(createApp()).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NotFound');
  });
});
