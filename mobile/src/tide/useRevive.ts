import type { Connection } from '@solana/web3.js';
import { useMobileWallet } from '@wallet-ui/react-native-web3js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PollCancelled } from '../api/chain';
import { ApiError } from '../api/client';
import { requestFaucet } from '../api/daily';
import { confirmRevive, issueRevive, quoteRevive, type ReviveQuote } from '../api/revive';
import { COLORS } from '../ui/tokens';
import { DECLINED_TOAST, usePurchase } from '../wallet/usePurchase';

/** After this long without a verdict, the pending sheet offers Retry / End level (handoff 12). */
export const PENDING_LONG_MS = 60_000;
/** How often a sent revive is checked while it is pending. */
const CHECK_MS = 2_000;
/**
 * Blocks past a transaction's last valid height before an unseen one counts as dead: a public RPC
 * endpoint balances across nodes, so the node answering the status may trail the one that answered
 * the height; about 13 s of slack covers that.
 */
const EXPIRY_MARGIN_BLOCKS = 32;
/** What the signing sheet says is being paid for (handoff "Wallet & error states"). */
const WHAT = 'Revive · the Tide';
/** A sent revive that can no longer land: the wallet paid no SKR for it. */
const NOT_LANDED_TOAST = 'Revive did not go through — no SKR was taken';

export type TideQuote =
  | { status: 'signed_out' }
  | { status: 'loading' }
  | { status: 'ready'; quote: ReviveQuote; /** `Date.now()` when it arrived; `nextStep.inSeconds` counts from here. */ at: number }
  | { status: 'error'; message: string };

export type TideStage =
  /** The price card: Revive or End level. */
  | { kind: 'offer' }
  /** A revive transaction was sent and is being confirmed; `since` starts the pending clock. */
  | { kind: 'pending'; since: number };

/** What a sent revive turned into, as far as can be told right now. */
type Verdict = 'confirmed' | 'dead' | 'unknown';

