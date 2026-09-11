import { formatInt, shortAddress } from '@sea-invaders/core';
import { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, FlatList, StyleSheet, View } from 'react-native';
import { getLeaderboard, type LeaderboardEntry } from '../api/daily';
import { loadSession } from '../api/session';
import { Backdrop } from '../ui/Backdrop';
import { Glass } from '../ui/Glass';
import { PillButton } from '../ui/PillButton';
import { Txt } from '../ui/Txt';
import { COLORS, RADIUS } from '../ui/tokens';

export function LeaderboardScreen({ onBack }: { onBack: () => void }) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [day, setDay] = useState<number | null>(null);
  const [mine, setMine] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadSession().then((s) => alive && setMine(s?.walletAddress ?? null));
    getLeaderboard()
      .then((board) => {
        if (!alive) return;
        setDay(board.day);
        setEntries(board.entries);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  return (
    <View style={styles.root}>
      <Backdrop variant="menu" />
      <View style={styles.head}>
        <Txt variant="screenTitle">Today's leaderboard</Txt>
        <Txt variant="secondary" tone="tertiary">{day === null ? ' ' : `Seed #${day} · verified runs`}</Txt>
      </View>
      {error !== null ? (
        <Txt variant="body" tone="warning" style={styles.center}>{error}</Txt>
      ) : entries === null ? (
        <ActivityIndicator color={COLORS.text} />
      ) : entries.length === 0 ? (
        <Txt variant="body" tone="secondary" style={styles.center}>No verified runs yet today. Be the first.</Txt>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => String(e.rank)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Glass radius={RADIUS.row} style={[styles.row, item.walletAddress === mine && styles.mine]}>
              <Txt variant="mono" tone="secondary" style={styles.rank}>{String(item.rank)}</Txt>
              <View style={styles.who}>
                <Txt variant="body">{item.username}</Txt>
                <Txt variant="monoSmall" tone="tertiary">{shortAddress(item.walletAddress)}</Txt>
              </View>
              <Txt variant="mono">{formatInt(item.score)}</Txt>
            </Glass>
          )}
        />
      )}
      <View style={styles.footer}>
        <PillButton label="Home" kind="secondary" onPress={onBack} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.app, paddingTop: 72, paddingHorizontal: 20, paddingBottom: 32 },
  head: { gap: 4, marginBottom: 20 },
  list: { gap: 8, paddingBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 56 },
  mine: { borderColor: COLORS.success },
  rank: { width: 28, textAlign: 'right' },
  who: { flex: 1, gap: 2 },
  center: { textAlign: 'center', marginTop: 40 },
  footer: { marginTop: 12 },
});
