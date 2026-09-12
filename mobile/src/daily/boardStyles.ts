import { StyleSheet } from 'react-native';
import { COLORS } from '../ui/tokens';

/** Shared row layout for the Today and Week leaderboard lists. */
export const ROW_MIN_HEIGHT = 56;

export const boardStyles = StyleSheet.create({
  list: { gap: 8, paddingBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: ROW_MIN_HEIGHT },
  mine: { borderColor: COLORS.success },
  rank: { width: 28, textAlign: 'right' },
  who: { flex: 1, gap: 2 },
  center: { textAlign: 'center', marginTop: 40 },
});
