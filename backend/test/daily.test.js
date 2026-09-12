import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dailySeed, dayOf, dayStart, GRACE_SECONDS, weekOf, weekdayOf } from '../src/services/dailySeed.js';
import { tokenFor } from './helpers/jwt.js';
import { confirmLimiter, sessionLimiter } from '../src/middleware/rateLimit.js';
import * as fakeChain from './helpers/fakeChain.js';
import * as memory from './helpers/memoryRankedRuns.js';
import * as memoryRecords from './helpers/memoryRecords.js';
import * as memoryUsers from './helpers/memoryUsers.js';
import { playReplay } from './helpers/play.js';

vi.mock('../src/db/rankedRuns.js', () => import('./helpers/memoryRankedRuns.js'));
vi.mock('../src/db/records.js', () => import('./helpers/memoryRecords.js'));
vi.mock('../src/db/users.js', () => import('./helpers/memoryUsers.js'));
vi.mock('../src/chain/readers.js', () => import('./helpers/fakeChain.js'));
vi.mock('../src/chain/txs.js', () => import('./helpers/fakeChain.js'));

const SECRET = 'd'.repeat(40);
process.env.DAILY_SEED_SECRET = SECRET;
process.env.DAILY_FREE_ATTEMPTS = '2';

// chainConfig() itself is not mocked (only chain/readers.js and chain/txs.js are); the faucet
// route (via services/faucet.js) calls it directly to find the server authority's own pubkey
// for the balance check. Its value is never inspected by the fakes below, so any valid shape works.
process.env.SOLANA_CLUSTER = process.env.SOLANA_CLUSTER || 'devnet';
process.env.SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
process.env.PROGRAM_ID = process.env.PROGRAM_ID || Keypair.generate().publicKey.toBase58();
process.env.SKR_MINT = process.env.SKR_MINT || Keypair.generate().publicKey.toBase58();
process.env.SERVER_AUTHORITY_SECRET = process.env.SERVER_AUTHORITY_SECRET || bs58.encode(Keypair.generate().secretKey);

const { createApp } = await import('../src/createApp.js');
const { clearPlayerCache } = await import('../src/services/rankedRuns.js');
const { clearWeekViewCache } = await import('../src/services/records.js');
const { resetFaucetCooldown } = await import('../src/routes/devnet.js');
const user = memory.TEST_USER;
const auth = { Authorization: `Bearer ${tokenFor(user)}` };
const nowSeconds = () => Math.floor(Date.now() / 1000);

