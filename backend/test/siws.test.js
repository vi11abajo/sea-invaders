import bs58 from 'bs58';
import nacl from 'tweetnacl';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createSignInMessageText } from '@solana/wallet-standard-util';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_SECRET } from './helpers/jwt.js';

vi.mock('../src/db/users.js', () => ({
  findOrCreateWalletUser: vi.fn(async (wallet) => ({ id: 7, wallet_address: wallet, username: `${wallet.slice(0, 4)}...${wallet.slice(-4)}` })),
}));

const { createApp } = await import('../src/createApp.js');
const { issueNonce, signInPayload, verifySignIn, NONCE_TTL_MS } = await import('../src/services/siws.js');

const toB64 = (u8) => Buffer.from(u8).toString('base64');

function signedInput(payload, address, keys, overrides = {}) {
  const text = createSignInMessageText({ ...payload, address, ...overrides });
  const signedMessage = new TextEncoder().encode(text);
  const signature = nacl.sign.detached(signedMessage, keys.secretKey);
  return { address, signedMessage: toB64(signedMessage), signature: toB64(signature) };
}

describe('verifySignIn', () => {
  const keys = nacl.sign.keyPair();
  const address = bs58.encode(keys.publicKey);

  it('accepts a message signed by the address for a live nonce', () => {
    const { nonce, issuedAt } = issueNonce();
    const body = signedInput(signInPayload(nonce, issuedAt), address, keys);
    expect(verifySignIn(body)).toEqual({ ok: true, address });
  });

  it('rejects a reused nonce', () => {
    const { nonce, issuedAt } = issueNonce();
    const body = signedInput(signInPayload(nonce, issuedAt), address, keys);
    expect(verifySignIn(body).ok).toBe(true);
    expect(verifySignIn(body)).toEqual({ ok: false, reason: 'unknown_nonce' });
  });

  it('rejects an expired nonce', () => {
    const start = 1_800_000_000_000;
    const { nonce, issuedAt } = issueNonce(start);
    const body = signedInput(signInPayload(nonce, issuedAt), address, keys);
    expect(verifySignIn(body, start + NONCE_TTL_MS + 1)).toEqual({ ok: false, reason: 'unknown_nonce' });
  });

  it('rejects a wrong domain, a wrong signer and a tampered message', () => {
    const other = nacl.sign.keyPair();
    let p = signInPayload(...Object.values(issueNonce()));
    expect(verifySignIn(signedInput(p, address, keys, { domain: 'evil.example' })).reason).toBe('domain_mismatch');
    p = signInPayload(...Object.values(issueNonce()));
    expect(verifySignIn(signedInput(p, address, other)).reason).toBe('bad_signature');
    p = signInPayload(...Object.values(issueNonce()));
    const body = signedInput(p, address, keys);
    const tampered = { ...body, signedMessage: toB64(new TextEncoder().encode(Buffer.from(body.signedMessage, 'base64').toString() + ' ')) };
    expect(verifySignIn(tampered).ok).toBe(false);
  });

  it('rejects a wrong uri without consuming the nonce', () => {
    const { nonce, issuedAt } = issueNonce();
    const p = signInPayload(nonce, issuedAt);
    const body = signedInput(p, address, keys, { uri: 'https://evil.example' });
    expect(verifySignIn(body)).toEqual({ ok: false, reason: 'uri_mismatch' });
    // the nonce is still live: a correctly-built message for it still verifies
    expect(verifySignIn(signedInput(p, address, keys))).toEqual({ ok: true, address });
  });

  it('rejects a wrong statement without consuming the nonce', () => {
    const { nonce, issuedAt } = issueNonce();
    const p = signInPayload(nonce, issuedAt);
    const body = signedInput(p, address, keys, { statement: 'Some other statement' });
    expect(verifySignIn(body)).toEqual({ ok: false, reason: 'statement_mismatch' });
    // the nonce is still live: a correctly-built message for it still verifies
    expect(verifySignIn(signedInput(p, address, keys))).toEqual({ ok: true, address });
  });

  it('rejects garbage input without throwing', () => {
    expect(verifySignIn({ address: 'not-base58!!', signedMessage: 'xx', signature: 'yy' }).ok).toBe(false);
    expect(verifySignIn({}).ok).toBe(false);
  });
});

describe('SIWS routes', () => {
  let app;
  beforeEach(() => {
    app = createApp();
  });

  it('issues a nonce with the app identity', async () => {
    const res = await request(app).post('/api/auth/siws/nonce');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ domain: 'seainvaders.xyz', uri: 'https://seainvaders.xyz', statement: 'Sign in to Sea Invaders', version: '1' });
    expect(res.body.nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(new Date(res.body.issuedAt).toISOString()).toBe(res.body.issuedAt);
  });

  it('verifies a signature and returns a JWT the app accepts', async () => {
    const keys = nacl.sign.keyPair();
    const address = bs58.encode(keys.publicKey);
    const nonceRes = await request(app).post('/api/auth/siws/nonce');
    const { nonce, issuedAt, domain, uri, statement, version } = nonceRes.body;
    const body = signedInput({ domain, uri, statement, version, nonce, issuedAt }, address, keys);
    const res = await request(app).post('/api/auth/siws/verify').send(body);
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: 7, walletAddress: address, username: `${address.slice(0, 4)}...${address.slice(-4)}` });
    const claims = jwt.verify(res.body.token, TEST_SECRET, { issuer: 'sea-invaders', audience: 'sea-invaders-players' });
    expect(claims).toMatchObject({ userId: 7, walletAddress: address });
  });

  it('answers 401 with a reason on a bad signature', async () => {
    const keys = nacl.sign.keyPair();
    const other = nacl.sign.keyPair();
    const address = bs58.encode(keys.publicKey);
    const { body: p } = await request(app).post('/api/auth/siws/nonce');
    const res = await request(app).post('/api/auth/siws/verify').send(signedInput(p, address, other));
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'SignInRejected', reason: 'bad_signature' });
  });
});
