import { VersionedTransaction } from '@solana/web3.js';
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
  constructor() {
    super('Purchase not confirmed yet — pull to refresh in a moment');
    this.name = 'PollTimeout';
  }
}

interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
}

/**
 * Calls `fn` every `intervalMs` until it resolves a result with `confirmed: true`, `fn` rejects
 * (a definitive failure, e.g. the transaction failed on chain — left to the caller to handle), or
 * `timeoutMs` elapses (rejects with `PollTimeout`).
 */
export async function pollUntilConfirmed<T extends { confirmed: boolean }>(
  fn: () => Promise<T>,
  { intervalMs = 2000, timeoutMs = 60000 }: PollOptions = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await fn();
    if (result.confirmed) return result;
    if (Date.now() >= deadline) throw new PollTimeout();
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
