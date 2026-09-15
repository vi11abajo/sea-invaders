import { Keypair, PublicKey } from '@solana/web3.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  heliusFetch, mintAccount, tokenAccount, SGT_COLLECTION, SGT_MINT_AUTHORITY, TOKEN_2022_PROGRAM_ID,
} from './helpers/heliusFixture.js';

// The key is read live from `process.env` (like every other chain config value), so a test can set
// it up-front and delete it again to exercise the unconfigured case.
const API_KEY = 'test-helius-key';
process.env.HELIUS_API_KEY = API_KEY;
delete process.env.HELIUS_MAINNET_URL;

const { findSeekerGenesisToken } = await import('../src/chain/helius.js');
const { heliusAvailable, heliusUrl } = await import('../src/chain/config.js');

const WALLET = Keypair.generate().publicKey.toBase58();
const SGT_MINT = Keypair.generate().publicKey.toBase58();
const OTHER_MINT = Keypair.generate().publicKey.toBase58();

/** The wallet's accounts as one page, plus the mints behind them - the shape most tests here need. */
function oneAccountOf(mint, { amount = '1', mintOverrides = {} } = {}) {
  return {
    pages: [[tokenAccount({ owner: WALLET, mint, amount })]],
    mints: { [mint]: mintAccount({ mint, ...mintOverrides }) },
  };
}

describe('helius config', () => {
  afterEach(() => {
    process.env.HELIUS_API_KEY = API_KEY;
    delete process.env.HELIUS_MAINNET_URL;
  });

  it('defaults to the Helius mainnet endpoint carrying the key', () => {
    expect(heliusAvailable()).toBe(true);
    expect(heliusUrl()).toBe(`https://mainnet.helius-rpc.com/?api-key=${API_KEY}`);
  });

  it('lets HELIUS_MAINNET_URL override the endpoint', () => {
    process.env.HELIUS_MAINNET_URL = 'https://rpc.example.invalid/seeker';
    expect(heliusUrl()).toBe('https://rpc.example.invalid/seeker');
  });

  it('is unavailable without the key, and has no URL to call', () => {
    delete process.env.HELIUS_API_KEY;
    expect(heliusAvailable()).toBe(false);
    expect(heliusUrl()).toBeNull();
  });
});

