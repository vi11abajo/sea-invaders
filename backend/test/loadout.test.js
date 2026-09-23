import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tokenFor } from './helpers/jwt.js';
import * as memory from './helpers/memoryRankedRuns.js';
import * as memoryLoadout from './helpers/memoryLoadout.js';
import * as memoryCampaign from './helpers/memoryCampaign.js';
import * as fakeChain from './helpers/fakeChain.js';
import { sessionLimiter } from '../src/middleware/rateLimit.js';

vi.mock('../src/db/loadout.js', () => import('./helpers/memoryLoadout.js'));
vi.mock('../src/db/campaign.js', () => import('./helpers/memoryCampaign.js'));
vi.mock('../src/chain/readers.js', () => import('./helpers/fakeChain.js'));
vi.mock('../src/chain/txs.js', () => import('./helpers/fakeChain.js'));

process.env.SOLANA_CLUSTER = process.env.SOLANA_CLUSTER || 'devnet';
process.env.SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
process.env.PROGRAM_ID = process.env.PROGRAM_ID || Keypair.generate().publicKey.toBase58();
process.env.SKR_MINT = process.env.SKR_MINT || Keypair.generate().publicKey.toBase58();
process.env.SERVER_AUTHORITY_SECRET = process.env.SERVER_AUTHORITY_SECRET || bs58.encode(Keypair.generate().secretKey);

const { createApp } = await import('../src/createApp.js');
const { clearPlayerCache } = await import('../src/services/rankedRuns.js');
const user = memory.TEST_USER;
const WALLET = user.wallet_address;
const auth = { Authorization: `Bearer ${tokenFor(user)}` };

// Catalogue item ids (core/src/catalogue.ts): Azul=0 (the harpoon champion), Krang=1, Poseidon=2,
// Lime=3 .. Abyss=6, the sold looks Bear=7 .. Sharingan=14, Noob=15, Coraluna=16, Shoupe=17.
const HARPOON = 0;
const LIME = 3;
const NOTHING_EARNED = { variants: [], skins: [] };

/** A stored campaign record (the shape `db/campaign.js` keeps) with the given level ids cleared. */
function progressClearing(levels, length = 60) {
  const cleared = new Array(length).fill(false);
  for (const level of levels) cleared[level - 1] = true;
  return { v: 1, reef: 1, level: 1, lives: 5, cleared, best: new Array(length).fill(0), updatedAt: 1000 };
}

