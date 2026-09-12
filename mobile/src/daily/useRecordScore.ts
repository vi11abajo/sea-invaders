import { useCallback, useEffect, useRef, useState } from 'react';
import { pollUntilConfirmed, sendWithBlockhashRetry, useSignAndSend, PollCancelled, PollTimeout, WalletDeclined } from '../api/chain';
import { ApiError } from '../api/client';
import { confirmRecord, requestRecord } from '../api/daily';

export type RecordPhase =
  | { kind: 'idle'; message?: string }
  | { kind: 'signing' }
  | { kind: 'confirming' }
  | { kind: 'done' }
  | { kind: 'error'; message: string; retryable: boolean };

function describeRecordError(error: unknown): { message: string; retryable: boolean } {
  if (error instanceof PollTimeout) return { message: error.message, retryable: true };
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'no_verified_run':
        return { message: 'No verified run for this day.', retryable: false };
      case 'day_closed':
        return { message: "Today's window has closed.", retryable: false };
      case 'no_ticket':
        return { message: 'Buy a ticket for today first.', retryable: false };
      case 'no_player_account':
        return { message: 'Buy a ticket first to create your on-chain account.', retryable: false };
      case 'record_failed':
        return { message: 'The record transaction failed on chain.', retryable: true };
      case 'network':
        return { message: error.message, retryable: true };
      default:
        return { message: error.message, retryable: true };
    }
  }
  return { message: error instanceof Error ? error.message : 'Something went wrong.', retryable: true };
}

/**
 * Records a verified daily best on chain: requests the server-co-signed `submit_daily_best`
 * transaction, signs and sends it with the connected wallet (a stale blockhash gets one
 * fresh-prepare-and-retry, per `sendWithBlockhashRetry`), then polls the backend every 2s for up
 * to 60s until the transaction is confirmed. `already_recorded` — someone else's request, or a
 * stale caller-side check, already covered this score — resolves straight to `done`. Declining in
 * the wallet returns to `idle` with a "Not recorded" hint rather than an error (spec §8 Records).
 */
export function useRecordScore(onRecorded: (signature: string) => void): { phase: RecordPhase; record: (day: number) => void } {
  const [phase, setPhase] = useState<RecordPhase>({ kind: 'idle' });
  const signAndSend = useSignAndSend();

  // RecordScore lives in leaf components (the result screen, the Home card) that can unmount
  // mid-flight — e.g. the back arrow, or navigating Home away — while the up-to-60s confirmation
  // poll is still running. `alive` guards every `setPhase` so we never touch state of a component
  // that no longer exists; `isCancelled` (below) additionally stops `pollUntilConfirmed` from
  // scheduling further ticks once we're gone, so the timer chain doesn't outlive the component.
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const record = useCallback(
    (day: number) => {
      setPhase({ kind: 'signing' });
      void (async () => {
        let signature: string;
        try {
          ({ signature } = await sendWithBlockhashRetry(() => requestRecord(day), signAndSend));
        } catch (error) {
          if (error instanceof WalletDeclined) {
            if (alive.current) setPhase({ kind: 'idle', message: 'Not recorded' });
            return;
          }
          if (error instanceof ApiError && error.code === 'already_recorded') {
            if (alive.current) setPhase({ kind: 'done' });
            // The record is already on chain regardless of whether this component still exists —
            // still tell the caller so Home refreshes, but never touch this component's state above.
            onRecorded('');
            return;
          }
          if (alive.current) setPhase({ kind: 'error', ...describeRecordError(error) });
          return;
        }
        if (alive.current) setPhase({ kind: 'confirming' });
        try {
          await pollUntilConfirmed(() => confirmRecord(signature, day), { isCancelled: () => !alive.current });
          if (alive.current) setPhase({ kind: 'done' });
          // Same reasoning as the `already_recorded` branch above: the transaction did confirm, so
          // Home should still refresh even if nothing is listening to `phase` any more.
          onRecorded(signature);
        } catch (error) {
          // Cancelled means we unmounted before confirmation was observed — there is nothing
          // confirmed to report yet, so unlike the branches above, `onRecorded` does not fire here.
          if (error instanceof PollCancelled) return;
          if (alive.current) setPhase({ kind: 'error', ...describeRecordError(error) });
        }
      })();
    },
    [signAndSend, onRecorded],
  );

  return { phase, record };
}
