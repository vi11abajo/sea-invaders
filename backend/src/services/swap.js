// SOL -> SKR swap quotes via Jupiter, gated to mainnet (design doc §3): the network is decided
// later, so every other endpoint in this phase stays cluster-agnostic, but a live quote against
// Jupiter only ever makes sense once the deployment has actually moved to mainnet.
import { chainConfig, currentCluster } from '../chain/config.js';

const JUPITER_QUOTE_URL = 'https://api.jup.ag/swap/v1/quote';
const JUPITER_SWAP_INSTRUCTIONS_URL = 'https://api.jup.ag/swap/v1/swap-instructions';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
// Caps the accounts Jupiter's route may use, leaving room in the composed v0 tx for our own payment instruction under the 1232-byte limit (parent design §2.2); tune once measured on mainnet.
const JUPITER_MAX_ACCOUNTS = 32;

export class SwapError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.name = 'SwapError';
    this.code = code;
    this.status = status;
  }
}

/** True once the deployment has moved to mainnet - the one cluster Jupiter can quote a real swap against. */
export function swapAvailable() {
  return currentCluster() === 'mainnet';
}

function jupiterHeaders() {
  const headers = {};
  if (process.env.JUPITER_API_KEY) headers['x-api-key'] = process.env.JUPITER_API_KEY;
  return headers;
}

/**
 * Quotes a SOL -> SKR swap for exactly `outSkr` SKR (`swapMode=ExactOut`) via Jupiter, then asks
 * Jupiter to build the actual swap instructions for `wallet` against that quote - the app composes
 * these into one v0 tx with the payment instruction (parent design §2.2). `JUPITER_API_KEY` is read
 * only from the server env and sent as `x-api-key`; it is never part of the returned value.
 * `fetchImpl` defaults to the global `fetch` so tests can inject a stub - this function never
 * touches the network in a test run otherwise.
 */
export async function quoteSwap({ outSkr, wallet, fetchImpl = fetch }) {
  const { skrMint } = chainConfig();
  const amount = Math.round(outSkr * 1e6); // SKR has 6 decimals

  const quoteUrl = new URL(JUPITER_QUOTE_URL);
  quoteUrl.searchParams.set('inputMint', SOL_MINT);
  quoteUrl.searchParams.set('outputMint', skrMint.toBase58());
  quoteUrl.searchParams.set('amount', String(amount));
  quoteUrl.searchParams.set('swapMode', 'ExactOut');
  quoteUrl.searchParams.set('maxAccounts', String(JUPITER_MAX_ACCOUNTS));

  const headers = jupiterHeaders();
  const quoteResponse = await fetchImpl(quoteUrl.toString(), { headers });
  if (!quoteResponse.ok) throw new SwapError('swap_quote_failed', `Jupiter quote failed with status ${quoteResponse.status}`);
  const quote = await quoteResponse.json();

  const instructionsResponse = await fetchImpl(JUPITER_SWAP_INSTRUCTIONS_URL, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ quoteResponse: quote, userPublicKey: wallet }),
  });
  if (!instructionsResponse.ok) throw new SwapError('swap_instructions_failed', `Jupiter swap-instructions failed with status ${instructionsResponse.status}`);
  const built = await instructionsResponse.json();

  const instructions = [
    ...(built.computeBudgetInstructions ?? []),
    ...(built.setupInstructions ?? []),
    built.swapInstruction,
    built.cleanupInstruction,
  ].filter(Boolean);

  return {
    inSol: Number(quote.inAmount) / 1e9,
    instructions,
    addressLookupTables: built.addressLookupTableAddresses ?? [],
  };
}
