import { Keypair, PublicKey, SystemProgram, TransactionMessage } from '@solana/web3.js';
import bs58 from 'bs58';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tokenFor } from './helpers/jwt.js';
import * as memory from './helpers/memoryRankedRuns.js';
import * as memoryUsers from './helpers/memoryUsers.js';
import * as fakeChain from './helpers/fakeChain.js';
import { FakeConnection } from './helpers/fakeConnection.js';
import { heliusFetch, mintAccount, tokenAccount } from './helpers/heliusFixture.js';
import { instructionsFromMessage, messageFrom, realLinkSeekerInstructions } from './helpers/fixtureTx.js';
import { confirmLimiter, sessionLimiter } from '../src/middleware/rateLimit.js';

vi.mock('../src/db/users.js', () => import('./helpers/memoryUsers.js'));
vi.mock('../src/chain/readers.js', () => import('./helpers/fakeChain.js'));
vi.mock('../src/chain/txs.js', () => import('./helpers/fakeChain.js'));

// chainConfig() needs a full, valid environment even though chain/readers.js and chain/txs.js are
// mocked above: `confirmSeekerLink` verifies against the real server authority, and its rejection
// tests build REAL `link_seeker` fixtures (via `vi.importActual`) against the real chain/program.js
// + chain/pdas.js + chain/verify.js - exactly what a wallet-signed link looks like on chain.
const serverAuthority = Keypair.generate();
process.env.SOLANA_CLUSTER = 'devnet';
process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
process.env.PROGRAM_ID = Keypair.generate().publicKey.toBase58();
process.env.SKR_MINT = Keypair.generate().publicKey.toBase58();
process.env.SERVER_AUTHORITY_SECRET = bs58.encode(serverAuthority.secretKey);
const HELIUS_KEY = 'test-helius-key';
process.env.HELIUS_API_KEY = HELIUS_KEY;
delete process.env.HELIUS_MAINNET_URL;

const { readSeeker, issueSeekerLink, confirmSeekerLink, SeekerError } = await import('../src/services/seeker.js');
const { getCachedPlayer, clearPlayerCache } = await import('../src/services/rankedRuns.js');
const { createApp } = await import('../src/createApp.js');
const { program } = await import('../src/chain/program.js');
const { configPda, playerPda, seekerLinkPda } = await import('../src/chain/pdas.js');
const realTxs = await vi.importActual('../src/chain/txs.js');

const user = memory.TEST_USER;
const WALLET = user.wallet_address;
const auth = { Authorization: `Bearer ${tokenFor(user)}` };
const SGT_MINT = Keypair.generate().publicKey.toBase58();
const OTHER_WALLET = Keypair.generate().publicKey.toBase58();

/** A Helius stub whose wallet holds one real Genesis Token, installed as the global `fetch`. */
function holdsGenesisToken(mint = SGT_MINT, { owner = WALLET } = {}) {
  const fetchImpl = heliusFetch({
    pages: [[tokenAccount({ owner, mint })]],
    mints: { [mint]: mintAccount({ mint }) },
  });
  vi.stubGlobal('fetch', fetchImpl);
  return fetchImpl;
}

/** A Helius stub for a wallet holding nothing at all. */
function holdsNothing() {
  const fetchImpl = heliusFetch({ pages: [[]] });
  vi.stubGlobal('fetch', fetchImpl);
  return fetchImpl;
}

