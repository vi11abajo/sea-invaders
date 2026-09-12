import { formatInt, shortAddress } from '@sea-invaders/core';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import type { WeekBoard as WeekBoardData } from '../api/daily';
import { Glass } from '../ui/Glass';
import { Txt } from '../ui/Txt';
import { COLORS, RADIUS } from '../ui/tokens';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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
    return <Txt variant="body" tone="warning" style={styles.center}>{error}</Txt>;
  }
  if (data === null) {
    return <ActivityIndicator color={COLORS.text} style={styles.center} />;
  }
  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <Txt variant="body" tone="secondary">{`${formatInt(data.poolSkr)} SKR in the pool`}</Txt>
        <Txt variant="secondary" tone="tertiary">{data.settled ? 'Settled' : 'Paid after Mon 00:00 UTC'}</Txt>
      </View>
      {data.entries.length === 0 ? (
        <Txt variant="body" tone="secondary" style={styles.center}>No records this week yet.</Txt>
      ) : (
        <FlatList
          data={data.entries}
          keyExtractor={(e) => String(e.rank)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Glass radius={RADIUS.row} style={[styles.row, item.walletAddress === mine && styles.mine]}>
              <Txt variant="mono" tone="secondary" style={styles.rank}>{String(item.rank)}</Txt>
              <View style={styles.who}>
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
  list: { gap: 8, paddingBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 56 },
  mine: { borderColor: COLORS.success },
  rank: { width: 20, textAlign: 'right' },
  who: { flex: 1, gap: 2 },
  totals: { alignItems: 'flex-end', gap: 2 },
  center: { textAlign: 'center', marginTop: 40 },
});
