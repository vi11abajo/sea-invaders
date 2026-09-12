import { formatInt } from '@sea-invaders/core';
import { StyleSheet, View } from 'react-native';
import { PillButton } from '../ui/PillButton';
import { Txt } from '../ui/Txt';
import { useRecordScore } from './useRecordScore';

interface RecordScoreProps {
  day: number;
  score: number;
  isDayBest: boolean;
  /** True when the on-chain best for this weekday already covers `score` — nothing to record. */
  alreadyRecorded: boolean;
  /** Called once the record transaction is confirmed, or turns out to already be recorded. */
  onRecorded: (signature: string) => void;
  /** 'primary' for the result screen's call to action; 'glass' for the Home hint (spells out the score). */
  kind?: 'primary' | 'glass';
}

/**
 * "Record score" flow: signs and sends the server-prepared `submit_daily_best` transaction for
 * `day`, then polls the backend for confirmation. Renders nothing once there is nothing left to
 * record — not a day best, already covered on chain, or just recorded this session.
 */
export function RecordScore({ day, score, isDayBest, alreadyRecorded, onRecorded, kind = 'primary' }: RecordScoreProps) {
  const { phase, record } = useRecordScore(onRecorded);

  if (!isDayBest || alreadyRecorded || phase.kind === 'done') return null;

  const busy = phase.kind === 'signing' || phase.kind === 'confirming';
  const idleLabel = kind === 'primary' ? 'Record score — network fee only' : `Record today's best — ${formatInt(score)}`;
  const label =
    phase.kind === 'signing' ? 'Signing…' : phase.kind === 'confirming' ? 'Confirming…' : phase.kind === 'error' ? 'Try again' : idleLabel;
  const hint = phase.kind === 'idle' ? phase.message : phase.kind === 'error' ? phase.message : undefined;

  return (
    <View style={styles.root}>
      <PillButton kind={kind} label={label} onPress={() => record(day)} disabled={busy} />
      {hint !== undefined && (
        <Txt variant="secondary" tone="tertiary" style={styles.hint}>
          {hint}
        </Txt>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 6 },
  hint: { textAlign: 'center' },
});
