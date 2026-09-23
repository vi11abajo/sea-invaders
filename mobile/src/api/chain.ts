import { VersionedTransaction, type Connection, type SignatureStatus } from '@solana/web3.js';
import { useMobileWallet } from '@wallet-ui/react-native-web3js';
import { toUint8Array } from 'js-base64';
import { useCallback } from 'react';

/** A transaction prepared by the backend, ready to be signed and sent by the connected wallet. */
export interface PreparedTx {
  transaction: string;
  blockhash: string;
  lastValidBlockHeight: number;
  minContextSlot: number;
}

/**
 * A payment the backend built. Normally one transaction, but a SKR price the wallet cannot cover is
 * paid by swapping SOL in the same payment (design doc §5 "Swap"), and a swap route too wide to
 * share one 1232-byte packet with our own instruction comes back as `transactions` instead: the
 * swap first, then the payment out of the SKR it delivered, signed and sent in that order.
 */
export interface PreparedPayment extends Omit<PreparedTx, 'transaction'> {
  /** The single transaction to sign; absent exactly when `transactions` is present. */
  transaction?: string;
  /** The two halves of a split payment, in the order they must be sent. */
  transactions?: string[];
  /** True when the backend paid the missing SKR by swapping SOL inside this payment. */
  swapped?: boolean;
  /** The SKR that swap buys — the part of the price the wallet could not cover. Present only with `swapped`. */
  swappedSkr?: number;
  /** The SOL that swap spends at the quoted price. Present only with `swapped`. */
  inSol?: number;
  /** The most lamports the wallet must hold for that swap: its slippage ceiling plus the temporary wrapped-SOL account's rent. Present only with `swapped`. */
  maxInLamports?: number;
}

/** Every transaction of `prepared`, in the order the wallet must send them. */
export function transactionsOf(prepared: PreparedPayment): string[] {
  if (prepared.transactions !== undefined) return prepared.transactions;
  return prepared.transaction === undefined ? [] : [prepared.transaction];
}

/** The wallet declined to sign, or the user backed out of the authorization prompt. */
export class WalletDeclined extends Error {
  constructor() {
    super('Wallet declined the request');
    this.name = 'WalletDeclined';
  }
}

/** The prepared transaction's blockhash is no longer valid; the caller should re-request and retry once. */
export class BlockhashExpired extends Error {
  constructor() {
    super('Blockhash expired, please try again');
    this.name = 'BlockhashExpired';
  }
}

// The Mobile Wallet Adapter protocol reports "the wallet declined to sign" as JSON-RPC error
// code -3 (ERROR_NOT_SIGNED, @solana-mobile/mobile-wallet-adapter-protocol). Some wallets also
// surface it only through the error message, so both are matched defensively.
const DECLINED_CODE = -3;
const DECLINED_MESSAGE = /declin|reject|cancel/i;
const EXPIRED_MESSAGE = /blockhash|expired|block height/i;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isDeclined(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === DECLINED_CODE || DECLINED_MESSAGE.test(messageOf(error));
}

function isBlockhashExpired(error: unknown): boolean {
  return EXPIRED_MESSAGE.test(messageOf(error));
}

/**
 * Deserialises a prepared transaction, has the connected wallet sign and send it, and resolves
 * with the signature. Rejects with `WalletDeclined` when the user backs out, `BlockhashExpired`
 * when the prepared blockhash is no longer valid, or the original error otherwise.
 */
export function useSignAndSend(): (prepared: PreparedTx) => Promise<string> {
  const { signAndSendTransactions } = useMobileWallet();
  return useCallback(
    async (prepared: PreparedTx) => {
      const transaction = VersionedTransaction.deserialize(toUint8Array(prepared.transaction));
      try {
        return await signAndSendTransactions(transaction, prepared.minContextSlot);
      } catch (error) {
        if (isDeclined(error)) throw new WalletDeclined();
        if (isBlockhashExpired(error)) throw new BlockhashExpired();
        throw error instanceof Error ? error : new Error(messageOf(error));
      }
    },
    [signAndSendTransactions],
  );
}

/**
 * Signs and sends a freshly-`request()`-ed transaction; on `BlockhashExpired` re-requests once
 * (a new blockhash) and retries, since that is the only case worth retrying automatically.
 */
export async function sendWithBlockhashRetry<T extends PreparedTx>(
  request: () => Promise<T>,
  signAndSend: (prepared: PreparedTx) => Promise<string>,
): Promise<{ signature: string; prepared: T }> {
  let prepared = await request();
  try {
    return { signature: await signAndSend(prepared), prepared };
  } catch (error) {
    if (!(error instanceof BlockhashExpired)) throw error;
    prepared = await request();
    return { signature: await signAndSend(prepared), prepared };
  }
}

