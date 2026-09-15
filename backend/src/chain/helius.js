// The Seeker Genesis Token check (design doc §3). The game itself runs on its own cluster, but the
// token only exists on mainnet, so this one read goes through Helius instead of `chain/connection.js` -
// and it stays a read: nothing here signs or sends anything. The server's signature on `link_seeker`
// is the attestation that this check passed (`chain/txs.js#buildLinkSeekerTx`).
//
// What counts as a Genesis Token follows the Solana Mobile documentation for engaging Seeker users:
// a Token-2022 account with a non-zero balance whose mint carries all three marks below. Any one of
// them alone is forgeable - anybody can mint a token named like the real one - so all three are
// required, and the mint authority is checked first because it is the cheapest to fake-proof.
import { heliusUrl } from './config.js';

/** The only token program the check asks about: the Genesis Token is a Token-2022 mint. */
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
/** The Genesis Token's mint authority. */
const SGT_MINT_AUTHORITY = 'GT2zuHVaZQYZSyQMgJPLzvkmyztfyXg2NJunqFp4p3A4';
/** The collection the Genesis Token belongs to - named both by its metadata pointer and by its token group. */
const SGT_COLLECTION = 'GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te';
/** Token accounts per `getTokenAccountsByOwnerV2` page (the API takes 1..10000); a wallet with more is walked via `paginationKey`. */
const PAGE_LIMIT = 1000;
/** Mints per `getMultipleAccounts` call - the RPC's own limit on how many accounts one call can read. */
const MINTS_PER_CHUNK = 100;
/**
 * Bounds on one wallet's walk. The reference ends pagination by returning no accounts rather than by
 * clearing the cursor, so a cursor that never clears must not become an endless loop. `MAX_MINT_READS`
 * bounds the number of distinct mints read across the whole walk (not the number of RPC calls - those
 * are `MAX_MINT_READS / MINTS_PER_CHUNK` at most, ten today): since anybody can airdrop a Token-2022
 * token, a wallet can be stuffed with junk mints, and a wallet past these limits answers "no token"
 * instead of spending unbounded time and Helius credits on one `/link` call.
 */
const MAX_PAGES = 10;
const MAX_MINT_READS = 1000;

/**
 * One Helius JSON-RPC call. Errors name the method and the status, never the URL: the URL carries
 * `HELIUS_API_KEY`, and an error message is the one place a secret escapes into logs unnoticed.
 */
async function rpc(method, params, fetchImpl) {
  const url = heliusUrl();
  if (!url) throw new Error('HELIUS_API_KEY is not configured');

  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`Helius ${method} failed with status ${response.status}`);

  const body = await response.json();
  if (body?.error) throw new Error(`Helius ${method} answered an error: ${body.error.message ?? body.error.code}`);
  return body?.result ?? null;
}

/** The balance a parsed token account holds, as a `bigint`; `0n` for anything unreadable. */
function heldAmount(info) {
  const amount = info?.tokenAmount?.amount;
  if (typeof amount !== 'string' && typeof amount !== 'number') return 0n;
  try {
    return BigInt(amount);
  } catch {
    return 0n;
  }
}

/** The `state` of a Token-2022 extension on a `jsonParsed` mint, or `null` when the mint has no such extension. */
function extensionState(info, name) {
  return (info?.extensions ?? []).find((extension) => extension?.extension === name)?.state ?? null;
}

/** True when a `jsonParsed` mint carries all three marks of a Genesis Token. */
function isGenesisMint(info) {
  return info?.mintAuthority === SGT_MINT_AUTHORITY
    && extensionState(info, 'metadataPointer')?.metadataAddress === SGT_COLLECTION
    && extensionState(info, 'tokenGroupMember')?.group === SGT_COLLECTION;
}

/**
 * One page of token accounts, in whichever of the two documented envelopes came back: without
 * `withContext` (what this module asks for) `result.value` IS the array of accounts and the cursor
 * sits beside it at `result.paginationKey`; with `withContext: true` a `context` appears and both
 * move inside `result.value`. Reading both costs one line and means a proxy or a future caller that
 * turns `withContext` on cannot silently drop every account.
 */
