import { REPLAY_MODE, encodeReplay, formatInt } from '@sea-invaders/core';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, View } from 'react-native';
import { ApiError } from '../api/client';
import { finishRun, startRun, type FinishedRun, type StartedRun } from '../api/daily';
import { GameScreen, type RunOutcome } from '../game/GameScreen';
import { ResultView } from '../game/ResultView';
import { Backdrop } from '../ui/Backdrop';
import { PillButton } from '../ui/PillButton';
import { Sheet } from '../ui/Sheet';
import { Txt } from '../ui/Txt';
import { COLORS } from '../ui/tokens';

type Phase =
  | { kind: 'starting' }
  | { kind: 'playing'; run: StartedRun }
  | { kind: 'uploading'; run: StartedRun; outcome: RunOutcome }
  | { kind: 'verified'; run: StartedRun; outcome: RunOutcome; result: FinishedRun }
  | { kind: 'error'; message: string; canRetry: boolean; retryUpload?: { run: StartedRun; outcome: RunOutcome } };

function describe(error: unknown): { message: string; canRetry: boolean } {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'no_attempts':
        return { message: 'No ranked attempts left today. Come back after midnight UTC.', canRetry: false };
      case 'update_required':
        return { message: 'This version of the game is out of date. Please update.', canRetry: false };
      case 'not_signed_in':
        return { message: 'Sign in with your wallet to play the daily run.', canRetry: false };
      case 'network':
        return { message: error.message, canRetry: true };
      default:
        return { message: error.message, canRetry: error.status >= 500 };
    }
  }
  return { message: 'Something went wrong.', canRetry: true };
}

/** Ranked run: seed from the server, replay back to the server, score shown only once verified. */
export function DailyRunScreen({ onExit }: { onExit: () => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'starting' });

  const begin = useCallback(() => {
    setPhase({ kind: 'starting' });
    startRun()
      .then((run) => setPhase({ kind: 'playing', run }))
      .catch((e) => setPhase({ kind: 'error', ...describe(e) }));
  }, []);

  const retry = useCallback(() => {
    setPhase((p) => (p.kind === 'error' && p.retryUpload ? { kind: 'uploading', ...p.retryUpload } : p));
  }, []);

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
          {phase.canRetry && <PillButton label="Try again" onPress={phase.retryUpload ? retry : begin} />}
          <PillButton label="Home" kind="secondary" onPress={onExit} />
        </Sheet>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.app },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 12 },
});
