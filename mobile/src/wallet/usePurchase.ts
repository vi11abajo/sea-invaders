import { PublicKey, VersionedTransaction, type Connection } from '@solana/web3.js';
import { useMobileWallet } from '@wallet-ui/react-native-web3js';
import { toUint8Array } from 'js-base64';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BlockhashExpired, PollCancelled, pollUntilConfirmed, useSignAndSend, WalletDeclined, type PreparedTx } from '../api/chain';
import { ApiError } from '../api/client';
import { loadSession } from '../api/session';

/**
 * What a purchase pays for. Tickets and the Tide's revives fit this hook's shape (a backend-built
 * transaction, one signature, a confirm poll); the Shop's items are the first kind wired to it.
 */
export type PurchaseKind = 'ticket' | 'item' | 'revive';

export type PurchasePhase = 'idle' | 'building' | 'signing' | 'confirming' | 'done' | 'error';

/** A backend-built transaction; `createsPlayer` when it opens with `create_player` (the wallet also pays that account's rent). */
export type PreparedPurchase = PreparedTx & {
  createsPlayer?: boolean;
  /**
   * What this transaction actually moves, when the backend can build it at a different price than
   * what was quoted before `prepare()` ran (the Tide's price can fall a step in between). When
   * present and different from the order's amount, the signing sheet is corrected to it before the
   * wallet opens, so it never shows a stale price.
   */
  priceSkr?: number;
};

export interface PurchasePayload<R extends { confirmed: boolean }> {
  /** What is being paid for, shown under "Waiting for signature": an item name, "Revive · the Tide". */
  what: string;
  /** The SKR the transaction transfers, for the signing sheet's amount row. */
  amountSkr: number;
  /** Asks the backend for the transaction. Called again once if the wallet reports an expired blockhash. */
  prepare: () => Promise<PreparedPurchase>;
  /** One confirmation poll: `{ confirmed: false }` while the transaction is not visible yet. */
  confirm: (signature: string) => Promise<R>;
}

export interface PurchaseOrder {
  kind: PurchaseKind;
  what: string;
  amountSkr: number;
}

export type PurchaseError =
  /** The wallet cannot pay the network fee (plus the player account's rent on a first purchase): sheet 13. */
  | { code: 'no_sol'; requiredLamports: number; haveLamports: number }
  /** The backend's 409 `not_enough_skr`. */
  | { code: 'no_skr'; needSkr: number; haveSkr: number }
  /** Anything else; `apiCode` is the backend's error code when there is one (e.g. `already_owned`). */
  | { code: 'failed'; message: string; apiCode?: string };

export type PurchaseOutcome<R> =
  | { status: 'done'; result: R }
  | { status: 'declined' }
  | { status: 'error'; error: PurchaseError }
  /** Nothing to report: another purchase was already running, or the caller went away mid-flight. */
  | { status: 'abandoned' };

/** The toast every host shows when the wallet declines (handoff "Wallet & error states"), with the warning dot. */
export const DECLINED_TOAST = 'Signature declined — nothing changed';

interface PurchaseState {
  phase: PurchasePhase;
  order: PurchaseOrder | null;
  error: PurchaseError | null;
  /** SOL the transaction takes from the wallet: the network fee, plus the player account's rent when it is created. Null until known. */
  costLamports: number | null;
}

const IDLE: PurchaseState = { phase: 'idle', order: null, error: null, costLamports: null };

/** `8 + Player::INIT_SPACE` of the program's `Player` account (`programs/programs/sea_invaders/src/state.rs`), created by `create_player`. */
const PLAYER_ACCOUNT_BYTES = 141;
/** Solana's base fee per signature, used when the RPC cannot price the message (e.g. its blockhash is already gone). */
const LAMPORTS_PER_SIGNATURE = 5000;
/**
 * How a fee payer without enough SOL surfaces from the wallet or the RPC when the pre-check could not
 * catch it: `InsufficientFundsForFee` / `...ForRent`, the system program's "insufficient lamports"
 * (the player account's rent), or `AccountNotFound` for a wallet with no SOL at all. The SPL token
 * program's own "insufficient funds" (short on SKR) deliberately does not match.
 */
const INSUFFICIENT_SOL = /insufficient ?funds ?for ?(fee|rent)|insufficient lamports|no record of a prior credit/i;
/** Reads the SOL side at `confirmed`: fresher than the default `finalized`, and it knows the backend's just-fetched blockhash. */
const COMMITMENT = 'confirmed';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** `order` with its `amountSkr` corrected to `prepared`'s own price, when it declares one that differs. */
function withPreparedAmount(order: PurchaseOrder, prepared: PreparedPurchase): PurchaseOrder {
  return typeof prepared.priceSkr === 'number' && prepared.priceSkr !== order.amountSkr
    ? { ...order, amountSkr: prepared.priceSkr }
    : order;
}

