import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tokenFor } from './helpers/jwt.js';
import { dayOf, weekOf } from '../src/services/dailySeed.js';
import * as memory from './helpers/memoryRankedRuns.js';
import * as memoryLoadout from './helpers/memoryLoadout.js';
import * as fakeChain from './helpers/fakeChain.js';
import { realPurchaseInstructions as sharedRealPurchaseInstructions, realReviveInstructions as sharedRealReviveInstructions } from './helpers/fixtureTx.js';

vi.mock('../src/db/loadout.js', () => import('./helpers/memoryLoadout.js'));
vi.mock('../src/chain/readers.js', () => import('./helpers/fakeChain.js'));
vi.mock('../src/chain/txs.js', () => import('./helpers/fakeChain.js'));

const serverAuthority = Keypair.generate();
process.env.SOLANA_CLUSTER = 'devnet';
process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
process.env.PROGRAM_ID = Keypair.generate().publicKey.toBase58();
process.env.SKR_MINT = Keypair.generate().publicKey.toBase58();
process.env.SERVER_AUTHORITY_SECRET = bs58.encode(serverAuthority.secretKey);

const { effectiveTide, quoteRevive, issueRevive, confirmRevive } = await import('../src/services/tide.js');
const { ShopError } = await import('../src/services/shop.js');
const { createApp } = await import('../src/createApp.js');
const realTxs = await vi.importActual('../src/chain/txs.js');

const user = memory.TEST_USER;
const WALLET = user.wallet_address;
const auth = { Authorization: `Bearer ${tokenFor(user)}` };
const TREASURY = Keypair.generate().publicKey.toBase58();
const WEEK = 42;
// design doc §1: ladder[0..7] = 25, 30, 40, 50, 60, 75, 95, 120 SKR; ebb every 7200s.
const LADDER = [25_000_000n, 30_000_000n, 40_000_000n, 50_000_000n, 60_000_000n, 75_000_000n, 95_000_000n, 120_000_000n];

function setLadderConfig() {
  fakeChain.setConfig({ reviveLadder: LADDER, ebbSeconds: 7200, purchasePoolBps: 2000 });
}

function realPurchaseInstructions(wallet, { itemId = 3, maxPrice = 25_000_000n, week = WEEK } = {}) {
  return sharedRealPurchaseInstructions(realTxs, wallet, { itemId, maxPrice, week, treasury: TREASURY });
}

function realReviveInstructions(wallet, { week = WEEK } = {}) {
  return sharedRealReviveInstructions(realTxs, wallet, { week, treasury: TREASURY });
}

describe('effectiveTide', () => {
  // Mirrors programs/.../instructions/ticket.rs::effective_tide exactly (verified against its own unit tests).
  it('is unchanged just under one ebb window', () => {
    expect(effectiveTide(5, 1_000, 1_000 + 7_199, 7_200)).toBe(5);
  });
  it('ebbs one step at exactly one window', () => {
    expect(effectiveTide(5, 1_000, 1_000 + 7_200, 7_200)).toBe(4);
  });
  it('ebbs two steps at exactly two windows', () => {
    expect(effectiveTide(5, 1_000, 1_000 + 14_400, 7_200)).toBe(3);
  });
  it('floors at zero far beyond the tide windows (a long gap)', () => {
    expect(effectiveTide(3, 1_000, 1_000 + 100 * 7_200, 7_200)).toBe(0);
  });
  it('clamps a clock that moved backward', () => {
    expect(effectiveTide(4, 1_000, 500, 7_200)).toBe(4);
  });
  it('is the tide itself when never revived (tide_at = 0)', () => {
    expect(effectiveTide(0, 0, 999_999, 7_200)).toBe(0);
  });
  it('is at the cap with no elapsed time', () => {
    expect(effectiveTide(7, 1_000, 1_000, 7_200)).toBe(7);
  });
});

/** The fixture ladder in SKR (`config.reviveLadder` base units / 1e6), as every quote reports it. */
const LADDER_SKR = [25, 30, 40, 50, 60, 75, 95, 120];

