import { formatCountdown, formatInt } from '@sea-invaders/core';
import { StyleSheet, View } from 'react-native';
import { RecordScore } from '../daily/RecordScore';
import { TicketCard } from '../daily/TicketCard';
import { GradientText } from '../ui/GradientText';
import { PillButton } from '../ui/PillButton';
import { Txt } from '../ui/Txt';
import { COLORS, RADIUS } from '../ui/tokens';
import type { RankedInfo } from './model';

/** Fractional SKR (the pool balance) renders with one decimal; `formatInt` is for whole scores. */
function formatSkr(value: number): string {
  return value.toFixed(1);
}

interface DailyRunCardProps {
  /** Null while ranked play is not live: the card explains it and the button stays disabled. */
  ranked: RankedInfo | null;
  now: number;
  onPlay: () => void;
  onBuyTicket: () => void;
  onFaucet: () => void;
  /** Called once a record transaction is confirmed, so `recordedBest` refreshes and the hint clears. */
  onRecorded: () => void;
  skrBalance: number;
  busy?: boolean;
}

/** The Daily Run card on Home: attempts left, time to the next seed, today / week / pool, and the main action. */
export function DailyRunCard({ ranked, now, onPlay, onBuyTicket, onFaucet, onRecorded, skrBalance, busy = false }: DailyRunCardProps) {
  if (ranked === null) {
    return (
      <View style={styles.card}>
        <View>
          <Txt variant="label" tone="secondary">Daily Run</Txt>
          <Txt variant="headline" style={styles.headline}>Coming next</Txt>
        </View>
        <Txt variant="body" tone="secondary">Same seed for everyone, three attempts a day. It needs wallet sign-in.</Txt>
        <PillButton label="Play Daily Run" disabled />
      </View>
    );
  }

  const left = ranked.attemptsLeft;
  // Attempts are counted within the current ticket: with 5 left of two tickets the card says
  // "2 of 3", and the tickets bought today sit in the label, so every player reads "N of 3".
  const per = ranked.attemptsPerTicket;
  const inTicket = left > 0 ? ((left - 1) % per) + 1 : 0;
  const tickets = ranked.ticketsToday;
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View>
          <Txt variant="label" tone="secondary">{`Daily Run · Seed #${ranked.seed}${tickets > 0 ? ` · ${tickets} ${tickets === 1 ? 'ticket' : 'tickets'} today` : ''}`}</Txt>
          <Txt variant="headline" style={styles.headline}>{left > 0 ? `${inTicket} of ${per} attempts` : 'No attempts left'}</Txt>
        </View>
        <View style={styles.seed}>
          <Txt variant="secondary" tone="tertiary" style={styles.small}>New seed</Txt>
          <Txt variant="mono" style={styles.countdown}>{formatCountdown((ranked.newSeedAt - now) / 1000)}</Txt>
        </View>
      </View>
      <View style={styles.stats}>
        <Stat label="Today" value={formatInt(ranked.todayBest)} />
        <Stat label={ranked.weekRank === null ? 'Week' : `Week · #${ranked.weekRank}`} value={formatInt(ranked.weekTotal)} />
        <View style={styles.stat}>
          <Txt variant="secondary" tone="tertiary" style={styles.small}>Pool</Txt>
          <GradientText text={`${formatSkr(ranked.poolSkr)} SKR`} size={13} />
        </View>
      </View>
      <RecordScore
        day={ranked.seed}
        score={ranked.todayBest}
        isDayBest
        alreadyRecorded={ranked.recordedBest >= ranked.todayBest}
        onRecorded={onRecorded}
        kind="glass"
      />
      {left > 0 ? (
        <PillButton label="Play Daily Run" onPress={onPlay} />
      ) : (
        <TicketCard
          priceSkr={ranked.ticketPriceSkr}
          skrBalance={skrBalance}
          cluster={ranked.cluster}
          onBuy={onBuyTicket}
          onFaucet={onFaucet}
          busy={busy}
        />
      )}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Txt variant="secondary" tone="tertiary" style={styles.small}>{label}</Txt>
      <Txt variant="mono">{value}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderRadius: RADIUS.card,
    backgroundColor: 'rgba(18,18,18,0.66)', borderWidth: 1, borderColor: COLORS.glassBorder,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headline: { marginTop: 3 },
  seed: { alignItems: 'flex-end' },
  small: { fontSize: 11 },
  countdown: { fontSize: 14 },
  stats: { flexDirection: 'row', gap: 6 },
  stat: { flex: 1, gap: 2 },
});
