import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tokenFor } from './helpers/jwt.js';
import * as memory from './helpers/memoryRankedRuns.js';
import * as memoryLoadout from './helpers/memoryLoadout.js';
import * as fakeChain from './helpers/fakeChain.js';

vi.mock('../src/db/loadout.js', () => import('./helpers/memoryLoadout.js'));
vi.mock('../src/chain/readers.js', () => import('./helpers/fakeChain.js'));
vi.mock('../src/chain/txs.js', () => import('./helpers/fakeChain.js'));

process.env.SOLANA_CLUSTER = process.env.SOLANA_CLUSTER || 'devnet';
process.env.SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
process.env.PROGRAM_ID = process.env.PROGRAM_ID || Keypair.generate().publicKey.toBase58();
process.env.SKR_MINT = process.env.SKR_MINT || Keypair.generate().publicKey.toBase58();
process.env.SERVER_AUTHORITY_SECRET = process.env.SERVER_AUTHORITY_SECRET || bs58.encode(Keypair.generate().secretKey);

const { createApp } = await import('../src/createApp.js');
const user = memory.TEST_USER;
const WALLET = user.wallet_address;
const auth = { Authorization: `Bearer ${tokenFor(user)}` };

// Harpoon=0, Anchor=1, Trident=2, Lime=3, Lilac=4, Ember=5, Abyss=6 (design doc §1).
const HARPOON = 0;
const LIME = 3;

describe('/api/profile/loadout', () => {
  let app;
  beforeEach(() => {
    fakeChain.reset();
    memoryLoadout.reset();
    app = createApp();
  });

  it('requires a token for GET and PUT', async () => {
    expect((await request(app).get('/api/profile/loadout')).status).toBe(401);
    expect((await request(app).put('/api/profile/loadout').send({})).status).toBe(401);
  });

  it('GET defaults to base/base with an empty owned list before any purchase', async () => {
    const res = await request(app).get('/api/profile/loadout').set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ owned: [], activeSkin: 0, activeVariant: 0 });
  });

  it('GET reflects the on-chain inventory', async () => {
    fakeChain.setPlayer(WALLET, { inventory: (1n << BigInt(LIME)) | (1n << BigInt(HARPOON)) });
    const res = await request(app).get('/api/profile/loadout').set(auth);
    expect(res.body.owned.sort()).toEqual([HARPOON, LIME]);
  });

  it('PUT rejects equipping a skin the wallet does not own', async () => {
    const res = await request(app).put('/api/profile/loadout').set(auth).send({ activeSkin: 1 }); // 1 -> item 3 (Lime)
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'not_owned' });
  });

  it('PUT rejects equipping a variant the wallet does not own', async () => {
    const res = await request(app).put('/api/profile/loadout').set(auth).send({ activeVariant: 1 }); // 1 -> item 0 (Harpoon)
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'not_owned' });
  });

  it('PUT accepts base (0) for both selectors with nothing owned', async () => {
    const res = await request(app).put('/api/profile/loadout').set(auth).send({ activeSkin: 0, activeVariant: 0 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ owned: [], activeSkin: 0, activeVariant: 0 });
  });

  it('PUT accepts an owned skin and variant, and GET reflects the new selection afterwards', async () => {
    fakeChain.setPlayer(WALLET, { inventory: (1n << BigInt(LIME)) | (1n << BigInt(HARPOON)) });
    const put = await request(app).put('/api/profile/loadout').set(auth).send({ activeSkin: 1, activeVariant: 1 });
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ owned: [HARPOON, LIME], activeSkin: 1, activeVariant: 1 });

    const get = await request(app).get('/api/profile/loadout').set(auth);
    expect(get.body).toEqual({ owned: [HARPOON, LIME], activeSkin: 1, activeVariant: 1 });
  });

  it('PUT with only one field leaves the other selector unchanged', async () => {
    fakeChain.setPlayer(WALLET, { inventory: (1n << BigInt(LIME)) | (1n << BigInt(HARPOON)) });
    await request(app).put('/api/profile/loadout').set(auth).send({ activeSkin: 1, activeVariant: 1 });
    const res = await request(app).put('/api/profile/loadout').set(auth).send({ activeSkin: 0 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ owned: [HARPOON, LIME], activeSkin: 0, activeVariant: 1 });
  });

  it('PUT answers 400 for an out-of-range selector', async () => {
    const res = await request(app).put('/api/profile/loadout').set(auth).send({ activeSkin: 5 });
    expect(res.status).toBe(400);
  });

  it.each([null, '', true, [1], '1', 1.5])('PUT answers 400 for a non-integer activeSkin (%j), not silently coerced', async (value) => {
    const res = await request(app).put('/api/profile/loadout').set(auth).send({ activeSkin: value });
    expect(res.status).toBe(400);
  });

  it('PUT ignores a loadout cache row that falsely claims ownership - only the live chain read counts', async () => {
    // The cache row says item 3 (Lime) is owned, but the wallet's live on-chain inventory (never set
    // here, so it defaults to 0) says otherwise - the route must still reject equipping it.
    await memoryLoadout.upsertLoadout(WALLET, { inventory: 1n << BigInt(LIME) });
    const res = await request(app).put('/api/profile/loadout').set(auth).send({ activeSkin: 1 });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'not_owned' });
  });
});
