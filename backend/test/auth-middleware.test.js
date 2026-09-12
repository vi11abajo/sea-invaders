import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { authenticateToken, optionalAuth } from '../src/middleware/auth.js';
import { TEST_SECRET, tokenFor } from './helpers/jwt.js';

function fakeReq(token) {
  return { headers: token ? { authorization: `Bearer ${token}` } : {} };
}

function fakeRes() {
  const res = {};
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

describe('optionalAuth verify options match authenticateToken', () => {
  const validToken = tokenFor({ id: 1, wallet_address: 'Wallet1111111111111111111111111111111111', username: 'p1' });

  it('optionalAuth accepts a token issued with the matching algorithm/issuer/audience', () => {
    const req = fakeReq(validToken);
    const res = fakeRes();
    let nextCalled = false;
    optionalAuth(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
    expect(req.user).toMatchObject({ userId: 1 });
  });

  it('authenticateToken rejects a token with the wrong audience', () => {
    const wrongAudienceToken = jwt.sign(
      { userId: 1, walletAddress: 'Wallet1111111111111111111111111111111111', username: 'p1' },
      TEST_SECRET,
      { algorithm: 'HS256', issuer: 'sea-invaders', audience: 'some-other-audience', expiresIn: '1h' },
    );

    const req = fakeReq(wrongAudienceToken);
    const res = fakeRes();
    authenticateToken(req, res, () => {
      throw new Error('next() must not be called for a wrong-audience token');
    });

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('InvalidToken');
  });

  it('optionalAuth treats a token with the wrong audience as anonymous, not authenticated', () => {
    const wrongAudienceToken = jwt.sign(
      { userId: 1, walletAddress: 'Wallet1111111111111111111111111111111111', username: 'p1' },
      TEST_SECRET,
      { algorithm: 'HS256', issuer: 'sea-invaders', audience: 'some-other-audience', expiresIn: '1h' },
    );

    const req = fakeReq(wrongAudienceToken);
    const res = fakeRes();
    let nextCalled = false;
    optionalAuth(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
    expect(req.user).toBeNull();
  });

  it('optionalAuth treats a token with the wrong issuer as anonymous', () => {
    const wrongIssuerToken = jwt.sign(
      { userId: 1, walletAddress: 'Wallet1111111111111111111111111111111111', username: 'p1' },
      TEST_SECRET,
      { algorithm: 'HS256', issuer: 'some-other-issuer', audience: 'sea-invaders-players', expiresIn: '1h' },
    );

    const req = fakeReq(wrongIssuerToken);
    const res = fakeRes();
    let nextCalled = false;
    optionalAuth(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
    expect(req.user).toBeNull();
  });
});
