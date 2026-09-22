import { formatInt, shortAddress } from '@sea-invaders/core';
import { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, FlatList, StyleSheet, View } from 'react-native';
import { getLeaderboard, getWeek, type LeaderboardEntry, type WeekBoard as WeekBoardData } from '../api/daily';
import { loadSession } from '../api/session';
import { OctopiAvatar } from '../game/OctopiArt';
import { Backdrop } from '../ui/Backdrop';
import { EntranceRow } from '../ui/EntranceRow';
import { Glass } from '../ui/Glass';
import { PillButton } from '../ui/PillButton';
import { RubberSegment } from '../ui/RubberSegment';
import { SeekerBadge } from '../ui/SeekerBadge';
import { Txt } from '../ui/Txt';
import { COLORS, RADIUS } from '../ui/tokens';
import { OCTOPI_SIZE, boardStyles } from './boardStyles';
import { WeekBoard } from './WeekBoard';

type Tab = 'today' | 'week';

const TABS: readonly [{ value: Tab; label: string }, { value: Tab; label: string }] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
];

export function LeaderboardScreen({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('today');
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [day, setDay] = useState<number | null>(null);
  const [week, setWeek] = useState<WeekBoardData | null>(null);
  const [mine, setMine] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [weekError, setWeekError] = useState<string | null>(null);

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
    if (tab !== 'week' || week !== null || weekError !== null) return;
    let alive = true;
    getWeek()
      .then((board) => alive && setWeek(board))
      .catch((e: Error) => alive && setWeekError(e.message));
    return () => {
      alive = false;
    };
  }, [tab, week, weekError]);

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
        <Txt variant="screenTitle">{tab === 'today' ? "Today's leaderboard" : 'Weekly leaderboard'}</Txt>
        <Txt variant="secondary" tone="tertiary">{tab === 'today' && day !== null ? `Seed #${day} · verified runs` : ' '}</Txt>
      </View>
      <View style={styles.tabs}>
        <RubberSegment items={TABS} value={tab} onChange={setTab} />
      </View>
      {tab === 'today' ? (
        error !== null ? (
          <Txt variant="body" tone="warning" style={boardStyles.center}>{error}</Txt>
        ) : entries === null ? (
          <ActivityIndicator color={COLORS.text} />
        ) : entries.length === 0 ? (
          <Txt variant="body" tone="secondary" style={boardStyles.center}>No verified runs yet today. Be the first.</Txt>
        ) : (
          <FlatList
            data={entries}
            keyExtractor={(e) => String(e.rank)}
            contentContainerStyle={boardStyles.list}
            renderItem={({ item, index }) => (
              <EntranceRow index={index}>
                <Glass radius={RADIUS.row} style={[boardStyles.row, item.walletAddress === mine && boardStyles.mine]}>
                  <Txt variant="mono" tone="secondary" style={boardStyles.rank}>{String(item.rank)}</Txt>
                  <OctopiAvatar skin={item.skin} size={OCTOPI_SIZE} />
                  <View style={boardStyles.who}>
                    <View style={boardStyles.nameRow}>
                      <Txt variant="body" numberOfLines={1} style={boardStyles.name}>{item.username}</Txt>
                      {item.seeker && <SeekerBadge />}
                    </View>
                    <Txt variant="monoSmall" tone="tertiary">{shortAddress(item.walletAddress)}</Txt>
                  </View>
                  <Txt variant="mono">{formatInt(item.score)}</Txt>
                </Glass>
              </EntranceRow>
            )}
          />
        )
      ) : (
        <WeekBoard data={week} error={weekError} mine={mine} />
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
  tabs: { marginBottom: 16 },
  footer: { marginTop: 12 },
});