describe('quoteRevive', () => {
  beforeEach(() => {
    fakeChain.reset();
    setLadderConfig();
  });

  it('quotes ladder[0] with no nextStep for a wallet that has never revived (tide_at = 0)', async () => {
    const quote = await quoteRevive({ wallet: WALLET, now: 1_000_000 });
    expect(quote).toEqual({ tide: 0, effective: 0, priceSkr: 25, nextStep: null, ladderSkr: LADDER_SKR });
  });

  it('quotes the current step and the time until it ebbs by one, at a fixed clock', async () => {
    fakeChain.setPlayer(WALLET, { tide: 3, tideAt: 1_000 });
    const now = 1_000 + 3_600; // half-way through the first ebb window
    const quote = await quoteRevive({ wallet: WALLET, now });
    expect(quote).toEqual({ tide: 3, effective: 3, priceSkr: 50, nextStep: { priceSkr: 40, inSeconds: 3_600 }, ladderSkr: LADDER_SKR });
  });

  it('ebbs one step exactly at the window boundary', async () => {
    fakeChain.setPlayer(WALLET, { tide: 3, tideAt: 1_000 });
    const quote = await quoteRevive({ wallet: WALLET, now: 1_000 + 7_200 });
    expect(quote).toEqual({ tide: 3, effective: 2, priceSkr: 40, nextStep: { priceSkr: 30, inSeconds: 7_200 }, ladderSkr: LADDER_SKR });
  });

  it('has no nextStep once effective is already 0 after a long gap', async () => {
    fakeChain.setPlayer(WALLET, { tide: 3, tideAt: 1_000 });
    const quote = await quoteRevive({ wallet: WALLET, now: 1_000 + 100 * 7_200 });
    expect(quote).toEqual({ tide: 3, effective: 0, priceSkr: 25, nextStep: null, ladderSkr: LADDER_SKR });
  });

  it('caps effective at the ladder length - 1 (tide 7, no elapsed time)', async () => {
    fakeChain.setPlayer(WALLET, { tide: 7, tideAt: 1_000 });
    const quote = await quoteRevive({ wallet: WALLET, now: 1_000 });
    expect(quote).toEqual({ tide: 7, effective: 7, priceSkr: 120, nextStep: { priceSkr: 95, inSeconds: 7_200 }, ladderSkr: LADDER_SKR });
  });

  it('computes nextStep.inSeconds correctly when now is more than one window behind tideAt (clock skew)', async () => {
    // effectiveTide clamps elapsed to >= 0 here (now < tideAt), so effective stays at tide (3) - but
    // the naive `Math.trunc((now - tideAt) / ebbSeconds) + 1` boundary formula would wrongly use the
    // unclamped -1 elapsed steps and report 8000s instead of the true 15200s.
    fakeChain.setPlayer(WALLET, { tide: 3, tideAt: 10_000 });
    const quote = await quoteRevive({ wallet: WALLET, now: 2_000 });
    expect(quote).toEqual({ tide: 3, effective: 3, priceSkr: 50, nextStep: { priceSkr: 40, inSeconds: 15_200 }, ladderSkr: LADDER_SKR });
  });

  it('reports no nextStep when tide > 0 but tide_at = 0 (cannot occur on chain, but the price must not appear to ebb without a timestamp)', async () => {
    fakeChain.setPlayer(WALLET, { tide: 3, tideAt: 0 });
    const quote = await quoteRevive({ wallet: WALLET, now: 500 });
    expect(quote).toEqual({ tide: 3, effective: 3, priceSkr: 50, nextStep: null, ladderSkr: LADDER_SKR });
  });
});

describe('issueRevive', () => {
  beforeEach(() => {
    fakeChain.reset();
    setLadderConfig();
  });

  it('builds a revive envelope with the quoted priceSkr when the wallet can afford it', async () => {
    fakeChain.setBalance(WALLET, 25_000_000n);
    const result = await issueRevive({ wallet: WALLET, now: 0 });
    expect(result).toMatchObject({ transaction: expect.any(String), priceSkr: 25 });
  });

  it('composes create_player (createsPlayer: true) for a wallet with no Player account yet', async () => {
    fakeChain.setBalance(WALLET, 25_000_000n);
    const result = await issueRevive({ wallet: WALLET, now: 0 });
    expect(result.createsPlayer).toBe(true);
    expect(fakeChain.state.calls.buildReviveTx[0]).toMatchObject({ createPlayer: true });
  });

  it('does not compose create_player (createsPlayer: false) once the Player account already exists', async () => {
    fakeChain.setPlayer(WALLET, {});
    fakeChain.setBalance(WALLET, 25_000_000n);
    const result = await issueRevive({ wallet: WALLET, now: 0 });
    expect(result.createsPlayer).toBe(false);
    expect(fakeChain.state.calls.buildReviveTx[0]).toMatchObject({ createPlayer: false });
  });

  it('passes the current week and the treasury through to the tx builder', async () => {
    fakeChain.setBalance(WALLET, 25_000_000n);
    const now = 1_000_000;
    await issueRevive({ wallet: WALLET, now });
    expect(fakeChain.state.calls.buildReviveTx[0]).toMatchObject({ week: weekOf(dayOf(now)), treasury: fakeChain.state.config.treasury });
  });

  it('throws not_enough_skr with needSkr/haveSkr when the balance is short', async () => {
    fakeChain.setPlayer(WALLET, { tide: 2, tideAt: 0 });
    fakeChain.setBalance(WALLET, 5_000_000n); // 5 SKR, ladder[2] costs 40
    await expect(issueRevive({ wallet: WALLET, now: 0 })).rejects.toMatchObject({
      code: 'not_enough_skr', status: 409, extra: { needSkr: 40, haveSkr: 5 },
    });
  });
});