function accountsPage(result) {
  if (Array.isArray(result?.value)) {
    return { accounts: result.value, paginationKey: result.paginationKey ?? null };
  }
  return { accounts: result?.value?.accounts ?? [], paginationKey: result?.value?.paginationKey ?? null };
}

/**
 * Reads up to `MINTS_PER_CHUNK` mint accounts at once (the caller chunks). `getMultipleAccounts`
 * answers `result.value`, an array in the same order as `mints` with `null` for an account the RPC
 * does not know - each other element the same `{ data: { parsed: { info } } }` shape `getAccountInfo`
 * returns per account (Solana JSON-RPC docs: `getMultipleAccounts`).
 */
async function readMintAccounts(mints, fetchImpl) {
  const result = await rpc('getMultipleAccounts', [mints, { encoding: 'jsonParsed' }], fetchImpl);
  return result?.value ?? [];
}

/**
 * The mint (base58) of a Seeker Genesis Token `wallet` holds on mainnet, or `null` when it holds
 * none. Walks the wallet's Token-2022 accounts page by page (ending on an empty page, a cleared
 * cursor or `MAX_PAGES`); on each page, the candidate mints (non-zero balance, not already checked)
 * are read together via `getMultipleAccounts` in chunks of at most `MINTS_PER_CHUNK` rather than one
 * `getAccountInfo` per mint, so the common case (the token is right there) costs exactly two RPC
 * calls - one page, one batch read. The first mint whose account passes `isGenesisMint` is returned
 * at once, without reading the rest of the chunk or any later one.
 *
 * A chunk read that fails (the RPC call itself throwing - HTTP or JSON-RPC error) does not abort the
 * walk: it is skipped, and a later chunk or page can still be accepted. Only if nothing is ever
 * accepted AND at least one chunk read failed does the walk throw, rather than answer the false
 * "no token" a wallet would otherwise get from one bad read; the message never carries the key.
 *
 * `fetchImpl` defaults to the global `fetch` so tests can inject a stub; nothing here touches the
 * network in a test run. The API key never appears in the return value or in a thrown error.
 */
export async function findSeekerGenesisToken(wallet, { fetchImpl = fetch } = {}) {
  const owner = typeof wallet === 'string' ? wallet : wallet.toBase58();
  const checked = new Set();
  let paginationKey = null;
  let readFailed = false;

  const finish = () => {
    if (readFailed) throw new Error('Helius mint read failed');
    return null;
  };

  for (let page = 0; page < MAX_PAGES; page++) {
    const options = { encoding: 'jsonParsed', limit: PAGE_LIMIT };
    if (paginationKey) options.paginationKey = paginationKey;
    const result = await rpc('getTokenAccountsByOwnerV2', [owner, { programId: TOKEN_2022_PROGRAM_ID }, options], fetchImpl);
    const { accounts, paginationKey: nextKey } = accountsPage(result);
    // "End of pagination is only indicated when no token accounts are returned" - an empty page ends
    // the walk even when a cursor came back with it.
    if (accounts.length === 0) return finish();

    const candidates = [];
    for (const account of accounts) {
      const info = account?.account?.data?.parsed?.info;
      const mint = info?.mint;
      if (!mint || heldAmount(info) === 0n || checked.has(mint)) continue;
      checked.add(mint);
      candidates.push(mint);
      if (checked.size >= MAX_MINT_READS) break;
    }

    for (let i = 0; i < candidates.length; i += MINTS_PER_CHUNK) {
      const chunk = candidates.slice(i, i + MINTS_PER_CHUNK);
      let infos;
      try {
        infos = await readMintAccounts(chunk, fetchImpl);
      } catch {
        readFailed = true;
        continue;
      }
      for (let j = 0; j < chunk.length; j++) {
        if (isGenesisMint(infos[j]?.data?.parsed?.info)) return chunk[j];
      }
    }

    if (checked.size >= MAX_MINT_READS) return finish();
    if (!nextKey) return finish();
    paginationKey = nextKey;
  }

  return finish();
}
