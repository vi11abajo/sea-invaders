// Loads `test/fixtures/jupiter-swap-instructions.json` (a documented-shape sample of Jupiter's
// ExactOut quote + `POST /swap/v1/swap-instructions` answer - see the fixture's own `_comment` for
// its provenance) and binds it to a test's wallet and SKR mint, so the composition under test sees
// the same account keys a real Jupiter route would build for that wallet.
import { readFileSync } from 'node:fs';
import { PublicKey } from '@solana/web3.js';
import { ata } from '../../src/chain/pdas.js';

const FIXTURE_URL = new URL('../fixtures/jupiter-swap-instructions.json', import.meta.url);
const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/** The placeholders the fixture carries, resolved against `wallet` and the environment's SKR mint. */
function substitutions(wallet, skrMint) {
  return {
    USER_WALLET: new PublicKey(wallet).toBase58(),
    USER_WSOL_ATA: ata(wallet, WSOL_MINT).toBase58(),
    USER_USDC_ATA: ata(wallet, USDC_MINT).toBase58(),
    USER_SKR_ATA: ata(wallet, skrMint).toBase58(),
    SKR_MINT: new PublicKey(skrMint).toBase58(),
  };
}

function resolve(value, map) {
  if (typeof value === 'string') return map[value] ?? value;
  if (Array.isArray(value)) return value.map((entry) => resolve(entry, map));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, resolve(entry, map)]));
  }
  return value;
}

/**
 * `{ quote, built }` for `wallet` (base58 or `PublicKey`) against `skrMint`, with every placeholder
 * resolved - `built` is exactly what `services/swap.js` gets back from `/swap/v1/swap-instructions`.
 */
export function jupiterFixture(wallet, skrMint) {
  const raw = JSON.parse(readFileSync(FIXTURE_URL, 'utf8'));
  const map = substitutions(wallet, skrMint);
  return { quote: resolve(raw.quote, map), built: resolve(raw.swapInstructions, map) };
}

/** Every account key the fixture's instructions touch that an address lookup table may hold: not a signer, not a program id. */
export function lookupTableCandidates(built) {
  const instructions = [
    ...built.computeBudgetInstructions,
    ...built.setupInstructions,
    built.swapInstruction,
    built.cleanupInstruction,
  ].filter(Boolean);
  const programIds = new Set(instructions.map((ix) => ix.programId));
  const signers = new Set(instructions.flatMap((ix) => ix.accounts.filter((a) => a.isSigner).map((a) => a.pubkey)));
  const keys = new Set();
  for (const ix of instructions) {
    for (const account of ix.accounts) {
      if (!programIds.has(account.pubkey) && !signers.has(account.pubkey)) keys.add(account.pubkey);
    }
  }
  return [...keys];
}

/**
 * A `fetchImpl` for `quoteSwap` that answers the quote and swap-instructions calls from `fixture`
 * and records the calls it received - the same stub style `test/swap.test.js` already uses, so no
 * test in this suite ever reaches the network.
 */
export function fixtureFetch({ quote, built }) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('/swap-instructions')) return { ok: true, json: async () => built };
    return { ok: true, json: async () => quote };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}
