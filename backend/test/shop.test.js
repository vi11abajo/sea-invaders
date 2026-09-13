import { Keypair, SystemProgram } from '@solana/web3.js';
import bs58 from 'bs58';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tokenFor } from './helpers/jwt.js';
import { dayOf, weekOf } from '../src/services/dailySeed.js';
import * as memory from './helpers/memoryRankedRuns.js';
import * as memoryLoadout from './helpers/memoryLoadout.js';
import * as fakeChain from './helpers/fakeChain.js';
import { instructionsFromMessage, messageFrom, realPurchaseInstructions as sharedRealPurchaseInstructions, realReviveInstructions as sharedRealReviveInstructions } from './helpers/fixtureTx.js';

vi.mock('../src/db/loadout.js', () => import('./helpers/memoryLoadout.js'));
vi.mock('../src/chain/readers.js', () => import('./helpers/fakeChain.js'));
vi.mock('../src/chain/txs.js', () => import('./helpers/fakeChain.js'));

// chainConfig() needs a full, valid environment even though chain/readers.js and chain/txs.js are
// mocked above - `confirmPurchase`'s rejection tests build REAL fixture transactions (via
// `vi.importActual`) against the real chain/program.js + chain/pdas.js + chain/verify.js, exactly
// like a wallet-signed purchase would look on chain.
const serverAuthority = Keypair.generate();
process.env.SOLANA_CLUSTER = 'devnet';
process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
process.env.PROGRAM_ID = Keypair.generate().publicKey.toBase58();
process.env.SKR_MINT = Keypair.generate().publicKey.toBase58();
process.env.SERVER_AUTHORITY_SECRET = bs58.encode(serverAuthority.secretKey);

const {
  readCatalog, readPlayerShop, issuePurchase, confirmPurchase, ownedItemIds, clearCatalogCache, ShopError,
} = await import('../src/services/shop.js');
const { createApp } = await import('../src/createApp.js');
const realTxs = await vi.importActual('../src/chain/txs.js');

const user = memory.TEST_USER;
const WALLET = user.wallet_address;
const auth = { Authorization: `Bearer ${tokenFor(user)}` };
const TREASURY = Keypair.generate().publicKey.toBase58();
const WEEK = 42;
const LIME = 3; // skin, 25 SKR in the fake catalog's defaults

function realPurchaseInstructions(wallet, { itemId = LIME, maxPrice = 25_000_000n, week = WEEK } = {}) {
  return sharedRealPurchaseInstructions(realTxs, wallet, { itemId, maxPrice, week, treasury: TREASURY });
}

function realReviveInstructions(wallet, { week = WEEK } = {}) {
  return sharedRealReviveInstructions(realTxs, wallet, { week, treasury: TREASURY });
}

describe('readCatalog / readPlayerShop', () => {
  beforeEach(() => {
    fakeChain.reset();
    clearCatalogCache();
  });

  it('maps the chain catalog to id/kind/name/priceSkr/active (plus the internal priceBaseUnits)', async () => {
    const items = await readCatalog();
    expect(items).toContainEqual(expect.objectContaining({ id: LIME, kind: 'skin', name: 'Lime', priceSkr: 25, priceBaseUnits: 25_000_000n, active: true }));
    expect(items).toContainEqual(expect.objectContaining({ id: 0, kind: 'variant', name: 'Harpoon', priceSkr: 40, active: true }));
  });

  it('caches the catalog for 60s: a second call does not re-derive from a changed fake catalog', async () => {
    await readCatalog();
    fakeChain.setCatalog([{ id: 9, kind: 0, price: 1n, active: true }]);
    const second = await readCatalog();
    expect(second.some((it) => it.id === 9)).toBe(false);
  });

  it('readPlayerShop returns zeros for a wallet with no Player account yet', async () => {
    expect(await readPlayerShop(WALLET)).toEqual({ inventory: 0n, tide: 0, tideAt: 0 });
  });

  it('readPlayerShop reflects the on-chain inventory/tide/tideAt', async () => {
    fakeChain.setPlayer(WALLET, { inventory: (1n << 3n) | (1n << 0n), tide: 2, tideAt: 12345 });
    expect(await readPlayerShop(WALLET)).toEqual({ inventory: 9n, tide: 2, tideAt: 12345 });
  });
});

describe('ownedItemIds', () => {
  it('lists set bits ascending', () => {
    expect(ownedItemIds((1n << 0n) | (1n << 3n) | (1n << 6n))).toEqual([0, 3, 6]);
    expect(ownedItemIds(0n)).toEqual([]);
  });
});

