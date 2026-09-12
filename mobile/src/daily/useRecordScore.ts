import { useCallback, useState } from 'react';
import { pollUntilConfirmed, sendWithBlockhashRetry, useSignAndSend, PollTimeout, WalletDeclined } from '../api/chain';
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

  const record = useCallback(
    (day: number) => {
      setPhase({ kind: 'signing' });
      void (async () => {
        let signature: string;
        try {
          ({ signature } = await sendWithBlockhashRetry(() => requestRecord(day), signAndSend));
        } catch (error) {
          if (error instanceof WalletDeclined) {
            setPhase({ kind: 'idle', message: 'Not recorded' });
            return;
          }
          if (error instanceof ApiError && error.code === 'already_recorded') {
            setPhase({ kind: 'done' });
            onRecorded('');
            return;
          }
          setPhase({ kind: 'error', ...describeRecordError(error) });
          return;
        }
        setPhase({ kind: 'confirming' });
        try {
          await pollUntilConfirmed(() => confirmRecord(signature, day));
          setPhase({ kind: 'done' });
          onRecorded(signature);
        } catch (error) {
          setPhase({ kind: 'error', ...describeRecordError(error) });
        }
      })();
    },
    [signAndSend, onRecorded],
  );

  return { phase, record };
}
