import { REPLAY_MODE, encodeReplay, formatInt } from '@sea-invaders/core';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, View } from 'react-native';
import { ApiError } from '../api/client';
import type { Cluster } from '../api/config';
import { finishRun, startRun, type FinishedRun, type StartedRun } from '../api/daily';
import { GameScreen, type RunOutcome } from '../game/GameScreen';
import { ResultView } from '../game/ResultView';
import { Backdrop } from '../ui/Backdrop';
import { PillButton } from '../ui/PillButton';
import { Sheet } from '../ui/Sheet';
import { Toast } from '../ui/Toast';
import { Txt } from '../ui/Txt';
import { COLORS } from '../ui/tokens';
import { RecordScore } from './RecordScore';
import { TicketCard } from './TicketCard';

type Phase =
  | { kind: 'starting' }
  | { kind: 'playing'; run: StartedRun }
  | { kind: 'uploading'; run: StartedRun; outcome: RunOutcome }
  | { kind: 'verified'; run: StartedRun; outcome: RunOutcome; result: FinishedRun }
  | { kind: 'error'; message: string; canRetry: boolean; code?: string; retryUpload?: { run: StartedRun; outcome: RunOutcome } };

function describe(error: unknown): { message: string; canRetry: boolean; code?: string } {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'no_attempts':
        return { message: 'No ranked attempts left today. Come back after midnight UTC.', canRetry: false, code: 'no_attempts' };
      case 'update_required':
        return { message: 'This version of the game is out of date. Please update.', canRetry: false, code: error.code };
      case 'not_signed_in':
        return { message: 'Sign in with your wallet to play the daily run.', canRetry: false, code: error.code };
      case 'network':
        return { message: error.message, canRetry: true, code: error.code };
      default:
        return { message: error.message, canRetry: error.status >= 500, code: error.code };
    }
  }
  return { message: 'Something went wrong.', canRetry: true };
}

interface DailyRunScreenProps {
  onExit: () => void;
  /** Null while the ticket price / balance / cluster is not known yet. */
  ticket: { priceSkr: number; skrBalance: number; cluster: Cluster } | null;
  /** Buys a ranked ticket on-chain; resolves false when declined or failed. */
  onBuyTicket: () => Promise<boolean>;
  /** Devnet only: mints test SKR to the wallet. */
  onFaucet: () => Promise<void>;
  ticketBusy?: boolean;
  /** A message from the app to show as a toast (a ticket/faucet result). */
  alert?: string | null;
  /** The on-chain best recorded for today's weekday; decides whether "Record score" shows. */
  recordedBest: number;
  /** Called once a record transaction is confirmed (or found already recorded), to refresh Home. */
  onRecorded: () => void;
}

/** Ranked run: seed from the server, replay back to the server, score shown only once verified. */
export function DailyRunScreen({ onExit, ticket, onBuyTicket, onFaucet, ticketBusy = false, alert = null, recordedBest, onRecorded }: DailyRunScreenProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'starting' });
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);

  useEffect(() => {
    if (alert !== null) setToast((t) => ({ id: (t?.id ?? 0) + 1, text: alert }));
  }, [alert]);

  const begin = useCallback(() => {
    setPhase({ kind: 'starting' });
    startRun()
      .then((run) => setPhase({ kind: 'playing', run }))
      .catch((e) => setPhase({ kind: 'error', ...describe(e) }));
  }, []);

  const retry = useCallback(() => {
    setPhase((p) => (p.kind === 'error' && p.retryUpload ? { kind: 'uploading', ...p.retryUpload } : p));
  }, []);

  // Buying a ticket only helps if it succeeds; a decline or failure leaves this same prompt on screen.
  const buyThenRetry = useCallback(async () => {
    const bought = await onBuyTicket();
    if (bought) begin();
  }, [onBuyTicket, begin]);

  useEffect(() => {
    begin();
  }, [begin]);

  useEffect(() => {
    if (phase.kind !== 'uploading') return;
    const { run, outcome } = phase;
    let alive = true;
    finishRun(run.runId, encodeReplay(outcome.replay))
      .then((result) => alive && setPhase({ kind: 'verified', run, outcome, result }))
      .catch((e) => alive && setPhase({ kind: 'error', ...describe(e), retryUpload: { run, outcome } }));
    return () => {
      alive = false;
    };
  }, [phase]);

  // System back leaves the waiting and error states; GameScreen handles it while playing.
  const inGame = phase.kind === 'playing' || phase.kind === 'uploading' || phase.kind === 'verified';
  useEffect(() => {
    if (inGame) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onExit();
      return true;
    });
    return () => sub.remove();
  }, [inGame, onExit]);

  if (phase.kind === 'playing' || phase.kind === 'uploading' || phase.kind === 'verified') {
    const { run } = phase;
    return (
      <GameScreen
        onExit={onExit}
        seed={run.seed}
        mode={REPLAY_MODE.daily}
        hudMode={`DAILY · SEED #${run.day}`}
        onRunOver={(outcome) => setPhase({ kind: 'uploading', run, outcome })}
        renderResult={() => {
          if (phase.kind === 'verified') {
            const { result } = phase;
            return (
              <ResultView
                title="Verified"
                score={result.score}
                stats={[
                  { label: 'Day best', value: formatInt(result.dayBest) },
                  { label: 'Attempts left', value: String(run.attemptsLeft) },
                ]}
                note={result.isDayBest ? 'New day best · ranked' : 'Ranked · below your day best'}
                onPlayAgain={run.attemptsLeft > 0 ? begin : onExit}
                onBack={onExit}
                extra={
                  <RecordScore
                    day={result.day}
                    score={result.score}
                    isDayBest={result.isDayBest}
                    alreadyRecorded={recordedBest >= result.score}
                    onRecorded={onRecorded}
                  />
                }
              />
            );
          }
          return (
            <View style={styles.overlay}>
              <ActivityIndicator color={COLORS.text} />
              <Txt variant="secondary" tone="secondary">Verifying your run…</Txt>
            </View>
          );
        }}
      />
    );
  }

  return (
    <View style={styles.root}>
      <Backdrop variant="menu" />
      {phase.kind === 'starting' ? (
        <View style={styles.overlay}>
          <ActivityIndicator color={COLORS.text} />
          <Txt variant="secondary" tone="secondary">Getting today's seed…</Txt>
        </View>
      ) : (
        <Sheet kind="modal">
          <Txt variant="headline">Daily run</Txt>
          {phase.retryUpload && (
            <Txt variant="body" tone="secondary">Your run is saved on this phone. Retry the upload to get it verified.</Txt>
          )}
          <Txt variant="body" tone="secondary">{phase.message}</Txt>
          {phase.code === 'no_attempts' && ticket ? (
            <TicketCard
              priceSkr={ticket.priceSkr}
              skrBalance={ticket.skrBalance}
              cluster={ticket.cluster}
              onBuy={() => void buyThenRetry()}
              onFaucet={() => void onFaucet()}
              busy={ticketBusy}
            />
          ) : (
            phase.canRetry && <PillButton label="Try again" onPress={phase.retryUpload ? retry : begin} />
          )}
          <PillButton label="Home" kind="secondary" onPress={onExit} />
        </Sheet>
      )}
      {toast !== null && <Toast key={toast.id} text={toast.text} onHide={() => setToast(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.app },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 12 },
});