describe('issuePurchase', () => {
  beforeEach(() => {
    fakeChain.reset();
    clearCatalogCache();
  });

  it('builds a purchase envelope for an unowned, active item the wallet can afford', async () => {
    fakeChain.setBalance(WALLET, 25_000_000n);
    const result = await issuePurchase({ wallet: WALLET, item: LIME, now: 0 });
    expect(result).toMatchObject({ transaction: expect.any(String), minContextSlot: 1234 });
  });

  it('composes create_player (createsPlayer: true) for a wallet with no Player account yet', async () => {
    fakeChain.setBalance(WALLET, 25_000_000n);
    const result = await issuePurchase({ wallet: WALLET, item: LIME, now: 0 });
    expect(result.createsPlayer).toBe(true);
    expect(fakeChain.state.calls.buildPurchaseTx[0]).toMatchObject({ createPlayer: true });
  });

  it('does not compose create_player (createsPlayer: false) once the Player account already exists', async () => {
    fakeChain.setPlayer(WALLET, {});
    fakeChain.setBalance(WALLET, 25_000_000n);
    const result = await issuePurchase({ wallet: WALLET, item: LIME, now: 0 });
    expect(result.createsPlayer).toBe(false);
    expect(fakeChain.state.calls.buildPurchaseTx[0]).toMatchObject({ createPlayer: false });
  });

  it('passes the catalog price (exact base units), the current week and the treasury through to the tx builder', async () => {
    fakeChain.setBalance(WALLET, 25_000_000n);
    const now = 1_000_000;
    await issuePurchase({ wallet: WALLET, item: LIME, now });
    expect(fakeChain.state.calls.buildPurchaseTx[0]).toMatchObject({
      itemId: LIME, maxPrice: 25_000_000n, week: weekOf(dayOf(now)), treasury: fakeChain.state.config.treasury,
    });
  });

  it('throws not_enough_skr with needSkr/haveSkr when the balance is short', async () => {
    fakeChain.setBalance(WALLET, 10_000_000n); // 10 SKR, item costs 25
    await expect(issuePurchase({ wallet: WALLET, item: LIME, now: 0 })).rejects.toMatchObject({
      code: 'not_enough_skr', status: 409, extra: { needSkr: 25, haveSkr: 10 },
    });
  });

  it('throws already_owned when the inventory bit is already set', async () => {
    fakeChain.setBalance(WALLET, 25_000_000n);
    fakeChain.setPlayer(WALLET, { inventory: 1n << BigInt(LIME) });
    await expect(issuePurchase({ wallet: WALLET, item: LIME, now: 0 })).rejects.toMatchObject({ code: 'already_owned', status: 409 });
  });

  it('throws unknown_item for an id not in the catalog', async () => {
    fakeChain.setBalance(WALLET, 1_000_000_000n);
    await expect(issuePurchase({ wallet: WALLET, item: 99, now: 0 })).rejects.toMatchObject({ code: 'unknown_item', status: 404 });
  });

  it('throws item_inactive for a deactivated item', async () => {
    fakeChain.setCatalog([{ id: LIME, kind: 1, price: 25_000_000n, active: false }]);
    fakeChain.setBalance(WALLET, 1_000_000_000n);
    await expect(issuePurchase({ wallet: WALLET, item: LIME, now: 0 })).rejects.toMatchObject({ code: 'item_inactive', status: 409 });
  });
});

describe('confirmPurchase', () => {
  beforeEach(() => {
    fakeChain.reset();
    memoryLoadout.reset();
    clearCatalogCache();
  });

  it('returns confirmed:false while the transaction is not yet visible', async () => {
    const result = await confirmPurchase({ wallet: WALLET, signature: 'missing-sig', item: LIME });
    expect(result).toEqual({ confirmed: false });
  });

  it('throws purchase_failed for a failed transaction', async () => {
    fakeChain.setConfirmedTx('failed-sig', { status: 'failed' });
    await expect(confirmPurchase({ wallet: WALLET, signature: 'failed-sig', item: LIME })).rejects.toMatchObject({ code: 'purchase_failed', status: 409 });
  });

  it('rejects a foreign-program transaction', async () => {
    const walletKey = new (await import('@solana/web3.js')).PublicKey(WALLET);
    const transferIx = SystemProgram.transfer({ fromPubkey: walletKey, toPubkey: walletKey, lamports: 1 });
    const instructions = instructionsFromMessage(messageFrom(walletKey, [transferIx]));
    fakeChain.setConfirmedTx('foreign-sig', { status: 'confirmed', instructions });
    await expect(confirmPurchase({ wallet: WALLET, signature: 'foreign-sig', item: LIME })).rejects.toMatchObject({ code: 'invalid_transaction', status: 400 });
  });

  it('rejects a wrong-instruction transaction (revive instead of purchase)', async () => {
    const instructions = await realReviveInstructions(WALLET);
    fakeChain.setConfirmedTx('wrong-ix-sig', { status: 'confirmed', instructions });
    await expect(confirmPurchase({ wallet: WALLET, signature: 'wrong-ix-sig', item: LIME })).rejects.toMatchObject({ code: 'invalid_transaction', status: 400 });
  });

  it('rejects a purchase transaction signed by a different wallet', async () => {
    const otherWallet = Keypair.generate().publicKey.toBase58();
    const instructions = await realPurchaseInstructions(otherWallet);
    fakeChain.setConfirmedTx('other-wallet-sig', { status: 'confirmed', instructions });
    await expect(confirmPurchase({ wallet: WALLET, signature: 'other-wallet-sig', item: LIME })).rejects.toMatchObject({ code: 'invalid_transaction', status: 400 });
  });

  it('rejects a purchase transaction for a different item id than requested', async () => {
    const instructions = await realPurchaseInstructions(WALLET, { itemId: 5 });
    fakeChain.setConfirmedTx('wrong-item-sig', { status: 'confirmed', instructions });
    await expect(confirmPurchase({ wallet: WALLET, signature: 'wrong-item-sig', item: LIME })).rejects.toMatchObject({ code: 'invalid_transaction', status: 400 });
  });

  it('confirms a matching purchase, refreshes the loadout cache and returns the owned list', async () => {
    const instructions = await realPurchaseInstructions(WALLET, { itemId: LIME });
    fakeChain.setConfirmedTx('good-sig', { status: 'confirmed', instructions });
    fakeChain.setPlayer(WALLET, { inventory: 1n << BigInt(LIME), tide: 1, tideAt: 500 });

    const result = await confirmPurchase({ wallet: WALLET, signature: 'good-sig', item: LIME });
    expect(result).toEqual({ confirmed: true, owned: [LIME] });

    const cached = await memoryLoadout.getLoadout(WALLET);
    expect(cached).toMatchObject({ inventory: 1n << BigInt(LIME), tide: 1, tideAt: 500 });
  });
});

