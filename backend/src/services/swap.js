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
 * Quotes a SOL -> SKR swap for exactly the SKR asked for (`swapMode=ExactOut`) via Jupiter, then
 * asks Jupiter to build the actual swap instructions for `wallet` against that quote - `chain/txs.js`
 * composes these into one v0 tx with the payment instruction (design doc §5 "Swap").
 * `outBaseUnits` (a `bigint` of the exact on-chain `u64`) is what the purchase/revive path passes,
 * so the swap buys precisely the SKR the wallet is short of; `outSkr` (a decimal, 6 places) is what
 * `POST /api/swap/quote` passes for the Shop's `≈ X SOL` labels. `JUPITER_API_KEY` is read only
 * from the server env and sent as `x-api-key`; it is never part of the returned value. `fetchImpl`
 * defaults to the global `fetch` so tests can inject a stub - this function never touches the
 * network in a test run otherwise.
 */
export async function quoteSwap({ outSkr, outBaseUnits, wallet, fetchImpl = fetch }) {
  const { skrMint } = chainConfig();
  // SKR has 6 decimals; `outBaseUnits` is already in them and must not round-trip through a float.
  const amount = outBaseUnits === undefined ? Math.round(outSkr * 1e6) : outBaseUnits;

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

/**
 * The swap plan for a payment `wallet` cannot cover in SKR - `price` and `balance` in base units -
 * or `null` when no swap is wanted or possible, in which case the caller keeps its own
 * `not_enough_skr` behaviour. Both conditions have to hold: the caller asked for it (`requested`,
 * the app's `swap: true`) and the deployment is on the one cluster Jupiter can quote against.
 * The swap buys exactly the missing SKR, never the whole price: whatever the wallet already holds
 * is spent first.
 */
export async function planSwap({ requested, wallet, price, balance, fetchImpl }) {
  if (!requested || !swapAvailable()) return null;
  return quoteSwap({ outBaseUnits: price - balance, wallet, fetchImpl });
}