describe('findSeekerGenesisToken', () => {
  beforeEach(() => {
    process.env.HELIUS_API_KEY = API_KEY;
    delete process.env.HELIUS_MAINNET_URL;
  });

  it('returns the mint of a Genesis Token the wallet holds, from the documented result.value page', async () => {
    const fetchImpl = heliusFetch(oneAccountOf(SGT_MINT));
    expect(await findSeekerGenesisToken(WALLET, { fetchImpl })).toBe(SGT_MINT);
  });

  it('reads the withContext envelope too, where the accounts move inside result.value', async () => {
    const fetchImpl = heliusFetch({ ...oneAccountOf(SGT_MINT), withContext: true });
    expect(await findSeekerGenesisToken(WALLET, { fetchImpl })).toBe(SGT_MINT);
  });

  it('asks Helius only about Token-2022, parsed, a page at a time', async () => {
    const fetchImpl = heliusFetch(oneAccountOf(SGT_MINT));
    await findSeekerGenesisToken(WALLET, { fetchImpl });

    const [accounts, mint] = fetchImpl.calls;
    expect(accounts.method).toBe('getTokenAccountsByOwnerV2');
    expect(accounts.params[0]).toBe(WALLET);
    expect(accounts.params[1]).toEqual({ programId: TOKEN_2022_PROGRAM_ID });
    expect(accounts.params[2]).toMatchObject({ encoding: 'jsonParsed', limit: 1000 });
    expect(mint.method).toBe('getAccountInfo');
    expect(mint.params).toEqual([SGT_MINT, { encoding: 'jsonParsed' }]);
  });

  it('returns null for a wallet with no Token-2022 accounts at all, without reading any mint', async () => {
    const fetchImpl = heliusFetch({ pages: [[]] });
    expect(await findSeekerGenesisToken(WALLET, { fetchImpl })).toBeNull();
    expect(fetchImpl.calls.some((call) => call.method === 'getAccountInfo')).toBe(false);
  });

  it('skips an emptied account, even when its mint is a real Genesis Token', async () => {
    const fetchImpl = heliusFetch(oneAccountOf(SGT_MINT, { amount: '0' }));
    expect(await findSeekerGenesisToken(WALLET, { fetchImpl })).toBeNull();
    expect(fetchImpl.calls.some((call) => call.method === 'getAccountInfo')).toBe(false);
  });

  it('rejects a mint with a foreign mint authority', async () => {
    const mintAuthority = Keypair.generate().publicKey.toBase58();
    const fetchImpl = heliusFetch(oneAccountOf(OTHER_MINT, { mintOverrides: { mintAuthority } }));
    expect(await findSeekerGenesisToken(WALLET, { fetchImpl })).toBeNull();
  });

  it('rejects a mint whose metadata pointer names another address', async () => {
    const metadataAddress = Keypair.generate().publicKey.toBase58();
    const fetchImpl = heliusFetch(oneAccountOf(OTHER_MINT, { mintOverrides: { metadataAddress } }));
    expect(await findSeekerGenesisToken(WALLET, { fetchImpl })).toBeNull();
  });

  it('rejects a mint whose token group is another group', async () => {
    const group = Keypair.generate().publicKey.toBase58();
    const fetchImpl = heliusFetch(oneAccountOf(OTHER_MINT, { mintOverrides: { group } }));
    expect(await findSeekerGenesisToken(WALLET, { fetchImpl })).toBeNull();
  });

  it('rejects a mint carrying the right authority but no extensions at all', async () => {
    const fetchImpl = heliusFetch(oneAccountOf(OTHER_MINT, { mintOverrides: { extensions: [] } }));
    expect(await findSeekerGenesisToken(WALLET, { fetchImpl })).toBeNull();
  });

  it('rejects a mint the RPC does not know', async () => {
    const fetchImpl = heliusFetch({ pages: [[tokenAccount({ owner: WALLET, mint: OTHER_MINT })]], mints: {} });
    expect(await findSeekerGenesisToken(WALLET, { fetchImpl })).toBeNull();
  });

  it('follows paginationKey until the Genesis Token turns up on a later page', async () => {
    const fetchImpl = heliusFetch({
      pages: [
        [tokenAccount({ owner: WALLET, mint: OTHER_MINT })],
        [tokenAccount({ owner: WALLET, mint: SGT_MINT })],
      ],
      mints: {
        [OTHER_MINT]: mintAccount({ mint: OTHER_MINT, mintAuthority: Keypair.generate().publicKey.toBase58() }),
        [SGT_MINT]: mintAccount({ mint: SGT_MINT }),
      },
    });

    expect(await findSeekerGenesisToken(WALLET, { fetchImpl })).toBe(SGT_MINT);
    const pageCalls = fetchImpl.calls.filter((call) => call.method === 'getTokenAccountsByOwnerV2');
    expect(pageCalls).toHaveLength(2);
    expect(pageCalls[1].params[2].paginationKey).toBe('page-1');
  });

  it('ends the walk on an empty page, the only reliable end-of-pagination signal the API gives', async () => {
    // `endlessCursor` keeps handing out a `paginationKey` past the last page - exactly what the
    // reference warns about - so only the empty page can stop this walk.
    const fetchImpl = heliusFetch({
      pages: [[tokenAccount({ owner: WALLET, mint: OTHER_MINT })], []],
      mints: { [OTHER_MINT]: mintAccount({ mint: OTHER_MINT, mintAuthority: Keypair.generate().publicKey.toBase58() }) },
      endlessCursor: true,
    });

    expect(await findSeekerGenesisToken(WALLET, { fetchImpl })).toBeNull();
    expect(fetchImpl.calls.filter((call) => call.method === 'getTokenAccountsByOwnerV2')).toHaveLength(2);
  });

  it('gives up rather than following a cursor that never clears', async () => {
    const fetchImpl = heliusFetch({
      pages: [[tokenAccount({ owner: WALLET, mint: OTHER_MINT })]],
      mints: { [OTHER_MINT]: mintAccount({ mint: OTHER_MINT, mintAuthority: Keypair.generate().publicKey.toBase58() }) },
      endlessCursor: true,
      repeatLastPage: true,
    });

    expect(await findSeekerGenesisToken(WALLET, { fetchImpl })).toBeNull();
    const pageCalls = fetchImpl.calls.filter((call) => call.method === 'getTokenAccountsByOwnerV2');
    expect(pageCalls.length).toBeGreaterThan(1); // it does page, it just does not page forever
    expect(pageCalls.length).toBeLessThanOrEqual(10);
  });

  it('caps how many mints one wallet can make it read', async () => {
    // A wallet can be stuffed with junk Token-2022 mints (anyone can airdrop one), and every distinct
    // mint costs a sequential getAccountInfo - so the scan is bounded rather than unbounded work.
    const junk = Array.from({ length: 300 }, (_, i) => new PublicKey(new Uint8Array(32).fill(i + 1)).toBase58());
    const fetchImpl = heliusFetch({
      pages: [junk.map((mint) => tokenAccount({ owner: WALLET, mint }))],
      mints: Object.fromEntries(junk.map((mint) => [mint, mintAccount({ mint, mintAuthority: OTHER_MINT })])),
    });

    expect(await findSeekerGenesisToken(WALLET, { fetchImpl })).toBeNull();
    const mintCalls = fetchImpl.calls.filter((call) => call.method === 'getAccountInfo');
    expect(mintCalls.length).toBeGreaterThan(1);
    expect(mintCalls.length).toBeLessThanOrEqual(100);
  });

  it('stops at the first accepted mint instead of reading the rest of the wallet', async () => {
    const fetchImpl = heliusFetch({
      pages: [
        [tokenAccount({ owner: WALLET, mint: SGT_MINT }), tokenAccount({ owner: WALLET, mint: OTHER_MINT })],
        [tokenAccount({ owner: WALLET, mint: OTHER_MINT })],
      ],
      mints: { [SGT_MINT]: mintAccount({ mint: SGT_MINT }), [OTHER_MINT]: mintAccount({ mint: OTHER_MINT }) },
    });

    expect(await findSeekerGenesisToken(WALLET, { fetchImpl })).toBe(SGT_MINT);
    expect(fetchImpl.calls.filter((call) => call.method === 'getTokenAccountsByOwnerV2')).toHaveLength(1);
    expect(fetchImpl.calls.filter((call) => call.method === 'getAccountInfo')).toHaveLength(1);
  });

  it('accepts a mint only when all three marks hold at once', async () => {
    // The happy path's own fixture, spelled out: the one mint `findSeekerGenesisToken` accepted
    // above carries exactly the authority, metadata pointer and group the documentation names.
    const info = mintAccount({ mint: SGT_MINT }).data.parsed.info;
    expect(info.mintAuthority).toBe(SGT_MINT_AUTHORITY);
    expect(info.extensions.find((ext) => ext.extension === 'metadataPointer').state.metadataAddress).toBe(SGT_COLLECTION);
    expect(info.extensions.find((ext) => ext.extension === 'tokenGroupMember').state.group).toBe(SGT_COLLECTION);
  });

  it('never puts the API key in the error of a failed Helius call', async () => {
    const fetchImpl = heliusFetch({ ok: false, status: 503 });
    const error = await findSeekerGenesisToken(WALLET, { fetchImpl }).catch((err) => err);
    expect(error.message).toMatch(/503/);
    expect(error.message).not.toContain(API_KEY);
  });

  it('never puts the API key in the error of a JSON-RPC error answer', async () => {
    const fetchImpl = heliusFetch({ error: { code: -32601, message: 'Method not found' } });
    const error = await findSeekerGenesisToken(WALLET, { fetchImpl }).catch((err) => err);
    expect(error.message).toMatch(/Method not found/);
    expect(error.message).not.toContain(API_KEY);
  });

  it('refuses to call anything without the key configured', async () => {
    delete process.env.HELIUS_API_KEY;
    const fetchImpl = heliusFetch(oneAccountOf(SGT_MINT));
    await expect(findSeekerGenesisToken(WALLET, { fetchImpl })).rejects.toThrow(/HELIUS_API_KEY/);
    expect(fetchImpl.calls).toEqual([]);
  });
});
