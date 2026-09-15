// Turns a compiled v0 message into the `{ programId, accountKeys, data }[]` shape
// `chain/readers.js#getConfirmedInstructions` produces from a real RPC response, so tests can feed
// a locally-built (or hand-assembled) transaction straight into a `confirm*` service under test -
// exercising the real `chain/verify.js` logic with byte-accurate fixtures instead of a stub.
import { TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { flattenInstructions } from '../../src/chain/flatten.js';
import { FakeConnection } from './fakeConnection.js';

const DEFAULT_BLOCKHASH = '9BFbBLgQ5FLdTsg3D96oXTQmuGaEjkCJVAeDN9nWzPqi';

/**
 * Delegates to the same production `flattenInstructions` `chain/readers.js#getConfirmedInstructions` uses -
 * no copied flattening logic. `chain/flatten.js` is never mocked, so this stays the real implementation
 * even in test files that mock `chain/readers.js`/`chain/txs.js`. `lookupTables` (the
 * `AddressLookupTableAccount`s a swap-composed message compiled against) stands in for the
 * `meta.loadedAddresses` a real RPC reports, so a looked-up account key resolves the same way.
 */
export function instructionsFromMessage(message, lookupTables = []) {
  const keys = lookupTables.length > 0
    ? message.getAccountKeys({ addressLookupTableAccounts: lookupTables })
    : message.getAccountKeys();
  return flattenInstructions(message, keys);
}

/** Compiles a v0 message for `instructions`, fee payer `payerKey` - for building fixtures not covered by any `chain/txs.js` builder (e.g. a foreign-program instruction). */
export function messageFrom(payerKey, instructions, blockhash = DEFAULT_BLOCKHASH) {
  return new TransactionMessage({ payerKey, recentBlockhash: blockhash, instructions }).compileToV0Message();
}

/** Decodes a builder's base64 envelope back into a `VersionedTransaction` for inspection. */
export function decodeTx(base64) {
  return VersionedTransaction.deserialize(Buffer.from(base64, 'base64'));
}

/**
 * Builds a real, byte-accurate `purchase` transaction and flattens its instructions - shared by
 * `shop.test.js` and `tide.test.js` so the fixture-building logic for `confirm*`'s rejection tests
 * lives in one place. `realTxs` is the caller's own `vi.importActual('../src/chain/txs.js')` (the
 * un-mocked builder), since the calling test file itself mocks `chain/txs.js` for everything else.
 */
export async function realPurchaseInstructions(realTxs, wallet, { itemId = 3, maxPrice = 25_000_000n, week, treasury } = {}) {
  const envelope = await realTxs.buildPurchaseTx(wallet, { itemId, maxPrice, week, treasury, connection: new FakeConnection() });
  return instructionsFromMessage(decodeTx(envelope.transaction).message);
}

/** Same as `realPurchaseInstructions`, for a `revive` transaction. */
export async function realReviveInstructions(realTxs, wallet, { week, treasury, maxPrice = 25_000_000n } = {}) {
  const envelope = await realTxs.buildReviveTx(wallet, { week, treasury, maxPrice, connection: new FakeConnection() });
  return instructionsFromMessage(decodeTx(envelope.transaction).message);
}

/** Same as `realPurchaseInstructions`, for a `link_seeker` transaction - co-signed by whichever server authority `chain/config.js` reports, exactly as the backend issues it. */
export async function realLinkSeekerInstructions(realTxs, wallet, { sgtMint, createPlayer = false } = {}) {
  const envelope = await realTxs.buildLinkSeekerTx(wallet, { sgtMint, createPlayer, connection: new FakeConnection() });
  return instructionsFromMessage(decodeTx(envelope.transaction).message);
}
