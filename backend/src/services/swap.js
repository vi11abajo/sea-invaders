// SOL -> SKR swap quotes via Jupiter, gated to mainnet (design doc §3): the network is decided
// later, so every other endpoint in this phase stays cluster-agnostic, but a live quote against
// Jupiter only ever makes sense once the deployment has actually moved to mainnet.
import { chainConfig, currentCluster } from '../chain/config.js';

const JUPITER_QUOTE_URL = 'https://api.jup.ag/swap/v1/quote';
const JUPITER_SWAP_INSTRUCTIONS_URL = 'https://api.jup.ag/swap/v1/swap-instructions';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
// Caps the accounts Jupiter's route may use, leaving room in the composed v0 tx for our own payment instruction under the 1232-byte limit (parent design §2.2); tune once measured on mainnet.
const JUPITER_MAX_ACCOUNTS = 32;
/**
 * Rent the temporary wrapped-SOL account has to hold while the swap runs, before Jupiter's cleanup
 * instruction closes it and gives it back. An SPL token account is 165 bytes, and Solana's
 * rent-exempt minimum is `(128 + size) * 3480 lamports_per_byte_year * 2 exemption_threshold`
 * = `293 * 6960` = 2_039_280. Counted into `maxInLamports` so the app's "not enough SOL" check
 * cannot pass a wallet that would then fail at the wallet or on chain. Conservative by design: a
 * wallet that already holds a wrapped-SOL account does not actually need it.
 */
const WSOL_ACCOUNT_RENT_LAMPORTS = 2_039_280n;

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

/**
 * `value` as a positive `bigint`, or a `SwapError` naming `field`. Jupiter reports amounts as
 * decimal strings; anything missing, fractional or non-numeric would otherwise become a `NaN` that
 * serialises to `null` in our own response, or a transaction built against an amount nobody read.
 */
function amountOf(value, field) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new SwapError('swap_quote_invalid', `Jupiter quote is missing ${field}`);
  }
  let amount;
  try {
    amount = BigInt(value);
  } catch {
    throw new SwapError('swap_quote_invalid', `Jupiter quote has a non-numeric ${field}`);
  }
  if (amount <= 0n) throw new SwapError('swap_quote_invalid', `Jupiter quote has a non-positive ${field}`);
  return amount;
}

function jupiterHeaders() {
  const headers = {};
  if (process.env.JUPITER_API_KEY) headers['x-api-key'] = process.env.JUPITER_API_KEY;
  return headers;
}

/** `outBaseUnits` when given (a `bigint` of the exact on-chain `u64`), otherwise `outSkr` (a decimal, 6 places) rounded into base units - never round-tripped through a float when the caller already has the exact integer. */
function resolveAmount(outSkr, outBaseUnits) {
  return outBaseUnits === undefined ? Math.round(outSkr * 1e6) : outBaseUnits;
}

/**
 * The Jupiter `GET /quote` call alone (`swapMode=ExactOut`, capped to `JUPITER_MAX_ACCOUNTS`), with
 * its answer checked before anything is built on it: amounts must be readable positive integers and
 * the route must actually deliver `amount` of SKR, so a bad quote becomes a clean `SwapError` rather
 * than a `NaN` in our own response or a transaction that fails on chain with the fee already spent.
 * Returns the raw `quote` (Jupiter's `/swap-instructions` needs it verbatim) alongside `inAmount` and
 * `maxIn` - the quote's `otherAmountThreshold` when it names one higher than `inAmount`, otherwise
 * `inAmount` itself - the most the wallet must actually hold for the swap at its slippage ceiling.
 */
async function requestQuote(amount, fetchImpl) {
  const { skrMint } = chainConfig();
  const quoteUrl = new URL(JUPITER_QUOTE_URL);
  quoteUrl.searchParams.set('inputMint', SOL_MINT);
  quoteUrl.searchParams.set('outputMint', skrMint.toBase58());
  quoteUrl.searchParams.set('amount', String(amount));
  quoteUrl.searchParams.set('swapMode', 'ExactOut');
  quoteUrl.searchParams.set('maxAccounts', String(JUPITER_MAX_ACCOUNTS));

  const quoteResponse = await fetchImpl(quoteUrl.toString(), { headers: jupiterHeaders() });
  if (!quoteResponse.ok) throw new SwapError('swap_quote_failed', `Jupiter quote failed with status ${quoteResponse.status}`);
  const quote = await quoteResponse.json();

  // ExactOut should return exactly what was asked for. A route that would deliver less leaves the
  // payment short and fails on chain after the fee is spent, so it is refused here instead.
  const inAmount = amountOf(quote?.inAmount, 'inAmount');
  const outAmount = amountOf(quote?.outAmount, 'outAmount');
  if (outAmount < BigInt(amount)) {
    throw new SwapError('swap_quote_short', `Jupiter quoted ${outAmount} SKR base units for a swap of ${amount}`);
  }
  // For an ExactOut quote `otherAmountThreshold` is the most input the swap may take at the quoted
  // slippage (the fixture's 1_930_943 is exactly 50 bps over its 1_921_336 `inAmount`). A quote
  // that omits it, or names less than it actually costs, falls back to the quoted input.
  let maxIn = inAmount;
  if (quote?.otherAmountThreshold !== undefined && quote?.otherAmountThreshold !== null) {
    const threshold = amountOf(quote.otherAmountThreshold, 'otherAmountThreshold');
    if (threshold > maxIn) maxIn = threshold;
  }
  return { quote, inAmount, maxIn };
}