describe('confirmRevive', () => {
  beforeEach(() => {
    fakeChain.reset();
    memoryLoadout.reset();
    setLadderConfig();
  });

  it('returns confirmed:false while the transaction is not yet visible', async () => {
    expect(await confirmRevive({ wallet: WALLET, signature: 'missing-sig' })).toEqual({ confirmed: false });
  });

  it('throws revive_failed for a failed transaction', async () => {
    fakeChain.setConfirmedTx('failed-sig', { status: 'failed' });
    await expect(confirmRevive({ wallet: WALLET, signature: 'failed-sig' })).rejects.toMatchObject({ code: 'revive_failed', status: 409 });
  });

  it('rejects a wrong-instruction transaction (purchase instead of revive)', async () => {
    const instructions = await realPurchaseInstructions(WALLET);
    fakeChain.setConfirmedTx('wrong-ix-sig', { status: 'confirmed', instructions });
    await expect(confirmRevive({ wallet: WALLET, signature: 'wrong-ix-sig' })).rejects.toMatchObject({ code: 'invalid_transaction', status: 400 });
  });

  it('rejects a revive transaction signed by a different wallet', async () => {
    const otherWallet = Keypair.generate().publicKey.toBase58();
    const instructions = await realReviveInstructions(otherWallet);
    fakeChain.setConfirmedTx('other-wallet-sig', { status: 'confirmed', instructions });
    await expect(confirmRevive({ wallet: WALLET, signature: 'other-wallet-sig' })).rejects.toMatchObject({ code: 'invalid_transaction', status: 400 });
  });

  it('confirms a matching revive, refreshes the loadout cache and returns the new tide', async () => {
    const instructions = await realReviveInstructions(WALLET);
    fakeChain.setConfirmedTx('good-sig', { status: 'confirmed', instructions });
    fakeChain.setPlayer(WALLET, { tide: 1, tideAt: 555, inventory: 0n });

    const result = await confirmRevive({ wallet: WALLET, signature: 'good-sig' });
    expect(result).toEqual({ confirmed: true, ok: true, tide: 1, tideAt: 555 });

    const cached = await memoryLoadout.getLoadout(WALLET);
    expect(cached).toMatchObject({ tide: 1, tideAt: 555 });
  });
});

describe('/api/revive routes', () => {
  let app;
  beforeEach(() => {
    fakeChain.reset();
    memoryLoadout.reset();
    setLadderConfig();
    app = createApp();
  });

  it('requires a token for every route', async () => {
    expect((await request(app).post('/api/revive/quote')).status).toBe(401);
    expect((await request(app).post('/api/revive')).status).toBe(401);
    expect((await request(app).post('/api/revive/confirm').send({ signature: 'x' })).status).toBe(401);
  });

  it('POST /quote returns the quote shape at a fixed clock (tide_at = 0)', async () => {
    const res = await request(app).post('/api/revive/quote').set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tide: 0, effective: 0, priceSkr: 25, nextStep: null, ladderSkr: LADDER_SKR });
  });

  it('POST / answers 409 not_enough_skr with needSkr/haveSkr through the router error handler', async () => {
    fakeChain.setBalance(WALLET, 0n);
    const res = await request(app).post('/api/revive').set(auth).send({});
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'Tide', code: 'not_enough_skr', needSkr: 25, haveSkr: 0 });
  });

  it('POST / answers 201 with a transaction and priceSkr when affordable', async () => {
    fakeChain.setBalance(WALLET, 25_000_000n);
    const res = await request(app).post('/api/revive').set(auth).send({});
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ transaction: expect.any(String), priceSkr: 25 });
  });

  it('POST /confirm answers 202 while pending and 200 once confirmed', async () => {
    const pending = await request(app).post('/api/revive/confirm').set(auth).send({ signature: 'missing-sig' });
    expect(pending.status).toBe(202);
    expect(pending.body).toEqual({ confirmed: false });

    const instructions = await realReviveInstructions(WALLET);
    fakeChain.setConfirmedTx('good-sig', { status: 'confirmed', instructions });
    fakeChain.setPlayer(WALLET, { tide: 1, tideAt: 555 });
    const confirmed = await request(app).post('/api/revive/confirm').set(auth).send({ signature: 'good-sig' });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body).toEqual({ confirmed: true, ok: true, tide: 1, tideAt: 555 });
  });
});
