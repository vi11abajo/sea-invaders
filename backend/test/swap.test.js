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

const { swapAvailable, quoteSwap, planSwap, SwapError } = await import('../src/services/swap.js');
const { createApp } = await import('../src/createApp.js');
const user = memory.TEST_USER;
const auth = { Authorization: `Bearer ${tokenFor(user)}` };

/** A `fetchImpl` answering both Jupiter calls from a fixed pair of responses, recording every call it got. */
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

  it('asks for exactly the base units it was given, without a float round trip', async () => {
    const fetchImpl = fakeFetch({
      quote: { inAmount: '123456789', outAmount: '14999999' },
      built: { computeBudgetInstructions: [], setupInstructions: [], swapInstruction: {}, cleanupInstruction: null, addressLookupTableAddresses: [] },
    });
    // 14.999999 SKR: a price the decimal path could only reach through 14.999999 * 1e6, which floats cannot hold exactly.
    await quoteSwap({ outBaseUnits: 14_999_999n, wallet: Keypair.generate().publicKey.toBase58(), fetchImpl });
    expect(fetchImpl.calls[0].url).toContain('amount=14999999');
  });

  it('throws SwapError when the quote request fails', async () => {
    const fetchImpl = async () => ({ ok: false, status: 500 });
    await expect(quoteSwap({ outSkr: 25, wallet: Keypair.generate().publicKey.toBase58(), fetchImpl })).rejects.toBeInstanceOf(SwapError);
  });

  // An ExactOut quote that does not actually deliver the SKR asked for, or that reports amounts the
  // backend cannot read, would otherwise become a transaction that fails on chain and burns its fee.
  describe('quote sanity checks', () => {
    const built = { computeBudgetInstructions: [], setupInstructions: [], swapInstruction: {}, cleanupInstruction: null, addressLookupTableAddresses: [] };
    const ask = (quote) => quoteSwap({ outBaseUnits: 25_000_000n, wallet: Keypair.generate().publicKey.toBase58(), fetchImpl: fakeFetch({ quote, built }) });

    it('rejects a quote that would deliver less SKR than was asked for', async () => {
      await expect(ask({ inAmount: '500000000', outAmount: '24999999' })).rejects.toMatchObject({ name: 'SwapError', code: 'swap_quote_short', status: 502 });
    });

    it('accepts a quote that delivers more than was asked for (never less)', async () => {
      await expect(ask({ inAmount: '500000000', outAmount: '25000001' })).resolves.toMatchObject({ inSol: 0.5 });
    });

    it('rejects a quote with no inAmount rather than reporting NaN SOL', async () => {
      await expect(ask({ outAmount: '25000000' })).rejects.toMatchObject({ name: 'SwapError', code: 'swap_quote_invalid' });
    });

    it('rejects a quote with no outAmount', async () => {
      await expect(ask({ inAmount: '500000000' })).rejects.toMatchObject({ name: 'SwapError', code: 'swap_quote_invalid' });
    });

    it('rejects a non-numeric amount', async () => {
      await expect(ask({ inAmount: '0.5 SOL', outAmount: '25000000' })).rejects.toMatchObject({ name: 'SwapError', code: 'swap_quote_invalid' });
    });

    it('rejects a zero or negative input amount', async () => {
      await expect(ask({ inAmount: '0', outAmount: '25000000' })).rejects.toMatchObject({ name: 'SwapError', code: 'swap_quote_invalid' });
    });
  });

  describe('maxInLamports', () => {
    const built = { computeBudgetInstructions: [], setupInstructions: [], swapInstruction: {}, cleanupInstruction: null, addressLookupTableAddresses: [] };
    const ask = (quote) => quoteSwap({ outBaseUnits: 10_000_000n, wallet: Keypair.generate().publicKey.toBase58(), fetchImpl: fakeFetch({ quote, built }) });

    it('is the quote\'s maximum input plus the temporary wSOL account\'s rent', async () => {
      // The fixture's own numbers: 1_921_336 at 50 bps of slippage is a 1_930_943 ceiling.
      const result = await ask({ inAmount: '1921336', outAmount: '10000000', otherAmountThreshold: '1930943' });
      expect(result.maxInLamports).toBe(1_930_943 + 2_039_280);
      expect(result.inSol).toBeCloseTo(0.001921336, 9);
    });

    it('falls back to the quoted input when the quote names no threshold', async () => {
      const result = await ask({ inAmount: '1921336', outAmount: '10000000' });
      expect(result.maxInLamports).toBe(1_921_336 + 2_039_280);
    });

    it('never drops below the quoted input, even if the threshold is smaller', async () => {
      const result = await ask({ inAmount: '1921336', outAmount: '10000000', otherAmountThreshold: '1000000' });
      expect(result.maxInLamports).toBe(1_921_336 + 2_039_280);
    });
  });
});

describe('planSwap', () => {
  const originalCluster = process.env.SOLANA_CLUSTER;
  afterEach(() => {
    process.env.SOLANA_CLUSTER = originalCluster;
  });

  it('reports the SKR it buys, so the signing sheet can say what is being swapped', async () => {
    process.env.SOLANA_CLUSTER = 'mainnet';
    const fetchImpl = fakeFetch({
      quote: { inAmount: '1921336', outAmount: '15000000', otherAmountThreshold: '1930943' },
      built: { computeBudgetInstructions: [], setupInstructions: [], swapInstruction: {}, cleanupInstruction: null, addressLookupTableAddresses: [] },
    });
    const plan = await planSwap({ requested: true, wallet: Keypair.generate().publicKey.toBase58(), price: 25_000_000n, balance: 10_000_000n, fetchImpl });

    expect(fetchImpl.calls[0].url).toContain('amount=15000000');
    expect(plan).toMatchObject({ swappedSkr: 15, inSol: 0.001921336, maxInLamports: 1_930_943 + 2_039_280 });
  });

  it('is null on devnet and when no swap was asked for, without touching Jupiter', async () => {
    const fetchImpl = fakeFetch({ quote: {}, built: {} });
    process.env.SOLANA_CLUSTER = 'devnet';
    expect(await planSwap({ requested: true, wallet: 'W', price: 2n, balance: 1n, fetchImpl })).toBeNull();
    process.env.SOLANA_CLUSTER = 'mainnet';
    expect(await planSwap({ requested: false, wallet: 'W', price: 2n, balance: 1n, fetchImpl })).toBeNull();
    expect(fetchImpl.calls).toEqual([]);
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
    // `maxInLamports` is additive to spec §3's `{ inSol, instructions, addressLookupTables }`: the
    // quote has no `otherAmountThreshold`, so it is the quoted input plus the wSOL account's rent.
    expect(res.body).toEqual({ inSol: 0.25, maxInLamports: 250_000_000 + 2_039_280, instructions: [{ data: 'ix' }], addressLookupTables: [] });
    expect(urls[0]).toContain('maxAccounts=32');
  });
});
