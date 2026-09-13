import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tokenFor } from './helpers/jwt.js';
import * as memory from './helpers/memoryRankedRuns.js';

const serverAuthority = Keypair.generate();
process.env.SOLANA_CLUSTER = process.env.SOLANA_CLUSTER || 'devnet';
process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
process.env.PROGRAM_ID = Keypair.generate().publicKey.toBase58();
process.env.SKR_MINT = Keypair.generate().publicKey.toBase58();
process.env.SERVER_AUTHORITY_SECRET = bs58.encode(serverAuthority.secretKey);

const { swapAvailable, quoteSwap, SwapError } = await import('../src/services/swap.js');
const { createApp } = await import('../src/createApp.js');
const user = memory.TEST_USER;
const auth = { Authorization: `Bearer ${tokenFor(user)}` };

describe('swapAvailable', () => {
  afterEach(() => {
    delete process.env.SOLANA_CLUSTER;
  });

  it('is false on devnet (the swap gate: spec §3)', () => {
    process.env.SOLANA_CLUSTER = 'devnet';
    expect(swapAvailable()).toBe(false);
  });

  it('is false when SOLANA_CLUSTER is unset (defaults to devnet)', () => {
    delete process.env.SOLANA_CLUSTER;
    expect(swapAvailable()).toBe(false);
  });

  it('is true on mainnet', () => {
    process.env.SOLANA_CLUSTER = 'mainnet';
    expect(swapAvailable()).toBe(true);
  });
});

describe('quoteSwap', () => {
  const originalCluster = process.env.SOLANA_CLUSTER;
  const originalKey = process.env.JUPITER_API_KEY;

  beforeEach(() => {
    process.env.SOLANA_CLUSTER = 'mainnet';
  });
  afterEach(() => {
    process.env.SOLANA_CLUSTER = originalCluster;
    if (originalKey === undefined) delete process.env.JUPITER_API_KEY;
    else process.env.JUPITER_API_KEY = originalKey;
  });

  function fakeFetch({ quote, built }) {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).includes('/swap-instructions')) {
        return { ok: true, json: async () => built };
      }
      return { ok: true, json: async () => quote };
    };
    fetchImpl.calls = calls;
    return fetchImpl;
  }

  it('never touches the real network: it only calls the injected fetchImpl', async () => {
    const fetchImpl = fakeFetch({
      quote: { inAmount: '500000000', outAmount: '25000000' },
      built: { computeBudgetInstructions: [], setupInstructions: [], swapInstruction: { data: 'abc' }, cleanupInstruction: null, addressLookupTableAddresses: ['LUT1'] },
    });
    const result = await quoteSwap({ outSkr: 25, wallet: Keypair.generate().publicKey.toBase58(), fetchImpl });

    expect(fetchImpl.calls).toHaveLength(2);
    expect(fetchImpl.calls[0].url).toContain('https://api.jup.ag/swap/v1/quote');
    expect(fetchImpl.calls[0].url).toContain('swapMode=ExactOut');
    expect(result.inSol).toBeCloseTo(0.5);
    expect(result.instructions).toEqual([{ data: 'abc' }]);
    expect(result.addressLookupTables).toEqual(['LUT1']);
  });

  it('sends JUPITER_API_KEY as the x-api-key header when present, and never returns it', async () => {
    process.env.JUPITER_API_KEY = 'secret-key';
    const fetchImpl = fakeFetch({
      quote: { inAmount: '1000000', outAmount: '1000000' },
      built: { computeBudgetInstructions: [], setupInstructions: [], swapInstruction: {}, cleanupInstruction: null, addressLookupTableAddresses: [] },
    });
    const result = await quoteSwap({ outSkr: 1, wallet: Keypair.generate().publicKey.toBase58(), fetchImpl });

    expect(fetchImpl.calls[0].init.headers['x-api-key']).toBe('secret-key');
    expect(JSON.stringify(result)).not.toContain('secret-key');
  });

  it('omits the x-api-key header when JUPITER_API_KEY is not set', async () => {
    delete process.env.JUPITER_API_KEY;
    const fetchImpl = fakeFetch({
      quote: { inAmount: '1000000', outAmount: '1000000' },
      built: { computeBudgetInstructions: [], setupInstructions: [], swapInstruction: {}, cleanupInstruction: null, addressLookupTableAddresses: [] },
    });
    await quoteSwap({ outSkr: 1, wallet: Keypair.generate().publicKey.toBase58(), fetchImpl });
    expect(fetchImpl.calls[0].init.headers['x-api-key']).toBeUndefined();
  });

  it('throws SwapError when the quote request fails', async () => {
    const fetchImpl = async () => ({ ok: false, status: 500 });
    await expect(quoteSwap({ outSkr: 25, wallet: Keypair.generate().publicKey.toBase58(), fetchImpl })).rejects.toBeInstanceOf(SwapError);
  });
});

describe('POST /api/swap/quote', () => {
  const originalCluster = process.env.SOLANA_CLUSTER;
  afterEach(() => {
    process.env.SOLANA_CLUSTER = originalCluster;
    vi.unstubAllGlobals();
  });

  it('requires a token', async () => {
    process.env.SOLANA_CLUSTER = 'devnet';
    const app = createApp();
    expect((await request(app).post('/api/swap/quote').send({ outSkr: 25 })).status).toBe(401);
  });

  it('answers 409 in the RankedRun-style shape on devnet (the swap gate)', async () => {
    process.env.SOLANA_CLUSTER = 'devnet';
    const app = createApp();
    const res = await request(app).post('/api/swap/quote').set(auth).send({ outSkr: 25 });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'Swap', code: 'swap_unavailable' });
  });

  it('quotes on mainnet, never touching the real network (fetch is stubbed)', async () => {
    process.env.SOLANA_CLUSTER = 'mainnet';
    const urls = [];
    vi.stubGlobal('fetch', async (url) => {
      urls.push(String(url));
      if (String(url).includes('/swap-instructions')) {
        return { ok: true, json: async () => ({ computeBudgetInstructions: [], setupInstructions: [], swapInstruction: { data: 'ix' }, cleanupInstruction: null, addressLookupTableAddresses: [] }) };
      }
      return { ok: true, json: async () => ({ inAmount: '250000000', outAmount: '25000000' }) };
    });
    const app = createApp();
    const res = await request(app).post('/api/swap/quote').set(auth).send({ outSkr: 25 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ inSol: 0.25, instructions: [{ data: 'ix' }], addressLookupTables: [] });
    expect(urls[0]).toContain('maxAccounts=32');
  });
});