/**
 * Quotes a SOL -> SKR swap for exactly the SKR asked for (`swapMode=ExactOut`) via Jupiter, then
 * asks Jupiter to build the actual swap instructions for `wallet` against that quote - `chain/txs.js`
 * composes these into one v0 tx with the payment instruction (design doc §5 "Swap"). Used only by
 * `planSwap`, i.e. the payment composition path (`issuePurchase`/`issueRevive` with `swap: true`):
 * the price label path (`POST /api/swap/quote`, the Shop's `≈ X SOL`) uses the cheaper `quoteSwapPrice`
 * below instead, which never calls `/swap-instructions` at all.
 *
 * `outBaseUnits` (a `bigint` of the exact on-chain `u64`) is what the purchase/revive path passes,
 * so the swap buys precisely the SKR the wallet is short of. `JUPITER_API_KEY` is read only from the
 * server env and sent as `x-api-key`; it is never part of the returned value. `fetchImpl` defaults to
 * the global `fetch` so tests can inject a stub - this function never touches the network in a test
 * run otherwise. Besides `inSol` (what the quote costs) the result carries `maxInLamports` - the most
 * SOL the wallet must hold - so the app never has to guess the slippage or rent margins.
 */
export async function quoteSwap({ outSkr, outBaseUnits, wallet, fetchImpl = fetch }) {
  const amount = resolveAmount(outSkr, outBaseUnits);
  const { quote, inAmount, maxIn } = await requestQuote(amount, fetchImpl);

  const instructionsResponse = await fetchImpl(JUPITER_SWAP_INSTRUCTIONS_URL, {
    method: 'POST',
    headers: { ...jupiterHeaders(), 'Content-Type': 'application/json' },
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
    inSol: Number(inAmount) / 1e9,
    /** The most SOL, in lamports, the wallet has to hold for this swap: its slippage ceiling plus the wrapped-SOL account's rent. */
    maxInLamports: Number(maxIn + WSOL_ACCOUNT_RENT_LAMPORTS),
    instructions,
    addressLookupTables: built.addressLookupTableAddresses ?? [],
  };
}

// A label-only quote's price rarely moves fast enough to matter inside one Shop visit, and the
// catalogue itself is cached this long (`services/shop.js`'s `CATALOG_TTL_MS`) - matching it here
// means a quote never outlives the prices it was quoted for.
const QUOTE_PRICE_TTL_MS = 60_000;
/** amount (base units, as a string) -> { promise, expiresAt }. A pending entry is shared by every caller that asks for the same price before it resolves, so concurrent callers never double-fetch. */
let quotePriceCache = new Map();

/** Clears the cached SOL-price quotes (tests only - in production a price simply expires after 60s). */
export function clearSwapPriceCache() {
  quotePriceCache = new Map();
}

/**
 * The SOL price of buying `outSkr` SKR - `{ inSol, maxInLamports }` only, from Jupiter's `GET /quote`
 * alone. This is the label path: `POST /api/swap/quote` serves the Shop's and the Tide's `≈ X SOL`
 * figures from it, and nothing here ever touches `/swap-instructions` - the expensive,
 * `userPublicKey`-bound call that builds real instructions and resolves lookup tables belongs solely
 * to `quoteSwap` (the payment composition path), which nothing in the label path needs: the label
 * discards everything but the SOL figure.
 *
 * Distinct prices are cached for `QUOTE_PRICE_TTL_MS` (60s, the catalogue's own TTL) and a price
 * already in flight is shared rather than re-fetched, so a Shop screen asking for several items'
 * prices - many of which share a catalogue price - costs at most one Jupiter call per distinct price,
 * not one per item.
 */
export async function quoteSwapPrice({ outSkr, fetchImpl = fetch }) {
  const amount = resolveAmount(outSkr, undefined);
  const key = String(amount);
  const cached = quotePriceCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const promise = requestQuote(amount, fetchImpl).then(({ inAmount, maxIn }) => ({
    inSol: Number(inAmount) / 1e9,
    maxInLamports: Number(maxIn + WSOL_ACCOUNT_RENT_LAMPORTS),
  }));
  quotePriceCache.set(key, { promise, expiresAt: Date.now() + QUOTE_PRICE_TTL_MS });
  // A failed quote must not poison the cache for the next caller - only a genuine answer is worth 60s.
  promise.catch(() => quotePriceCache.delete(key));
  return promise;
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
  const shortfall = price - balance;
  const quote = await quoteSwap({ outBaseUnits: shortfall, wallet, fetchImpl });
  // `swappedSkr` is what the signing sheet names: the SKR this swap buys, which is only part of the
  // price when the wallet already holds some - the rest is paid out of that balance.
  return { ...quote, swappedSkr: Number(shortfall) / 1e6 };
}

/** The fields a swap-composed payment adds to its envelope, or nothing at all when `plan` is null. Shared by `issuePurchase` and `issueRevive` so both answer in the same shape. */
export function swapEnvelope(plan) {
  if (plan === null) return {};
  return { swapped: true, swappedSkr: plan.swappedSkr, inSol: plan.inSol, maxInLamports: plan.maxInLamports };
}