describe('/api/shop routes', () => {
  let app;
  beforeEach(() => {
    fakeChain.reset();
    memoryLoadout.reset();
    clearCatalogCache();
    app = createApp();
  });

  it('requires a token for every route', async () => {
    expect((await request(app).get('/api/shop')).status).toBe(401);
    expect((await request(app).post('/api/shop/buy').send({ item: LIME })).status).toBe(401);
    expect((await request(app).post('/api/shop/confirm').send({ signature: 'x', item: LIME })).status).toBe(401);
  });

  it('GET / returns the catalogue with no internal fields leaked, balance and swap availability', async () => {
    fakeChain.setBalance(WALLET, 30_000_000n);
    const res = await request(app).get('/api/shop').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.balanceSkr).toBe(30);
    expect(res.body.swap).toEqual({ available: false }); // devnet in this test file
    expect(res.body.items).toContainEqual({ id: LIME, kind: 'skin', name: 'Lime', priceSkr: 25, owned: false });
    expect(res.body.items.every((it) => !('priceBaseUnits' in it) && !('active' in it))).toBe(true);
  });

  it('GET / upserts the loadout cache with the fresh inventory/tide/tideAt', async () => {
    fakeChain.setPlayer(WALLET, { inventory: 1n << BigInt(LIME), tide: 2, tideAt: 999 });
    await request(app).get('/api/shop').set(auth);
    const cached = await memoryLoadout.getLoadout(WALLET);
    expect(cached).toMatchObject({ inventory: 1n << BigInt(LIME), tide: 2, tideAt: 999 });
  });

  it('GET / omits an inactive item the wallet does not own, but keeps an owned inactive item listed as owned', async () => {
    fakeChain.setCatalog([
      { id: LIME, kind: 1, price: 25_000_000n, active: false }, // not owned, inactive -> dropped
      { id: 5, kind: 1, price: 35_000_000n, active: false }, // owned, inactive -> stays, owned: true
    ]);
    fakeChain.setPlayer(WALLET, { inventory: 1n << 5n });
    const res = await request(app).get('/api/shop').set(auth);
    expect(res.body.items.find((it) => it.id === LIME)).toBeUndefined();
    expect(res.body.items).toContainEqual({ id: 5, kind: 'skin', name: 'Ember', priceSkr: 35, owned: true });
  });

  it('POST /buy answers 409 not_enough_skr with needSkr/haveSkr through the router error handler', async () => {
    fakeChain.setBalance(WALLET, 0n);
    const res = await request(app).post('/api/shop/buy').set(auth).send({ item: LIME });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'Shop', code: 'not_enough_skr', needSkr: 25, haveSkr: 0 });
  });

  it('POST /buy answers 201 with a transaction when affordable', async () => {
    fakeChain.setBalance(WALLET, 25_000_000n);
    const res = await request(app).post('/api/shop/buy').set(auth).send({ item: LIME });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ transaction: expect.any(String) });
  });

  it('POST /confirm answers 202 while pending and 200 once confirmed', async () => {
    const pending = await request(app).post('/api/shop/confirm').set(auth).send({ signature: 'missing-sig', item: LIME });
    expect(pending.status).toBe(202);
    expect(pending.body).toEqual({ confirmed: false });

    const instructions = await realPurchaseInstructions(WALLET, { itemId: LIME });
    fakeChain.setConfirmedTx('good-sig', { status: 'confirmed', instructions });
    fakeChain.setPlayer(WALLET, { inventory: 1n << BigInt(LIME) });
    const confirmed = await request(app).post('/api/shop/confirm').set(auth).send({ signature: 'good-sig', item: LIME });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body).toEqual({ confirmed: true, owned: [LIME] });
  });
});
