import { LAMPORTS_PER_SOL, PublicKey, VersionedTransaction, type Connection } from '@solana/web3.js';
import { useMobileWallet } from '@wallet-ui/react-native-web3js';
import { toUint8Array } from 'js-base64';
import { useCallback, useEffect, useRef, useState } from 'react';
import { awaitLanded, BlockhashExpired, PollCancelled, pollUntilConfirmed, transactionsOf, useSignAndSend, WalletDeclined, type PreparedPayment } from '../api/chain';
import { ApiError } from '../api/client';
import { loadSession } from '../api/session';

/**
 * What a purchase pays for. Tickets and the Tide's revives fit this hook's shape (a backend-built
 * transaction, one signature, a confirm poll); the Shop's items are the first kind wired to it.
 */
export type PurchaseKind = 'ticket' | 'item' | 'revive';

export type PurchasePhase = 'idle' | 'building' | 'signing' | 'confirming' | 'done' | 'error';

/** A backend-built payment; `createsPlayer` when it opens with `create_player` (the wallet also pays that account's rent). */
export type PreparedPurchase = PreparedPayment & {
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
  /**
   * True when this cluster offers the SOL -> SKR swap (`swap.available` from the Shop or the Tide
   * quote). The request then carries `swap: true` **whenever the cluster allows it**, not only when
   * the screen believes the balance is short — deliberate, and reviewed as such: the backend decides
   * by the balance it reads from the chain in the same request, so a balance that moved since the
   * screen last read it cannot strand the payment on a 409 the swap could have paid, and a wallet
   * that can pay in SKR never causes a Jupiter call. Do not "fix" this by gating on the local balance.
   */
  swapAvailable?: boolean;
  /** Asks the backend for the payment, offering the swap when `swap`. Called again once if the wallet reports an expired blockhash. */
  prepare: (swap: boolean) => Promise<PreparedPurchase>;
  /** One confirmation poll: `{ confirmed: false }` while the transaction is not visible yet. */
  confirm: (signature: string) => Promise<R>;
}

export interface PurchaseOrder {
  kind: PurchaseKind;
  what: string;
  amountSkr: number;
  /** The SKR an auto-swap buys for this payment — the part of the price the wallet could not cover. */
  swappedSkr?: number;
  /** The SOL that swap spends. The signing sheet names both, under the SKR price, never instead of it. */
  swapSol?: number;
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

/** The swap half of a split payment failed on chain or expired: the payment half was never signed. */
export const SWAP_NOT_LANDED_TOAST = 'The SOL swap did not go through — nothing was bought';
/** The swap half is still unconfirmed after the wait: it may yet land, so nothing more is signed now. */
export const SWAP_UNCONFIRMED_TOAST = 'The SOL swap is still confirming — nothing was bought; try again in a moment';
/** The swap landed but the payment that was to spend it did not: the SKR sits unspent in the wallet. */
export const SWAP_ORPHANED_TOAST = 'The SOL swap landed but the payment was not signed — your SKR is in the wallet, so try again without a swap';
/** A backend swap failure, as short copy: the raw Jupiter/HTTP detail belongs in the log, never in a toast. */
export const SWAP_FAILED_TOAST = 'The swap is not available right now — try again or pay in SKR';

/** Backend error codes that mean "the swap itself went wrong", all of which get `SWAP_FAILED_TOAST`. */
const SWAP_ERROR_CODES = new Set(['swap_quote_failed', 'swap_instructions_failed', 'swap_quote_invalid', 'swap_quote_short', 'swap_unavailable']);

/** The swap half of a split payment did not land, so the payment half was deliberately never signed. */
class SwapHalted extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SwapHalted';
  }
}

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

/** What the signing sheet appends to `what` when the payment swaps SOL for the missing SKR (handoff 11). */
const SWAP_NOTE = 'SOL → SKR auto-swap';

/**
 * `order` rebuilt from the base for `prepared`: its `amountSkr` corrected to `prepared`'s own price
 * when it declares one that differs, and - once the backend answered with an auto-swap - the
 * swap wording and the SOL that swap spends. Always derived from `base`, never from a previous
 * result, so a second `prepare()` (an expired blockhash) cannot stack the wording twice.
 */