describe('/api/profile/loadout', () => {
  let app;
  beforeEach(() => {
    fakeChain.reset();
    memoryLoadout.reset();
    memoryCampaign.reset();
    // The Seeker look reads the 5 s `getCachedPlayer` cache; a player seeded by an earlier test (or
    // an earlier step of the same test) must not leak through it.
    clearPlayerCache();
    // sessionLimiter is a singleton shared with every other route mounted on it (routes/shop.js,
    // routes/revive.js, routes/swap.js); reset the per-user key so this file's own repeated PUT
    // calls (and any earlier test) never carry a used-up budget into the next test.
    sessionLimiter.resetKey(`user:${user.id}`);
    app = createApp();
  });

  it('requires a token for GET and PUT', async () => {
    expect((await request(app).get('/api/profile/loadout')).status).toBe(401);
    expect((await request(app).put('/api/profile/loadout').send({})).status).toBe(401);
  });

  it('GET defaults to base/base with an empty owned list, nothing earned and no Seeker look before anything happens', async () => {
    const res = await request(app).get('/api/profile/loadout').set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ owned: [], activeSkin: 0, activeVariant: 0, earned: NOTHING_EARNED, seekerSkin: false });
  });

  it('GET reflects the on-chain inventory', async () => {
    fakeChain.setPlayer(WALLET, { inventory: (1n << BigInt(LIME)) | (1n << BigInt(HARPOON)) });
    const res = await request(app).get('/api/profile/loadout').set(auth);
    expect(res.body.owned.sort()).toEqual([HARPOON, LIME]);
  });

  it('PUT rejects equipping a skin the wallet does not own', async () => {
    const res = await request(app).put('/api/profile/loadout').set(auth).send({ activeSkin: 1 }); // 1 -> item 3 (Lime)
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Loadout', code: 'not_owned', message: 'Skin item 3 is not owned' });
  });

  it('PUT rejects equipping a variant the wallet does not own', async () => {
    const res = await request(app).put('/api/profile/loadout').set(auth).send({ activeVariant: 1 }); // 1 -> item 0 (Azul)
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Loadout', code: 'not_owned', message: 'Variant item 0 is not owned' });
  });

  it('PUT accepts base (0) for both selectors with nothing owned', async () => {
    const res = await request(app).put('/api/profile/loadout').set(auth).send({ activeSkin: 0, activeVariant: 0 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ owned: [], activeSkin: 0, activeVariant: 0, earned: NOTHING_EARNED, seekerSkin: false });
  });

  it('PUT accepts an owned skin and variant, and GET reflects the new selection afterwards', async () => {
    fakeChain.setPlayer(WALLET, { inventory: (1n << BigInt(LIME)) | (1n << BigInt(HARPOON)) });
    const put = await request(app).put('/api/profile/loadout').set(auth).send({ activeSkin: 1, activeVariant: 1 });
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ owned: [HARPOON, LIME], activeSkin: 1, activeVariant: 1, earned: NOTHING_EARNED, seekerSkin: false });

    const get = await request(app).get('/api/profile/loadout').set(auth);
    expect(get.body).toEqual({ owned: [HARPOON, LIME], activeSkin: 1, activeVariant: 1, earned: NOTHING_EARNED, seekerSkin: false });
  });

  it('PUT with only one field leaves the other selector unchanged', async () => {
    fakeChain.setPlayer(WALLET, { inventory: (1n << BigInt(LIME)) | (1n << BigInt(HARPOON)) });
    await request(app).put('/api/profile/loadout').set(auth).send({ activeSkin: 1, activeVariant: 1 });
    const res = await request(app).put('/api/profile/loadout').set(auth).send({ activeSkin: 0 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ owned: [HARPOON, LIME], activeSkin: 0, activeVariant: 1, earned: NOTHING_EARNED, seekerSkin: false });
  });

  it.each([{ activeSkin: 18 }, { activeVariant: 9 }, { activeSkin: -1 }, { activeVariant: -1 }])('PUT answers 400 for an out-of-range selector (%j)', async (body) => {
    const res = await request(app).put('/api/profile/loadout').set(auth).send(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'BadRequest', message: 'activeSkin must be 0..17 and activeVariant must be 0..8' });
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

  // Champions and skins spec §3: a sold look or champion needs its inventory bit, a boss award needs
  // its level cleared in the stored campaign, the Seeker look needs the chain's Seeker link.
  it('PUT refuses a sold look (code 5 -> item 7, Bear) until its item is owned', async () => {
    const refused = await request(app).put('/api/profile/loadout').set(auth).send({ activeSkin: 5 });
    expect(refused.status).toBe(409);
    expect(refused.body).toEqual({ error: 'Loadout', code: 'not_owned', message: 'Skin item 7 is not owned' });

    fakeChain.setPlayer(WALLET, { inventory: 1n << 7n });
    const put = await request(app).put('/api/profile/loadout').set(auth).send({ activeSkin: 5 });
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ owned: [7], activeSkin: 5, activeVariant: 0, earned: NOTHING_EARNED, seekerSkin: false });
  });

  it('PUT refuses a sold champion (variant 4 -> item 15, Noob) until its item is owned', async () => {
    const refused = await request(app).put('/api/profile/loadout').set(auth).send({ activeVariant: 4 });
    expect(refused.status).toBe(409);
    expect(refused.body).toEqual({ error: 'Loadout', code: 'not_owned', message: 'Variant item 15 is not owned' });

    fakeChain.setPlayer(WALLET, { inventory: 1n << 15n });
    const put = await request(app).put('/api/profile/loadout').set(auth).send({ activeVariant: 4 });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ owned: [15], activeVariant: 4 });
  });

  it('PUT refuses the boss 2 look (skin 13) until level 12 is cleared, then GET echoes it', async () => {
    const refused = await request(app).put('/api/profile/loadout').set(auth).send({ activeSkin: 13 });
    expect(refused.status).toBe(409);
    expect(refused.body).toEqual({ error: 'Loadout', code: 'not_owned', message: 'Skin 13 is not earned' });

    await memoryCampaign.upsertProgress(user.id, progressClearing([12]));
    const put = await request(app).put('/api/profile/loadout').set(auth).send({ activeSkin: 13 });
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ owned: [], activeSkin: 13, activeVariant: 0, earned: { variants: [], skins: [13] }, seekerSkin: false });

    const get = await request(app).get('/api/profile/loadout').set(auth);
    expect(get.body).toEqual({ owned: [], activeSkin: 13, activeVariant: 0, earned: { variants: [], skins: [13] }, seekerSkin: false });
  });

  it('PUT refuses the boss 5 champion (variant 7, Hex) until level 30 is cleared', async () => {
    const refused = await request(app).put('/api/profile/loadout').set(auth).send({ activeVariant: 7 });
    expect(refused.status).toBe(409);
    expect(refused.body).toEqual({ error: 'Loadout', code: 'not_owned', message: 'Variant 7 is not earned' });

    await memoryCampaign.upsertProgress(user.id, progressClearing([30]));
    const put = await request(app).put('/api/profile/loadout').set(auth).send({ activeVariant: 7 });
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ owned: [], activeSkin: 0, activeVariant: 7, earned: { variants: [7], skins: [] }, seekerSkin: false });
  });

  it('GET lists every award the stored campaign has earned: champions by variant index, looks by code', async () => {
    await memoryCampaign.upsertProgress(user.id, progressClearing([1, 12, 24, 30, 36, 48, 59, 60]));
    const res = await request(app).get('/api/profile/loadout').set(auth);
    expect(res.body.earned).toEqual({ variants: [7, 8], skins: [13, 14, 15, 16] });
  });

  it('GET grows a thirty-level record first, so it earns only what its thirty levels hold', async () => {
    await memoryCampaign.upsertProgress(user.id, progressClearing([12, 24, 30], 30));
    const res = await request(app).get('/api/profile/loadout').set(auth);
    expect(res.body.earned).toEqual({ variants: [7], skins: [13, 14] });
  });

  it('PUT refuses the Seeker look (skin 17) until the wallet has a verified Seeker link', async () => {
    const refused = await request(app).put('/api/profile/loadout').set(auth).send({ activeSkin: 17 });
    expect(refused.status).toBe(409);
    expect(refused.body).toEqual({ error: 'Loadout', code: 'not_owned', message: 'Seeker skin needs a verified Seeker' });

    fakeChain.setPlayer(WALLET, { seeker: true });
    clearPlayerCache(); // what confirmSeekerLink does after a link lands
    const put = await request(app).put('/api/profile/loadout').set(auth).send({ activeSkin: 17 });
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ owned: [], activeSkin: 17, activeVariant: 0, earned: NOTHING_EARNED, seekerSkin: true });

    const get = await request(app).get('/api/profile/loadout').set(auth);
    expect(get.body).toMatchObject({ activeSkin: 17, seekerSkin: true });
  });

  it('PUT checks the skin before the variant', async () => {
    const res = await request(app).put('/api/profile/loadout').set(auth).send({ activeSkin: 13, activeVariant: 7 });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Skin 13 is not earned');
  });

  it('GET reports 0 for a stored selector that is no longer earned (a campaign reset un-earns)', async () => {
    await memoryCampaign.upsertProgress(user.id, progressClearing([12, 30]));
    const put = await request(app).put('/api/profile/loadout').set(auth).send({ activeSkin: 13, activeVariant: 7 });
    expect(put.status).toBe(200);

    memoryCampaign.reset();
    const get = await request(app).get('/api/profile/loadout').set(auth);
    expect(get.body).toEqual({ owned: [], activeSkin: 0, activeVariant: 0, earned: NOTHING_EARNED, seekerSkin: false });
  });

  it('GET reports 0 for a stored row naming a look and a champion the wallet never had', async () => {
    await memoryLoadout.upsertLoadout(WALLET, { activeSkin: 17, activeVariant: 8 });
    const get = await request(app).get('/api/profile/loadout').set(auth);
    expect(get.body).toMatchObject({ activeSkin: 0, activeVariant: 0 });
  });

  // Important #3 of the final review: every new chain/money route carries a per-route limiter,
  // matching the pre-existing routes of this class (backend/src/routes/daily.js).
  it('rate-limits PUT /loadout (sessionLimiter, 10/min per user)', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await request(app).put('/api/profile/loadout').set(auth).send({ activeSkin: 0, activeVariant: 0 });
      expect(res.status).toBe(200);
    }
    const res = await request(app).put('/api/profile/loadout').set(auth).send({ activeSkin: 0, activeVariant: 0 });
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ error: 'TooManySessions' });
  });
});
