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