function withPrepared(base: PurchaseOrder, prepared: PreparedPurchase): PurchaseOrder {
  const amountSkr = typeof prepared.priceSkr === 'number' ? prepared.priceSkr : base.amountSkr;
  if (prepared.swapped !== true) return amountSkr === base.amountSkr ? base : { ...base, amountSkr };
  return { ...base, amountSkr, what: `${base.what} · ${SWAP_NOTE}`, swappedSkr: prepared.swappedSkr, swapSol: prepared.inSol };
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Lamports the auto-swap itself takes from the wallet, on top of the fees; 0 when nothing is
 * swapped. The backend's `maxInLamports` is the number to use — the swap's slippage ceiling plus
 * the rent the temporary wrapped-SOL account holds — so the app never has to guess either margin.
 */
function swapLamportsOf(prepared: PreparedPurchase): number {
  if (prepared.swapped !== true) return 0;
  const max = finiteOrNull(prepared.maxInLamports);
  if (max !== null) return Math.ceil(max);
  // A backend that predates `maxInLamports`: the quoted input understates both margins, but it is a
  // real number from the quote rather than an invented one.
  const quoted = finiteOrNull(prepared.inSol);
  return quoted === null ? 0 : Math.ceil(quoted * LAMPORTS_PER_SOL);
}

/**
 * Lamports of fee `prepared` costs its fee payer: the network fee for every transaction it is made
 * of (a split swap payment is two), plus rent for the player account it creates. The SOL an
 * auto-swap spends is deliberately not counted here - this is what the sheet labels `fee ≈`.
 */
async function solCost(connection: Connection, prepared: PreparedPurchase): Promise<number> {
  const messages = transactionsOf(prepared).map((tx) => VersionedTransaction.deserialize(toUint8Array(tx)).message);
  const [fees, rent] = await Promise.all([
    Promise.all(messages.map((message) => connection
      .getFeeForMessage(message, COMMITMENT)
      .then((r) => r.value ?? message.header.numRequiredSignatures * LAMPORTS_PER_SIGNATURE))),
    prepared.createsPlayer ? connection.getMinimumBalanceForRentExemption(PLAYER_ACCOUNT_BYTES) : Promise.resolve(0),
  ]);
  return fees.reduce((total, fee) => total + fee, 0) + rent;
}

/**
 * One on-chain purchase at a time: `start(kind, payload)` fetches the payment from the backend,
 * checks the wallet can pay the SOL fee (plus the SOL an auto-swap spends), has the wallet sign and
 * send it through MWA - two signatures in order when a swap could not share one packet with the
 * payment, and one fresh prepare-and-retry on a blockhash that expired before anything was sent -
 * then polls `confirm` every 2 s for up to 60 s on our own instruction's signature.
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
      const base: PurchaseOrder = { kind, what: payload.what, amountSkr: payload.amountSkr };
      const offerSwap = payload.swapAvailable === true;
      let order: PurchaseOrder = base;
      let cost: number | null = null;
      let swapLamports = 0;
      let have: number | null = null;
      // Nothing may be re-sent once any half of a split payment has left the wallet: a blind retry
      // would run the swap a second time and spend the SOL twice.
      let sent = false;
      // Set once a split payment's swap half is confirmed on chain. From then on every failure means
      // the same thing - the SKR is in the wallet and nothing was bought - and must say so.
      let swapLanded = false;
      const fail = (error: PurchaseError): PurchaseOutcome<R> => {
        update({ phase: 'error', order, error, costLamports: cost });
        return { status: 'error', error };
      };
      /**
       * Signs and sends every transaction of `prepared` in order - a split swap payment is the swap
       * first, then the payment out of the SKR it delivered, each opening the wallet once. Resolves
       * with the LAST signature, which is always our own purchase/revive: the one `confirm` polls.
       *
       * Every transaction but the last is waited on until the chain confirms it, because the next
       * one spends what it delivers: the SKR account our `purchase`/`revive` pays from is created by
       * Jupiter's own setup instructions, in the swap half. Sending the payment against a swap that
       * has merely been submitted would fail on chain and burn its fee, so a swap that fails, expires
       * or stays unconfirmed stops here and the payment is never signed.
       */
      const send = async (prepared: PreparedPurchase): Promise<string> => {
        const parts = transactionsOf(prepared);
        let signature = '';
        for (let i = 0; i < parts.length; i += 1) {
          signature = await signAndSend({ ...prepared, transaction: parts[i]! });
          sent = true;
          if (i === parts.length - 1) break;
          update({ phase: 'confirming', order, error: null, costLamports: cost });
          const verdict = await awaitLanded(connection, signature, {
            lastValidBlockHeight: prepared.lastValidBlockHeight,
            isCancelled: () => !alive.current,
          });
          if (verdict !== 'landed') throw new SwapHalted(verdict === 'failed' ? SWAP_NOT_LANDED_TOAST : SWAP_UNCONFIRMED_TOAST);
          swapLanded = true;
          update({ phase: 'signing', order, error: null, costLamports: cost });
        }
        return signature;
      };

      update({ phase: 'building', order, error: null, costLamports: null });
      try {
        let prepared = await payload.prepare(offerSwap);
        order = withPrepared(base, prepared);
        swapLamports = swapLamportsOf(prepared);

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
        // An auto-swap spends SOL on top of the fees, so the wallet has to cover both.
        if (cost !== null && have !== null && have < cost + swapLamports) {
          return fail({ code: 'no_sol', requiredLamports: cost + swapLamports, haveLamports: have });
        }

        update({ phase: 'signing', order, error: null, costLamports: cost });
        let signature: string;
        try {
          signature = await send(prepared);
        } catch (error) {
          if (!(error instanceof BlockhashExpired) || sent) throw error;
          prepared = await payload.prepare(offerSwap);
          order = withPrepared(base, prepared);
          swapLamports = swapLamportsOf(prepared);
          signature = await send(prepared);
        }

        update({ phase: 'confirming', order, error: null, costLamports: cost });
        const result = await pollUntilConfirmed(() => payload.confirm(signature), { isCancelled: () => !alive.current });
        update({ phase: 'done', order, error: null, costLamports: cost });
        return { status: 'done', result };
      } catch (error) {
        // The swap half never landed, so the payment half was never signed: nothing was bought and
        // the wallet's SKR is untouched. Its own message says which of the two it was.
        if (error instanceof SwapHalted) return fail({ code: 'failed', message: error.message, apiCode: 'swap_halted' });
        if (error instanceof PollCancelled) return { status: 'abandoned' };
        // Past a landed swap every failure means the same thing, declines included: the SKR arrived
        // and nothing was bought with it. Never report that as "declined — nothing changed", and
        // always leave the host an error to act on, so it reloads the balance.
        if (swapLanded) {
          console.warn('[purchase] the swap landed but the payment did not', kind, messageOf(error));
          return fail({ code: 'failed', message: SWAP_ORPHANED_TOAST, apiCode: 'swap_orphaned' });
        }
        if (error instanceof WalletDeclined) {
          update(IDLE);
          return { status: 'declined' };
        }
        if (error instanceof ApiError && error.code === 'not_enough_skr') {
          return fail({ code: 'no_skr', needSkr: numberOr(error.details?.needSkr, payload.amountSkr), haveSkr: numberOr(error.details?.haveSkr, 0) });
        }
        // A swap the backend could not build. The Jupiter/HTTP detail is diagnostic, not user copy.
        if (error instanceof ApiError && error.code !== undefined && SWAP_ERROR_CODES.has(error.code)) {
          console.warn('[purchase] swap unavailable', kind, error.code, error.message);
          return fail({ code: 'failed', message: SWAP_FAILED_TOAST, apiCode: error.code });
        }
        if (cost !== null && have !== null && INSUFFICIENT_SOL.test(messageOf(error))) {
          return fail({ code: 'no_sol', requiredLamports: cost + swapLamports, haveLamports: have });
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