describe('/api/daily', () => {
  let app;
  beforeEach(() => {
    memory.reset();
    memoryRecords.reset();
    memoryUsers.reset();
    fakeChain.reset();
    clearPlayerCache();
    clearWeekViewCache();
    sessionLimiter.resetKey(`user:${user.id}`);
    confirmLimiter.resetKey(`user:${user.id}`);
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

  it('reports the on-chain fields on today for anonymous and ticket-holding callers', async () => {
    const anon = await request(app).get('/api/daily/today');
    expect(anon.body).toMatchObject({
      attemptsBought: 0, freeAttempts: 2, hasPlayerAccount: false, ticketPriceSkr: 10, attemptsPerTicket: 3, poolSkr: 0,
      weekTotal: 0, weekRank: null, skrBalance: 0, cluster: 'devnet', recordedBest: 0,
    });

    const today = dayOf(Date.now() / 1000);
    const week = weekOf(today);
    const weekday = weekdayOf(today);
    const dayBests = [0, 0, 0, 0, 0, 0, 0];
    dayBests[weekday] = 42;
    fakeChain.setPlayer(user.wallet_address, { week, ticketDay: today, attemptsBought: 3, dayBests });
    fakeChain.setBalance(user.wallet_address, 25_000_000n);
    fakeChain.setWeekPool(week, { vault: `Vault${week}`, top: [{ player: user.wallet_address, total: 42, updatedAt: today }], settled: false });

    const mine = await request(app).get('/api/daily/today').set(auth);
    expect(mine.body).toMatchObject({
      attemptsBought: 3, freeAttempts: 2, hasPlayerAccount: true, attemptsLeft: 5,
      weekTotal: 42, weekRank: 1, skrBalance: 25, recordedBest: 42,
    });
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
    expect(res.body).toEqual({ error: 'RankedRun', code: 'run_not_found', message: 'Run not found' });
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

  it('requires a token to buy a ticket', async () => {
    expect((await request(app).post('/api/daily/ticket')).status).toBe(401);
  });

  it('issues a ticket tx, flagging whether it also creates the player', async () => {
    const res = await request(app).post('/api/daily/ticket').set(auth);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      transaction: expect.any(String), blockhash: expect.any(String), lastValidBlockHeight: expect.any(Number), minContextSlot: 1234, createsPlayer: true,
    });

    fakeChain.setPlayer(user.wallet_address, {});
    const again = await request(app).post('/api/daily/ticket').set(auth);
    expect(again.body.createsPlayer).toBe(false);
  });

  describe('ticket confirm', () => {
    it('confirms a ticket purchase, clearing the cached player so attempts update immediately', async () => {
      const day = dayOf(nowSeconds());
      // Prime the 5s player cache with the pre-purchase (no player) state, like a Home refresh would.
      const before = await request(app).get('/api/daily/today').set(auth);
      expect(before.body.attemptsLeft).toBe(2);

      fakeChain.setPlayer(user.wallet_address, { ticketDay: day, attemptsBought: 3 });

      const pending = await request(app).post('/api/daily/ticket/confirm').set(auth).send({ signature: 'ticket-sig-1' });
      expect(pending.status).toBe(202);
      expect(pending.body).toEqual({ confirmed: false });

      fakeChain.setTxStatus('ticket-sig-1', true);
      const confirmed = await request(app).post('/api/daily/ticket/confirm').set(auth).send({ signature: 'ticket-sig-1' });
      expect(confirmed.status).toBe(200);
      expect(confirmed.body).toEqual({ confirmed: true, attemptsLeft: 5 });

      // Without clearing the cache this would still report the pre-purchase attemptsLeft (2).
      const after = await request(app).get('/api/daily/today').set(auth);
      expect(after.body.attemptsLeft).toBe(5);
    });

    it('requires a token and a signature', async () => {
      expect((await request(app).post('/api/daily/ticket/confirm')).status).toBe(401);
      const res = await request(app).post('/api/daily/ticket/confirm').set(auth).send({});
      expect(res.status).toBe(400);
    });

    it('treats a missing ticket transaction as pending (202) and a failed one as terminal (409)', async () => {
      const pending = await request(app).post('/api/daily/ticket/confirm').set(auth).send({ signature: 'ticket-missing' });
      expect(pending.status).toBe(202);
      expect(pending.body).toEqual({ confirmed: false });

      fakeChain.setTxStatus('ticket-failed', false);
      const res = await request(app).post('/api/daily/ticket/confirm').set(auth).send({ signature: 'ticket-failed' });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: 'RankedRun', code: 'ticket_failed', message: 'The ticket transaction failed on chain' });
    });

    // The mobile client polls /ticket/confirm every 2s for up to 60s, i.e. up to 30 requests
    // per confirmation flow (mobile/src/api/chain.ts). confirmLimiter allows 60/min per user —
    // well above that — so a full poll run must never see a 429, unlike sessionLimiter's 10/min
    // (shared with /runs and /ticket), which this exact burst would trip.
    it('does not trip the confirm limiter across a full 31-call mobile poll burst', async () => {
      for (let i = 0; i < 31; i++) {
        const res = await request(app).post('/api/daily/ticket/confirm').set(auth).send({ signature: 'ticket-missing' });
        expect(res.status).toBe(202);
      }
    });
  });

  describe('records', () => {
    it('refuses to record a day with no verified run', async () => {
      const today = dayOf(nowSeconds());
      const res = await request(app).post('/api/daily/records').set(auth).send({ day: today });
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ error: 'RankedRun', code: 'no_verified_run' });
    });

    it('refuses to record once the day window has closed', async () => {
      const oldDay = dayOf(nowSeconds()) - 5;
      const res = await request(app).post('/api/daily/records').set(auth).send({ day: oldDay });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: 'RankedRun', code: 'day_closed' });
    });

    it('refuses to record without a player account, then without a ticket, then records and confirms', async () => {
      const started = await request(app).post('/api/daily/runs').set(auth);
      const { runId, seed, day } = started.body;
      const played = playReplay(seed, 300);
      await request(app).post(`/api/daily/runs/${runId}/finish`).set(auth).send({ replay: played.base64 });

      const noAccount = await request(app).post('/api/daily/records').set(auth).send({ day });
      expect(noAccount.status).toBe(404);
      expect(noAccount.body).toMatchObject({ code: 'no_player_account' });

      fakeChain.setPlayer(user.wallet_address, { ticketDay: day - 5, prevTicketDay: day - 6 });
      const noTicket = await request(app).post('/api/daily/records').set(auth).send({ day });
      expect(noTicket.status).toBe(409);
      expect(noTicket.body).toMatchObject({ code: 'no_ticket' });

      fakeChain.setPlayer(user.wallet_address, { ticketDay: day, prevTicketDay: day - 1 });
      const issued = await request(app).post('/api/daily/records').set(auth).send({ day });
      expect(issued.status).toBe(201);
      expect(issued.body).toMatchObject({ day, score: played.score, transaction: expect.any(String), minContextSlot: 1234 });

      const pending = await request(app).post('/api/daily/records/confirm').set(auth).send({ day, signature: 'sig-1' });
      expect(pending.status).toBe(202);
      expect(pending.body).toEqual({ confirmed: false });

      fakeChain.setTxStatus('sig-1', true);
      const dayBests = [0, 0, 0, 0, 0, 0, 0];
      dayBests[weekdayOf(day)] = played.score;
      fakeChain.setPlayer(user.wallet_address, { week: weekOf(day), dayBests });

      const confirmed = await request(app).post('/api/daily/records/confirm').set(auth).send({ day, signature: 'sig-1' });
      expect(confirmed.status).toBe(200);
      expect(confirmed.body).toEqual({ confirmed: true, score: played.score });

      const already = await request(app).post('/api/daily/records').set(auth).send({ day });
      expect(already.status).toBe(409);
      expect(already.body).toMatchObject({ code: 'already_recorded' });
    });

    it('treats a missing transaction as pending (202) and a failed one as terminal (409)', async () => {
      const pending = await request(app).post('/api/daily/records/confirm').set(auth).send({ day: 100, signature: 'sig-missing' });
      expect(pending.status).toBe(202);
      expect(pending.body).toEqual({ confirmed: false });

      fakeChain.setTxStatus('sig-failed', false);
      const res = await request(app).post('/api/daily/records/confirm').set(auth).send({ day: 100, signature: 'sig-failed' });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: 'RankedRun', code: 'record_failed', message: 'The record transaction failed on chain' });
    });
  });

  it('renders the week view from WeekPool.top', async () => {
    const now = nowSeconds();
    const week = weekOf(dayOf(now));
    fakeChain.setConfig({ payoutBps: [5000, 3000, 2000] });
    fakeChain.setWeekPool(week, { vault: 'VaultX', top: [{ player: user.wallet_address, total: 500, updatedAt: now }], settled: false });
    fakeChain.setBalance('VaultX', 10_000_000n);
    fakeChain.setPlayer(user.wallet_address, { week, dayBests: [10, 20, 30, 40, 50, 60, 70] });

    const res = await request(app).get('/api/daily/week');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      week,
      poolSkr: 10,
      settled: false,
      entries: [{ rank: 1, walletAddress: user.wallet_address, username: user.username, total: 500, days: [10, 20, 30, 40, 50, 60, 70], forecastSkr: 5 }],
    });
    expect(res.body.endsAt).toBeGreaterThan(now);
  });

  it('renders an empty week view before the pool exists', async () => {
    const res = await request(app).get('/api/daily/week?week=999999');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ week: 999999, endsAt: expect.any(Number), poolSkr: 0, entries: [], settled: false });
  });

  it('defaults the week view to the current week when no week is given', async () => {
    const currentWeek = weekOf(dayOf(nowSeconds()));
    const res = await request(app).get('/api/daily/week');
    expect(res.status).toBe(200);
    expect(res.body.week).toBe(currentWeek);
  });

  describe('devnet faucet', () => {
    beforeEach(() => {
      resetFaucetCooldown();
    });

    it('does not exist on mainnet', async () => {
      const original = process.env.SOLANA_CLUSTER;
      process.env.SOLANA_CLUSTER = 'mainnet';
      const mainnetApp = createApp();
      const res = await request(mainnetApp).post('/api/devnet/faucet').set(auth);
      expect(res.status).toBe(404);
      process.env.SOLANA_CLUSTER = original;
    });

    it('mints 100 test SKR on devnet, then rate-limits a second call', async () => {
      const original = process.env.SOLANA_CLUSTER;
      process.env.SOLANA_CLUSTER = 'devnet';
      const devnetApp = createApp();
      const res = await request(devnetApp).post('/api/devnet/faucet').set(auth);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ signature: expect.any(String), amountSkr: 100 });

      const again = await request(devnetApp).post('/api/devnet/faucet').set(auth);
      expect(again.status).toBe(429);
      process.env.SOLANA_CLUSTER = original;
    });

    it('returns 503 FaucetUnavailable when the server authority has no SOL for fees', async () => {
      const original = process.env.SOLANA_CLUSTER;
      process.env.SOLANA_CLUSTER = 'devnet';
      fakeChain.setSolBalance(1_000_000n); // well below the 0.01 SOL threshold
      const devnetApp = createApp();
      const res = await request(devnetApp).post('/api/devnet/faucet').set(auth);
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: 'FaucetUnavailable', message: 'The faucet key has no SOL for fees; fund the server authority' });
      process.env.SOLANA_CLUSTER = original;
    });

    it('returns 503 FaucetUnavailable when the mint transaction does not land', async () => {
      const original = process.env.SOLANA_CLUSTER;
      process.env.SOLANA_CLUSTER = 'devnet';
      fakeChain.setMintTestTokensError(new Error('TokenAccountNotFoundError'));
      const devnetApp = createApp();
      const res = await request(devnetApp).post('/api/devnet/faucet').set(auth);
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: 'FaucetUnavailable', message: 'The faucet transaction did not land; check the server authority balance and the RPC' });
      process.env.SOLANA_CLUSTER = original;
    });
  });
});