/** Lamports `prepared` costs its fee payer: the network fee for its message, plus rent for the player account it creates. */
async function solCost(connection: Connection, prepared: PreparedPurchase): Promise<number> {
  const message = VersionedTransaction.deserialize(toUint8Array(prepared.transaction)).message;
  const [fee, rent] = await Promise.all([
    connection.getFeeForMessage(message, COMMITMENT).then((r) => r.value ?? message.header.numRequiredSignatures * LAMPORTS_PER_SIGNATURE),
    prepared.createsPlayer ? connection.getMinimumBalanceForRentExemption(PLAYER_ACCOUNT_BYTES) : Promise.resolve(0),
  ]);
  return fee + rent;
}

/**
 * One on-chain purchase at a time: `start(kind, payload)` fetches the transaction from the backend,
 * checks the wallet can pay the SOL fee, has the wallet sign and send it through MWA (one fresh
 * prepare-and-retry on an expired blockhash), then polls `confirm` every 2 s for up to 60 s.
 * `phase`/`order`/`error`/`costLamports` drive `PurchaseSheets`; `start` also resolves the outcome
 * so the host can toast and refresh. A decline returns to `idle` (the host shows `DECLINED_TOAST`);
 * a `no_sol`/`no_skr` error stays up as a sheet until `reset()`.
 */
export function usePurchase() {
  const { connection } = useMobileWallet();
  const signAndSend = useSignAndSend();
  const [state, setState] = useState<PurchaseState>(IDLE);

  // The host can unmount mid-flight (system Back while the wallet is open). `alive` guards every
  // state update and stops the confirmation poll; `busy` refuses a second start while one runs.
  const alive = useRef(true);
  const busy = useRef(false);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const update = useCallback((next: PurchaseState) => {
    if (alive.current) setState(next);
  }, []);

  const start = useCallback(
    async <R extends { confirmed: boolean }>(kind: PurchaseKind, payload: PurchasePayload<R>): Promise<PurchaseOutcome<R>> => {
      if (busy.current) return { status: 'abandoned' };
      busy.current = true;
      let order: PurchaseOrder = { kind, what: payload.what, amountSkr: payload.amountSkr };
      let cost: number | null = null;
      let have: number | null = null;
      const fail = (error: PurchaseError): PurchaseOutcome<R> => {
        update({ phase: 'error', order, error, costLamports: cost });
        return { status: 'error', error };
      };

      update({ phase: 'building', order, error: null, costLamports: null });
      try {
        let prepared = await payload.prepare();
        order = withPreparedAmount(order, prepared);

        // Check the SOL side before the wallet opens, so a short wallet gets sheet 13 instead of a
        // wallet-side failure. An RPC hiccup here skips the check: the wallet still refuses an
        // unfunded transaction, and that error is mapped to the same sheet below.
        try {
          const session = await loadSession();
          if (session !== null) {
            [cost, have] = await Promise.all([
              solCost(connection, prepared),
              connection.getBalance(new PublicKey(session.walletAddress), COMMITMENT),
            ]);
          }
        } catch {
          cost = null;
          have = null;
        }
        if (cost !== null && have !== null && have < cost) return fail({ code: 'no_sol', requiredLamports: cost, haveLamports: have });

        update({ phase: 'signing', order, error: null, costLamports: cost });
        let signature: string;
        try {
          signature = await signAndSend(prepared);
        } catch (error) {
          if (!(error instanceof BlockhashExpired)) throw error;
          prepared = await payload.prepare();
          order = withPreparedAmount(order, prepared);
          signature = await signAndSend(prepared);
        }

        update({ phase: 'confirming', order, error: null, costLamports: cost });
        const result = await pollUntilConfirmed(() => payload.confirm(signature), { isCancelled: () => !alive.current });
        update({ phase: 'done', order, error: null, costLamports: cost });
        return { status: 'done', result };
      } catch (error) {
        if (error instanceof WalletDeclined) {
          update(IDLE);
          return { status: 'declined' };
        }
        if (error instanceof PollCancelled) return { status: 'abandoned' };
        if (error instanceof ApiError && error.code === 'not_enough_skr') {
          return fail({ code: 'no_skr', needSkr: numberOr(error.details?.needSkr, payload.amountSkr), haveSkr: numberOr(error.details?.haveSkr, 0) });
        }
        if (cost !== null && have !== null && INSUFFICIENT_SOL.test(messageOf(error))) {
          return fail({ code: 'no_sol', requiredLamports: cost, haveLamports: have });
        }
        // Release builds have no debugger: keep the stack in logcat so a device failure is diagnosable.
        console.error('[purchase] failed', kind, error instanceof Error ? (error.stack ?? error.message) : error);
        return fail({ code: 'failed', message: messageOf(error), apiCode: error instanceof ApiError ? error.code : undefined });
      } finally {
        busy.current = false;
      }
    },
    [connection, signAndSend, update],
  );

  /** Back to `idle`: closes a `no_sol`/`no_skr` sheet, or clears a finished purchase. */
  const reset = useCallback(() => update(IDLE), [update]);

  return { ...state, start, reset };
}

export type Purchase = ReturnType<typeof usePurchase>;
