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
/** Token accounts per `getTokenAccountsByOwnerV2` page; a wallet with more is walked via `paginationKey`. */
const PAGE_LIMIT = 1000;

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

/** Reads a mint account on mainnet and says whether it is a Genesis Token. A mint the RPC does not know is not one. */
async function mintIsGenesis(mint, fetchImpl) {
  const account = await rpc('getAccountInfo', [mint, { encoding: 'jsonParsed' }], fetchImpl);
  return isGenesisMint(account?.value?.data?.parsed?.info);
}

/**
 * The mint (base58) of a Seeker Genesis Token `wallet` holds on mainnet, or `null` when it holds
 * none. Walks the wallet's Token-2022 accounts page by page, skips the ones it has emptied, and
 * reads each remaining mint until one passes `isGenesisMint` - the first accepted mint is returned
 * at once, so the common case (the token is right there) costs two RPC calls.
 *
 * `fetchImpl` defaults to the global `fetch` so tests can inject a stub; nothing here touches the
 * network in a test run. The API key never appears in the return value or in a thrown error.
 */
export async function findSeekerGenesisToken(wallet, { fetchImpl = fetch } = {}) {
  const owner = typeof wallet === 'string' ? wallet : wallet.toBase58();
  const checked = new Set();
  let paginationKey = null;

  do {
    const page = { encoding: 'jsonParsed', limit: PAGE_LIMIT };
    if (paginationKey) page.paginationKey = paginationKey;
    const result = await rpc('getTokenAccountsByOwnerV2', [owner, { programId: TOKEN_2022_PROGRAM_ID }, page], fetchImpl);

    for (const account of result?.accounts ?? []) {
      const info = account?.account?.data?.parsed?.info;
      const mint = info?.mint;
      if (!mint || heldAmount(info) === 0n || checked.has(mint)) continue;
      checked.add(mint);
      if (await mintIsGenesis(mint, fetchImpl)) return mint;
    }

    paginationKey = result?.paginationKey ?? null;
  } while (paginationKey);

  return null;
}
