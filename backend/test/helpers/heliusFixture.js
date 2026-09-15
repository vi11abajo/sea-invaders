// Loads `test/fixtures/helius-seeker-token.json` (documented-shape samples of the two Helius
// JSON-RPC answers the Seeker Genesis Token check reads - see the fixture's own `_comment` for its
// provenance) and builds the wallet's token accounts, the mints behind them and a `fetch` stub that
// serves both in the envelopes the Helius reference documents, so no test in this suite ever reaches
// the network and none of them can pass against an envelope the API does not return. The three addresses the check
// compares against are re-stated by the fixture rather than imported from `chain/helius.js`, so a
// typo in the module cannot make its own test pass.
import { readFileSync } from 'node:fs';

const FIXTURE_URL = new URL('../fixtures/helius-seeker-token.json', import.meta.url);
const raw = JSON.parse(readFileSync(FIXTURE_URL, 'utf8'));

/** The Seeker Genesis Token's mint authority, as the Solana Mobile documentation names it. */
export const SGT_MINT_AUTHORITY = raw.sgt.mintAuthority;
/** The collection address the Genesis Token's metadata pointer and token group both name. */
export const SGT_COLLECTION = raw.sgt.collection;
/** The Token-2022 program, the only one the check asks Helius about. */
export const TOKEN_2022_PROGRAM_ID = raw.sgt.tokenProgramId;

function resolve(value, map) {
  if (typeof value === 'string') return map[value] ?? value;
  if (Array.isArray(value)) return value.map((entry) => resolve(entry, map));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, resolve(entry, map)]));
  }
  return value;
}

/** One Token-2022 token account of `owner`, holding `amount` of `mint`, as `getTokenAccountsByOwnerV2` reports it with `jsonParsed`. */
export function tokenAccount({ owner, mint, amount = '1', pubkey = 'TokenAccount11111111111111111111111111111111' }) {
  return resolve(raw.tokenAccount, {
    OWNER_WALLET: owner, TOKEN_MINT: mint, TOKEN_AMOUNT: String(amount), TOKEN_ACCOUNT: pubkey,
  });
}

/**
 * A Token-2022 mint account with `jsonParsed` encoding - both what `getAccountInfo` reports for one
 * mint and, unwrapped the same way, what one element of a `getMultipleAccounts` `result.value` array
 * looks like. Every field the Seeker check reads defaults to a real Genesis Token's value, so a test
 * only names the one it wants wrong.
 */
export function mintAccount({ mint, mintAuthority = SGT_MINT_AUTHORITY, metadataAddress = SGT_COLLECTION, group = SGT_COLLECTION, extensions } = {}) {
  const account = resolve(raw.mintAccount, {
    TOKEN_MINT: mint, MINT_AUTHORITY: mintAuthority, METADATA_ADDRESS: metadataAddress, GROUP_ADDRESS: group,
  });
  if (extensions !== undefined) account.data.parsed.info.extensions = extensions;
  return account;
}

function rpcResponse(result) {
  return { ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result }) };
}

/**
 * One `getTokenAccountsByOwnerV2` page in whichever envelope the request asked for - the two the
 * Helius reference documents. Without `withContext` the accounts ARE `result.value` (a bare array)
 * and the cursor sits beside them at `result.paginationKey`; with `withContext: true` a `context`
 * appears and both move inside `result.value`.
 */
function accountsPage(accounts, paginationKey, withContext) {
  if (withContext) {
    return { context: { slot: 1, apiVersion: '2.0.0' }, value: { accounts, paginationKey } };
  }
  return { value: accounts, paginationKey };
}

/**
 * A `fetch` stub answering Helius's JSON-RPC calls: `pages` holds the wallet's Token-2022 accounts
 * split into `getTokenAccountsByOwnerV2` pages (the stub hands out `paginationKey`s and expects them
 * back), `mints` maps a mint address to what its account looks like (an unknown mint answers `null`,
 * as the RPC does). Every call is recorded, so a test can assert both what was asked and that nothing
 * was asked once the answer was already known.
 *
 * Mints are read in batches via `getMultipleAccounts`, not one at a time: the request's first param
 * is the array of mint addresses, and PROVENANCE (Solana JSON-RPC docs, `getMultipleAccounts`) - the
 * reply is `result.value`, an array in the same order as the request with `null` for an account the
 * RPC does not know and each other element the same per-account shape `mints` already holds.
 * `failMultipleAccountsCalls` names the 1-based `getMultipleAccounts` call numbers (not counting
 * `getTokenAccountsByOwnerV2` calls) that should fail with a transport error instead of answering, so
 * a test can simulate one bad chunk read without the rest of the walk failing too.
 *
 * `withContext` serves the context envelope instead of the default one. `endlessCursor` keeps handing
 * out a cursor past the last page - what the reference warns about, since "end of pagination is only
 * indicated when no token accounts are returned"; with `repeatLastPage` that cursor also keeps
 * returning accounts, which is the walk that has to be capped rather than followed forever.
 */
export function heliusFetch({
  pages = [[]], mints = {}, withContext = false, endlessCursor = false, repeatLastPage = false,
  ok = true, status = 200, error = null, failMultipleAccountsCalls = [],
} = {}) {
  const calls = [];
  let multipleAccountsCalls = 0;
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url: String(url), method: body.method, params: body.params, headers: init.headers });
    if (!ok) return { ok: false, status, json: async () => ({}) };
    if (error) return { ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, error }) };
    if (body.method === 'getTokenAccountsByOwnerV2') {
      const key = body.params[2]?.paginationKey ?? null;
      const index = key === null ? 0 : Number(String(key).replace('page-', ''));
      const accounts = pages[index] ?? (repeatLastPage ? pages[pages.length - 1] : []);
      const hasMore = index + 1 < pages.length || endlessCursor;
      return rpcResponse(accountsPage(accounts, hasMore ? `page-${index + 1}` : null, withContext));
    }
    if (body.method === 'getMultipleAccounts') {
      multipleAccountsCalls += 1;
      if (failMultipleAccountsCalls.includes(multipleAccountsCalls)) {
        return { ok: false, status: 503, json: async () => ({}) };
      }
      const [requested] = body.params;
      return rpcResponse({ value: requested.map((mint) => mints[mint] ?? null) });
    }
    throw new Error(`Unexpected Helius method ${body.method}`);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}