/** A `pollUntilConfirmed` call gave up after `timeoutMs` without `fn` reporting `confirmed: true`. */
export class PollTimeout extends Error {
  constructor(message = 'Purchase not confirmed yet — pull to refresh in a moment') {
    super(message);
    this.name = 'PollTimeout';
  }
}

/** A `pollUntilConfirmed` call was stopped early by `isCancelled` (typically: the caller unmounted). */
export class PollCancelled extends Error {
  constructor() {
    super('Polling cancelled');
    this.name = 'PollCancelled';
  }
}

interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
  /** Checked before calling `fn` and again before scheduling the next tick; throws `PollCancelled` when true, so the timer chain does not outlive a caller that has gone away (e.g. an unmounted component). */
  isCancelled?: () => boolean;
  /** The `PollTimeout` copy, for a flow whose screen has no pull to refresh (the Shop's default otherwise). */
  timeoutMessage?: string;
}

/**
 * Calls `fn` every `intervalMs` until it resolves a result with `confirmed: true`, `fn` rejects
 * (a definitive failure, e.g. the transaction failed on chain — left to the caller to handle),
 * `timeoutMs` elapses (rejects with `PollTimeout`), or `isCancelled` reports true (rejects with
 * `PollCancelled`).
 */
export async function pollUntilConfirmed<T extends { confirmed: boolean }>(
  fn: () => Promise<T>,
  { intervalMs = 2000, timeoutMs = 60000, isCancelled, timeoutMessage }: PollOptions = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (isCancelled?.()) throw new PollCancelled();
    const result = await fn();
    if (result.confirmed) return result;
    if (isCancelled?.()) throw new PollCancelled();
    if (Date.now() >= deadline) throw new PollTimeout(timeoutMessage);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/** What one RPC read says about a sent signature; `null` = this RPC has no record of it, which alone proves nothing. */
export type SignatureVerdict = 'confirmed' | 'dead' | 'unknown';

/**
 * One RPC-only read of a sent signature. `err === null` at `confirmed` or `finalized` counts as
 * confirmed; a definite on-chain `err` counts as `dead`, since a failed transaction moves no tokens.
 * `null` means this RPC alone has never seen it — callers pair that with the transaction's own last
 * valid block height before calling it dead.
 */
export async function readSignature(connection: Connection, signature: string): Promise<SignatureVerdict | null> {
  let status: SignatureStatus | null;
  try {
    ({ value: status } = await connection.getSignatureStatus(signature, { searchTransactionHistory: true }));
  } catch {
    return 'unknown';
  }
  if (status === null) return null;
  if (status.err !== null) return 'dead';
  return status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized' ? 'confirmed' : 'unknown';
}

/**
 * Blocks past a transaction's last valid height before an unseen one counts as dead: a public RPC
 * endpoint balances across nodes, so the node answering the status may trail the one that answered
 * the height, and either can lag the network under load. 150 blocks is about a minute of slack.
 */
export const EXPIRY_MARGIN_BLOCKS = 150;

/** How `awaitLanded` ended. `unknown` = the transaction neither landed nor provably died inside the wait. */
export type LandedVerdict = 'landed' | 'failed' | 'unknown';

interface AwaitLandedOptions extends PollOptions {
  /** The last block height the transaction's blockhash is valid for, from the envelope that built it. */
  lastValidBlockHeight: number;
}

/**
 * Waits for a sent transaction to land. `landed` once the RPC reports it confirmed without error;
 * `failed` once it provably cannot land (it errored on chain, or the chain is well past its
 * blockhash's last valid height and the RPC still has no record of it); `unknown` if neither became
 * true inside `timeoutMs`. Throws `PollCancelled` once `isCancelled` reports the caller has gone
 * away. Nothing that depends on this transaction may be sent unless the answer is `landed`.
 */
export async function awaitLanded(
  connection: Connection,
  signature: string,
  { lastValidBlockHeight, intervalMs = 2000, timeoutMs = 60000, isCancelled }: AwaitLandedOptions,
): Promise<LandedVerdict> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (isCancelled?.()) throw new PollCancelled();
    const verdict = await readSignature(connection, signature);
    if (verdict === 'confirmed') return 'landed';
    if (verdict === 'dead') return 'failed';
    if (verdict === null) {
      // No record of it anywhere: dead only once the chain is past the blockhash it was built on.
      const height = await connection.getBlockHeight('confirmed').catch(() => null);
      if (height !== null && height > lastValidBlockHeight + EXPIRY_MARGIN_BLOCKS) return 'failed';
    }
    if (isCancelled?.()) throw new PollCancelled();
    if (Date.now() >= deadline) return 'unknown';
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