/** The sent transaction can no longer land (failed on chain, or its blockhash expired unseen). */
class ReviveNotLanded extends Error {
  constructor() {
    super(NOT_LANDED_TOAST);
    this.name = 'ReviveNotLanded';
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The stored session is gone or was refused: the player has to connect again. */
function isSignedOut(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403 || error.code === 'not_signed_in');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * One look at a sent revive. `confirmed` once the backend has verified it on chain. `dead` once it
 * provably never will be: it failed on chain (a failed transaction moves no SKR), or the chain is
 * well past its blockhash's last valid height and neither the backend nor the RPC has any record of
 * it. Anything else (not visible yet, a network error) is `unknown`. The height is read before the
 * status, so a transaction that landed in the last valid block is always seen.
 */
async function verdictOf(connection: Connection, signature: string, lastValidBlockHeight: number | null): Promise<Verdict> {
  try {
    const height = lastValidBlockHeight === null ? null : await connection.getBlockHeight('confirmed');
    const result = await confirmRevive(signature);
    if (result.confirmed) return 'confirmed';
    if (height === null || lastValidBlockHeight === null || height <= lastValidBlockHeight + EXPIRY_MARGIN_BLOCKS) return 'unknown';
    const { value } = await connection.getSignatureStatus(signature, { searchTransactionHistory: true });
    return value === null || value.err !== null ? 'dead' : 'unknown';
  } catch (error) {
    if (error instanceof ApiError && (error.code === 'revive_failed' || error.code === 'invalid_transaction')) return 'dead';
    return 'unknown';
  }
}

interface UseReviveOptions {
  signedIn: boolean;
  /** True while a wallet sign-in is in flight; the quote loads once it ends signed in. */
  connecting: boolean;
  /** Called at most once, after the chain confirmed a revive for this loss. */
  onRevived: () => void;
  /** Shows a toast over the sheet. */
  toast: (text: string, dot?: string) => void;
}

/**
 * The Tide for one loss: the live quote, and paying for a revive through `usePurchase` (signing
 * sheet, not-enough-SOL/SKR sheets, declined toast). Once the wallet has sent the transaction the
 * stage is `pending`, and that one transaction is watched until it is confirmed — then `onRevived`
 * runs, once — or provably can no longer land. Retry never signs a second transaction while the
 * first could still land, so nothing is charged twice; unmounting the sheet (End level) stops the
 * watch, and a confirmation that arrives later changes nothing.
 */
export function useRevive({ signedIn, connecting, onRevived, toast }: UseReviveOptions) {
  const { connection } = useMobileWallet();
  const purchase = usePurchase();
  const { start, reset } = purchase;
  const [quote, setQuote] = useState<TideQuote>(signedIn ? { status: 'loading' } : { status: 'signed_out' });
  const [stage, setStage] = useState<TideStage>({ kind: 'offer' });
  const [now, setNow] = useState(() => Date.now());
  const [faucetBusy, setFaucetBusy] = useState(false);

  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  /** Set when the revive was handed to the host: nothing more is paid or applied for this loss. */
  const applied = useRef(false);
  /** True while a purchase runs: from building the transaction until it is confirmed or cannot land. */
  const inFlight = useRef(false);
  /** Retry was pressed while the sent transaction could still land: pay again once it provably cannot. */
  const retryQueued = useRef(false);
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const onRevivedRef = useRef(onRevived);
  onRevivedRef.current = onRevived;
  const toastRef = useRef(toast);
  toastRef.current = toast;

  // One clock for the pending seconds and the "Drops to … in" countdown.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  /** Fetches the quote; `quiet` keeps a quote already on screen until the new one arrives. Resolves null on failure. */
  const loadQuote = useCallback(async (quiet = false): Promise<ReviveQuote | null> => {
    if (!quiet) setQuote({ status: 'loading' });
    try {
      const next = await quoteRevive();
      if (alive.current) setQuote({ status: 'ready', quote: next, at: Date.now() });
      return next;
    } catch (error) {
      if (alive.current) setQuote(isSignedOut(error) ? { status: 'signed_out' } : { status: 'error', message: messageOf(error) });
      return null;
    }
  }, []);

  // Signed out there is no quote; it loads on open, and again once a sign-in from the sheet ends.
  useEffect(() => {
    if (!signedIn) setQuote({ status: 'signed_out' });
    else if (!connecting) void loadQuote();
  }, [signedIn, connecting, loadQuote]);

  // The price falls a step when the countdown runs out: fetch the new one.
  const dropAt = quote.status === 'ready' && quote.quote.nextStep !== null ? quote.at + quote.quote.nextStep.inSeconds * 1000 : null;
  const dropped = dropAt !== null && now >= dropAt;
  useEffect(() => {
    if (dropped) void loadQuote(true);
  }, [dropped, loadQuote]);

  /** Watches one sent transaction (usePurchase's confirm step) until it is confirmed or cannot land. */
  const settle = useCallback(
    async (signature: string, lastValidBlockHeight: number | null): Promise<{ confirmed: boolean }> => {
      for (;;) {
        if (!alive.current || applied.current) throw new PollCancelled();
        const verdict = await verdictOf(connection, signature, lastValidBlockHeight);
        if (!alive.current || applied.current) throw new PollCancelled();
        if (verdict === 'confirmed') return { confirmed: true };
        if (verdict === 'dead') throw new ReviveNotLanded();
        await sleep(CHECK_MS);
      }
    },
    [connection],
  );

  // `pay` and `payAgain` call each other (a queued Retry pays again when the sent one cannot land).
  const payAgainRef = useRef<() => Promise<void>>(async () => undefined);

  /** Pays for one revive at `amountSkr` (the price on screen; the transaction carries the chain's price). */
  const pay = useCallback(
    async (amountSkr: number) => {
      if (applied.current || inFlight.current) return;
      inFlight.current = true;
      retryQueued.current = false;
      // The wallet's sheets replace the offer while they are up; a decline or a short wallet returns to it.
      setStage({ kind: 'offer' });
      let lastValid: number | null = null;
      let sent: string | null = null;
      const outcome = await start('revive', {
        what: WHAT,
        amountSkr,
        prepare: async () => {
          const prepared = await issueRevive();
          lastValid = prepared.lastValidBlockHeight;
          return prepared;
        },
        confirm: (signature) => {
          if (sent !== signature) {
            sent = signature;
            setStage({ kind: 'pending', since: Date.now() });
          }
          return settle(signature, lastValid);
        },
      });
      inFlight.current = false;
      if (!alive.current || applied.current) return;
      switch (outcome.status) {
        case 'done':
          applied.current = true;
          reset();
          onRevivedRef.current();
          return;
        case 'declined':
          toastRef.current(DECLINED_TOAST, COLORS.warning);
          return;
        case 'abandoned':
          return;
        case 'error': {
          // Not enough SOL / SKR stay up as their sheets until closed, then the offer is back.
          if (outcome.error.code !== 'failed') return;
          reset();
          if (sent === null) {
            // Nothing reached the chain (the backend refused, or the wallet failed before sending).
            setStage({ kind: 'offer' });
            toastRef.current(outcome.error.message, COLORS.warning);
            void loadQuote(true);
            return;
          }
          // The sent transaction can no longer land.
          if (retryQueued.current) {
            void payAgainRef.current();
            return;
          }
          const current = stageRef.current;
          // Retry / End level are already up: they stay, and Retry now builds a new transaction at once.
          if (current.kind === 'pending' && Date.now() - current.since >= PENDING_LONG_MS) return;
          setStage({ kind: 'offer' });
          toastRef.current(NOT_LANDED_TOAST, COLORS.warning);
          void loadQuote(true);
          return;
        }
      }
    },
    [start, reset, settle, loadQuote],
  );

  /** A new transaction after the last one provably did not land: the quote is fetched again first. */
  const payAgain = useCallback(async () => {
    retryQueued.current = false;
    if (inFlight.current) return;
    const fresh = await loadQuote(true);
    if (!alive.current || applied.current) return;
    if (fresh === null) {
      // The quote's error (or the Connect prompt) shows on the offer.
      setStage({ kind: 'offer' });
      return;
    }
    await pay(fresh.priceSkr);
  }, [loadQuote, pay]);
  payAgainRef.current = payAgain;

  /** The offer's primary: pays the quoted price. */
  const revive = useCallback(() => {
    if (quote.status !== 'ready' || stageRef.current.kind !== 'offer') return;
    void pay(quote.quote.priceSkr);
  }, [quote, pay]);

  /**
   * Retry (after `PENDING_LONG_MS`): a new transaction at once when the sent one can no longer land;
   * otherwise the pending clock restarts and the new transaction follows as soon as the sent one
   * provably cannot land — or, if it lands after all, the revive applies and nothing new is signed.
   */
  const retry = useCallback(() => {
    if (stageRef.current.kind !== 'pending') return;
    if (!inFlight.current) {
      void payAgain();
      return;
    }
    retryQueued.current = true;
    setStage({ kind: 'pending', since: Date.now() });
  }, [payAgain]);

  /** Devnet: the not-enough-SKR sheet's faucet, then the quote again. */
  const faucet = useCallback(async () => {
    setFaucetBusy(true);
    try {
      const { amountSkr } = await requestFaucet();
      if (!alive.current) return;
      reset();
      toastRef.current(`+${amountSkr} SKR from the faucet`);
      void loadQuote(true);
    } catch (error) {
      if (alive.current) toastRef.current(messageOf(error), COLORS.warning);
    } finally {
      if (alive.current) setFaucetBusy(false);
    }
  }, [reset, loadQuote]);

  return {
    quote, stage, now, purchase, faucetBusy,
    revive, retry, faucet, reloadQuote: () => void loadQuote(),
  };
}

export type Tide = ReturnType<typeof useRevive>;