/** A `link_seeker` transaction co-signed by somebody who is not our server authority. */
async function foreignAuthorityInstructions(wallet, sgtMint) {
  const connection = new FakeConnection();
  const walletKey = new PublicKey(wallet);
  const mintKey = new PublicKey(sgtMint);
  const ix = await program(connection)
    .methods.linkSeeker(mintKey)
    .accountsPartial({
      wallet: walletKey,
      serverAuthority: Keypair.generate().publicKey,
      config: configPda(),
      player: playerPda(walletKey),
      seekerLink: seekerLinkPda(mintKey),
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  const message = new TransactionMessage({
    payerKey: walletKey, recentBlockhash: '9BFbBLgQ5FLdTsg3D96oXTQmuGaEjkCJVAeDN9nWzPqi', instructions: [ix],
  }).compileToV0Message();
  return instructionsFromMessage(message);
}

describe('readSeeker', () => {
  beforeEach(() => {
    fakeChain.reset();
    memoryUsers.reset();
  });

  it('reports an unlinked player', async () => {
    expect(await readSeeker(WALLET)).toEqual({ linked: false, sgtMint: null });
  });

  it('reports the linked mint from the mirror once the chain says the player is linked', async () => {
    fakeChain.setPlayer(WALLET, { seeker: true });
    await memoryUsers.setSeekerMint(WALLET, SGT_MINT);
    expect(await readSeeker(WALLET)).toEqual({ linked: true, sgtMint: SGT_MINT });
  });

  it('still reports a linked player whose mirror row was never written', async () => {
    fakeChain.setPlayer(WALLET, { seeker: true });
    expect(await readSeeker(WALLET)).toEqual({ linked: true, sgtMint: null });
  });

  it('never grants the badge from the mirror alone: the chain is the truth', async () => {
    await memoryUsers.setSeekerMint(WALLET, SGT_MINT);
    expect(await readSeeker(WALLET)).toEqual({ linked: false, sgtMint: null });
  });
});

describe('issueSeekerLink', () => {
  beforeEach(() => {
    fakeChain.reset();
    memoryUsers.reset();
    process.env.HELIUS_API_KEY = HELIUS_KEY;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is unavailable without the Helius key, before asking the chain anything', async () => {
    delete process.env.HELIUS_API_KEY;
    await expect(issueSeekerLink({ wallet: WALLET })).rejects.toMatchObject({
      name: 'SeekerError', code: 'seeker_unavailable', status: 503,
    });
  });

  it('refuses a player who is already linked on chain, without asking Helius', async () => {
    const helius = holdsGenesisToken();
    fakeChain.setPlayer(WALLET, { seeker: true });
    await expect(issueSeekerLink({ wallet: WALLET })).rejects.toMatchObject({ code: 'seeker_already_linked', status: 409 });
    expect(helius.calls).toEqual([]);
  });

  it('answers no_seeker_token for a wallet holding none', async () => {
    holdsNothing();
    await expect(issueSeekerLink({ wallet: WALLET })).rejects.toMatchObject({ code: 'no_seeker_token', status: 404 });
  });

  it('refuses a mint already linked on chain', async () => {
    holdsGenesisToken();
    fakeChain.setSeekerLink(SGT_MINT, OTHER_WALLET);
    await expect(issueSeekerLink({ wallet: WALLET })).rejects.toMatchObject({ code: 'seeker_mint_taken', status: 409 });
  });

  it('refuses a mint the mirror already holds for another player', async () => {
    holdsGenesisToken();
    const other = await memoryUsers.findOrCreateWalletUser(OTHER_WALLET);
    await memoryUsers.setSeekerMint(other.wallet_address, SGT_MINT);
    await expect(issueSeekerLink({ wallet: WALLET })).rejects.toMatchObject({ code: 'seeker_mint_taken', status: 409 });
  });

  it('does not treat the wallet\'s own mirror row as taken', async () => {
    holdsGenesisToken();
    await memoryUsers.setSeekerMint(WALLET, SGT_MINT);
    const result = await issueSeekerLink({ wallet: WALLET });
    expect(result).toMatchObject({ sgtMint: SGT_MINT, transaction: expect.any(String) });
  });

  it('issues the link transaction for the token it found, creating the player first when there is none', async () => {
    holdsGenesisToken();
    const result = await issueSeekerLink({ wallet: WALLET });

    expect(result).toMatchObject({ transaction: expect.any(String), sgtMint: SGT_MINT, minContextSlot: 1234 });
    expect(fakeChain.state.calls.buildLinkSeekerTx).toEqual([{ wallet: WALLET, sgtMint: SGT_MINT, createPlayer: true }]);
  });

  it('skips create_player for a wallet that already has one', async () => {
    holdsGenesisToken();
    fakeChain.setPlayer(WALLET, { seeker: false });
    await issueSeekerLink({ wallet: WALLET });
    expect(fakeChain.state.calls.buildLinkSeekerTx[0].createPlayer).toBe(false);
  });
});

describe('confirmSeekerLink', () => {
  beforeEach(() => {
    fakeChain.reset();
    memoryUsers.reset();
  });

  it('returns confirmed:false while the transaction is not yet visible', async () => {
    expect(await confirmSeekerLink({ wallet: WALLET, signature: 'missing-sig' })).toEqual({ confirmed: false });
  });

  it('throws link_failed for a transaction that failed on chain', async () => {
    fakeChain.setConfirmedTx('failed-sig', { status: 'failed' });
    await expect(confirmSeekerLink({ wallet: WALLET, signature: 'failed-sig' })).rejects.toMatchObject({ code: 'link_failed', status: 409 });
  });

  it('rejects a foreign-program transaction', async () => {
    const walletKey = new PublicKey(WALLET);
    const transferIx = SystemProgram.transfer({ fromPubkey: walletKey, toPubkey: walletKey, lamports: 1 });
    fakeChain.setConfirmedTx('foreign-sig', { status: 'confirmed', instructions: instructionsFromMessage(messageFrom(walletKey, [transferIx])) });
    await expect(confirmSeekerLink({ wallet: WALLET, signature: 'foreign-sig' })).rejects.toMatchObject({ code: 'invalid_transaction', status: 400 });
  });

  it('rejects a link signed by another wallet', async () => {
    const instructions = await realLinkSeekerInstructions(realTxs, OTHER_WALLET, { sgtMint: SGT_MINT });
    fakeChain.setConfirmedTx('other-wallet-sig', { status: 'confirmed', instructions });
    await expect(confirmSeekerLink({ wallet: WALLET, signature: 'other-wallet-sig' })).rejects.toMatchObject({ code: 'invalid_transaction', status: 400 });
  });

  it('rejects a link co-signed by a foreign server authority', async () => {
    const instructions = await foreignAuthorityInstructions(WALLET, SGT_MINT);
    fakeChain.setConfirmedTx('foreign-authority-sig', { status: 'confirmed', instructions });
    await expect(confirmSeekerLink({ wallet: WALLET, signature: 'foreign-authority-sig' })).rejects.toMatchObject({ code: 'invalid_transaction', status: 400 });
  });

  it('clears the cached player, so today stops reporting the badge as missing', async () => {
    // `services/tickets.js` does the same after its own chain write: the cached `Player` still says
    // `seeker: false` for up to 5s otherwise, and `GET /api/daily/today` reads it.
    clearPlayerCache();
    fakeChain.setPlayer(WALLET, { seeker: false });
    expect((await getCachedPlayer(WALLET)).seeker).toBe(false);

    fakeChain.setPlayer(WALLET, { seeker: true });
    const instructions = await realLinkSeekerInstructions(realTxs, WALLET, { sgtMint: SGT_MINT });
    fakeChain.setConfirmedTx('link-sig', { status: 'confirmed', instructions });
    await confirmSeekerLink({ wallet: WALLET, signature: 'link-sig' });

    expect((await getCachedPlayer(WALLET)).seeker).toBe(true);
  });

  it('writes the mirror from the mint the verified instruction itself carries', async () => {
    const instructions = await realLinkSeekerInstructions(realTxs, WALLET, { sgtMint: SGT_MINT, createPlayer: true });
    fakeChain.setConfirmedTx('link-sig', { status: 'confirmed', instructions });

    expect(await confirmSeekerLink({ wallet: WALLET, signature: 'link-sig' })).toEqual({ linked: true, sgtMint: SGT_MINT });
    expect(await memoryUsers.getSeekerMint(WALLET)).toBe(SGT_MINT);
  });
});

describe('/api/seeker routes', () => {
  let app;
  beforeEach(() => {
    fakeChain.reset();
    memoryUsers.reset();
    process.env.HELIUS_API_KEY = HELIUS_KEY;
    // sessionLimiter/confirmLimiter are singletons shared with every other route mounted on them
    // (routes/daily.js, routes/shop.js); reset the per-user key so an earlier test's calls never
    // carry a used-up budget into this one.
    sessionLimiter.resetKey(`user:${user.id}`);
    confirmLimiter.resetKey(`user:${user.id}`);
    app = createApp();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires a token for every route', async () => {
    expect((await request(app).get('/api/seeker')).status).toBe(401);
    expect((await request(app).post('/api/seeker/link')).status).toBe(401);
    expect((await request(app).post('/api/seeker/confirm').send({ signature: 'x' })).status).toBe(401);
  });

  it('GET / answers the link status', async () => {
    const unlinked = await request(app).get('/api/seeker').set(auth);
    expect(unlinked.status).toBe(200);
    expect(unlinked.body).toEqual({ linked: false, sgtMint: null });

    fakeChain.setPlayer(WALLET, { seeker: true });
    await memoryUsers.setSeekerMint(WALLET, SGT_MINT);
    const linked = await request(app).get('/api/seeker').set(auth);
    expect(linked.body).toEqual({ linked: true, sgtMint: SGT_MINT });
  });

  it('POST /link answers 503 seeker_unavailable without the Helius key', async () => {
    delete process.env.HELIUS_API_KEY;
    const res = await request(app).post('/api/seeker/link').set(auth);
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ error: 'Seeker', code: 'seeker_unavailable', message: expect.any(String) });
  });

  it('POST /link answers 201 with the transaction and the mint it found', async () => {
    holdsGenesisToken();
    const res = await request(app).post('/api/seeker/link').set(auth);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ transaction: expect.any(String), sgtMint: SGT_MINT });
  });

  it('never leaks the Helius key into a response', async () => {
    holdsGenesisToken();
    const res = await request(app).post('/api/seeker/link').set(auth);
    expect(JSON.stringify(res.body)).not.toContain(HELIUS_KEY);
  });

  it('POST /link answers 404 no_seeker_token for a wallet holding none', async () => {
    holdsNothing();
    const res = await request(app).post('/api/seeker/link').set(auth);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'Seeker', code: 'no_seeker_token' });
  });

  it('POST /link answers 409 seeker_already_linked for a linked player', async () => {
    fakeChain.setPlayer(WALLET, { seeker: true });
    const res = await request(app).post('/api/seeker/link').set(auth);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'Seeker', code: 'seeker_already_linked' });
  });

  it('rate-limits POST /link (sessionLimiter, 10/min per user)', async () => {
    holdsGenesisToken();
    for (let i = 0; i < 10; i++) {
      expect((await request(app).post('/api/seeker/link').set(auth)).status).toBe(201);
    }
    const res = await request(app).post('/api/seeker/link').set(auth);
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ error: 'TooManySessions' });
  });

  it('POST /confirm needs a signature', async () => {
    const res = await request(app).post('/api/seeker/confirm').set(auth).send({});
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'BadRequest' });
  });

  it('POST /confirm answers 202 while the transaction is not visible, 200 once it links', async () => {
    const pending = await request(app).post('/api/seeker/confirm').set(auth).send({ signature: 'missing-sig' });
    expect(pending.status).toBe(202);
    expect(pending.body).toEqual({ confirmed: false });

    const instructions = await realLinkSeekerInstructions(realTxs, WALLET, { sgtMint: SGT_MINT });
    fakeChain.setConfirmedTx('link-sig', { status: 'confirmed', instructions });
    const linked = await request(app).post('/api/seeker/confirm').set(auth).send({ signature: 'link-sig' });
    expect(linked.status).toBe(200);
    expect(linked.body).toEqual({ linked: true, sgtMint: SGT_MINT });
  });

  it('POST /confirm answers 409 link_failed for a failed transaction', async () => {
    fakeChain.setConfirmedTx('failed-sig', { status: 'failed' });
    const res = await request(app).post('/api/seeker/confirm').set(auth).send({ signature: 'failed-sig' });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'Seeker', code: 'link_failed' });
  });
});

describe('SeekerError', () => {
  it('maps every code to its HTTP status', () => {
    expect(new SeekerError('seeker_unavailable', 'x').status).toBe(503);
    expect(new SeekerError('no_seeker_token', 'x').status).toBe(404);
    expect(new SeekerError('seeker_already_linked', 'x').status).toBe(409);
    expect(new SeekerError('seeker_mint_taken', 'x').status).toBe(409);
    expect(new SeekerError('link_failed', 'x').status).toBe(409);
    expect(new SeekerError('invalid_transaction', 'x').status).toBe(400);
  });
});
