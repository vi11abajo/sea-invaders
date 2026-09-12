import { formatInt, shortAddress } from '@sea-invaders/core';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import type { WeekBoard as WeekBoardData } from '../api/daily';
import { Glass } from '../ui/Glass';
import { Txt } from '../ui/Txt';
import { COLORS, RADIUS } from '../ui/tokens';
import { boardStyles } from './boardStyles';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Fractional SKR (pool balances, forecasts) renders with one decimal; `formatInt` is for whole scores. */
function formatSkr(value: number): string {
  return value.toFixed(1);
}

/** "Mon 12,400 · Tue — · Wed 9,800 …", `—` standing in for a day with no record. */
function dayLine(days: number[]): string {
  return days.map((total, i) => `${DAY_LABELS[i]} ${total === 0 ? '—' : formatInt(total)}`).join(' · ');
}

interface WeekBoardProps {
  data: WeekBoardData | null;
  error: string | null;
  mine: string | null;
}

/** The "Week" tab of the leaderboard: per-day totals and the payout forecast for the current week. */
export function WeekBoard({ data, error, mine }: WeekBoardProps) {
  if (error !== null) {
    return <Txt variant="body" tone="warning" style={boardStyles.center}>{error}</Txt>;
  }
  if (data === null) {
    return <ActivityIndicator color={COLORS.text} style={boardStyles.center} />;
  }
  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <Txt variant="body" tone="secondary">{`${formatSkr(data.poolSkr)} SKR in the pool`}</Txt>
        <Txt variant="secondary" tone="tertiary">{data.settled ? 'Settled' : 'Paid after Mon 00:00 UTC'}</Txt>
      </View>
      {data.entries.length === 0 ? (
        <Txt variant="body" tone="secondary" style={boardStyles.center}>No records this week yet.</Txt>
      ) : (
        <FlatList
          data={data.entries}
          keyExtractor={(e) => String(e.rank)}
          contentContainerStyle={boardStyles.list}
          renderItem={({ item }) => (
            <Glass radius={RADIUS.row} style={[boardStyles.row, item.walletAddress === mine && boardStyles.mine]}>
              <Txt variant="mono" tone="secondary" style={boardStyles.rank}>{String(item.rank)}</Txt>
              <View style={boardStyles.who}>
                <Txt variant="body">{item.username ?? shortAddress(item.walletAddress)}</Txt>
                <Txt variant="monoSmall" tone="tertiary">{dayLine(item.days)}</Txt>
              </View>
              <View style={styles.totals}>
                <Txt variant="mono">{formatInt(item.total)}</Txt>
                <Txt variant="monoSmall" tone="tertiary">{`≈ ${item.forecastSkr.toFixed(1)} SKR`}</Txt>
              </View>
            </Glass>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: { gap: 4, marginBottom: 16 },
  totals: { alignItems: 'flex-end', gap: 2 },
});
