import { GeistMono_500Medium } from '@expo-google-fonts/geist-mono/500Medium';
import { formatCountdown, formatInt } from '@sea-invaders/core';
import { useEffect, type ReactNode } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { RecordScore } from '../daily/RecordScore';
import { TicketCard } from '../daily/TicketCard';
import { CountUp } from '../ui/CountUp';
import { PillButton } from '../ui/PillButton';
import { Sheet } from '../ui/Sheet';
import { ShinyText } from '../ui/ShinyText';
import { SkrIcon } from '../ui/SkrIcon';
import { Txt } from '../ui/Txt';
import { COLORS, RADIUS, SIZE } from '../ui/tokens';
import type { RankedInfo } from './model';

/** The Daily Run rules, in the order they appear in the rules sheet. */
const RULES: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: 'One seed a day.',
    body: 'Every UTC day has one seed, the same for every player. The countdown shows when the next seed arrives.',
  },
  {
    title: 'Tickets.',
    body:
      'A ticket costs 10 SKR and gives 3 attempts for the current day. Buy as many as you like; 95 % of every ticket goes to the week\'s prize pool, 5 % to the treasury.',
  },
  {
    title: 'Verified runs.',
    body: 'Your inputs are recorded as a replay and re-verified on the server before a score counts.',
  },
  {
    title: 'On-chain record.',
    body: 'Your best score of the day is written to your on-chain player account with a server co-signature.',
  },
  {
    title: 'Weekly pool.',
    body:
      'Weeks run Monday to Monday (UTC). Your weekly score is the sum of your daily bests; the top 10 are paid from the pool, and empty places roll into the next week.',
  },
  {
    title: 'Lives and boosts.',
    body: 'Three lives, boosts enabled, the same rules for everyone.',
  },
  {
    title: 'Practice.',
    body: 'Practice uses a random seed, needs no wallet and is never ranked.',
  },
];

/** Fractional SKR (the pool balance) renders with one decimal; `formatInt` is for whole scores. */
function formatSkr(value: number): string {
  return value.toFixed(1);
}

interface DailyRunCardProps {
  /** Null while ranked play is not live: no session, or today's fetch failed (see `error`). */
  ranked: RankedInfo | null;
  now: number;
  /** True once a wallet session exists; picks which `ranked === null` message the card shows. */
  signedIn: boolean;
  /** Opens the same sign-in flow as the top-left "Connect wallet" pill. */
  onConnect: () => void;
  /** A failed "today" fetch's message while signed in; null while it is still loading or has succeeded. */
  error?: string | null;
  onPlay: () => void;
  /** Buys a ranked ticket on-chain; resolves false when declined or failed — `TicketCard` drives its
   * tear-off animation from this outcome. */
  onBuyTicket: () => Promise<boolean>;
  onFaucet: () => void;
  /** Called once a record transaction is confirmed, so `recordedBest` refreshes and the hint clears. */
  onRecorded: () => void;
  skrBalance: number;
  busy?: boolean;
  /** Opens the Daily Run rules sheet. */
  onRules: () => void;
}

/** The Daily Run card on Home: attempts left, time to the next seed, today / week / pool, and the main action. */
export function DailyRunCard({ ranked, now, signedIn, onConnect, error = null, onPlay, onBuyTicket, onFaucet, onRecorded, skrBalance, busy = false, onRules }: DailyRunCardProps) {
  if (ranked === null) {
    if (!signedIn) {
      return (
        <View style={styles.card}>
          <CardHead onRules={onRules}>
            <Txt variant="headline" style={styles.headline}>Connect a wallet to play</Txt>
          </CardHead>
          <Txt variant="body" tone="secondary">Same seed for everyone, three attempts a day.</Txt>
          <PillButton label="Connect wallet" onPress={onConnect} />
        </View>
      );
    }
    return (
      <View style={styles.card}>
        <CardHead onRules={onRules}>
          <Txt variant="headline" style={styles.headline}>Loading today's run</Txt>
        </CardHead>
        {error !== null && <Txt variant="body" tone="secondary">{error}</Txt>}
        <PillButton label="Play Daily Run" disabled />
      </View>
    );
  }

  const left = ranked.attemptsLeft;
  // Attempts are counted within the current ticket: with 5 left of two tickets the card says
  // "2 of 3", and the tickets bought today sit in a meta line under the headline, so every
  // player reads "N of 3".
  const per = ranked.attemptsPerTicket;
  const inTicket = left > 0 ? ((left - 1) % per) + 1 : 0;
  const tickets = ranked.ticketsToday;
  return (
    <View style={styles.card}>
      <CardHead
        onRules={onRules}
        right={
          <View style={styles.seed}>
            <Txt variant="secondary" tone="tertiary" style={styles.small}>New seed</Txt>
            <Txt variant="mono" style={styles.countdown}>{formatCountdown((ranked.newSeedAt - now) / 1000)}</Txt>
          </View>
        }
      >
        <Txt variant="headline" style={styles.headline}>{left > 0 ? `${inTicket} of ${per} attempts` : 'No attempts left'}</Txt>
        <Txt variant="secondary" tone="secondary" style={styles.meta}>
          {`Seed #${ranked.seed}${tickets > 0 ? ` · ${tickets} ${tickets === 1 ? 'ticket' : 'tickets'} today` : ''}`}
        </Txt>
      </CardHead>
      <View style={styles.stats}>
        <Stat label="Today" value={formatInt(ranked.todayBest)} />
        <Stat label={ranked.weekRank === null ? 'Week' : `Week · #${ranked.weekRank}`} value={formatInt(ranked.weekTotal)} />
        <View style={styles.stat}>
          <Txt variant="secondary" tone="tertiary" style={styles.small}>Pool</Txt>
          <View style={styles.pool}>
            <SkrIcon size={11} color={COLORS.info} />
            {/* Count Up fix round 2: throttled mode bridges to React at most once every 80 ms (and
                once more, unconditionally, on the exact final value) instead of `ShinyText`'s own
                Skia `Canvas` re-measuring on every animation frame — see `CountUp.tsx`'s doc for the
                exact cadence. `ShinyText` itself memoises its glyph measurement by string, so those
                ~10 throttled updates cost ~10 measurements, not sixty. */}
            <CountUp value={ranked.poolSkr} duration={800} mode="throttled" format={formatSkr}>
              {(text) => <ShinyText text={text} fontSource={GeistMono_500Medium} size={13} color={COLORS.info} />}
            </CountUp>
          </View>
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

/**
 * The card's header: the "Daily Run" label and info button on one row, an optional right-aligned
 * block (the "New seed" countdown) on the same row, then `children` (the headline, and for the
 * ranked state a meta line) stacked below. Shared by every card state.
 */
function CardHead({ onRules, right, children }: { onRules: () => void; right?: ReactNode; children: ReactNode }) {
  return (
    <View>
      <View style={styles.headRow}>
        <View style={styles.headLeft}>
          <Txt variant="label" tone="secondary">Daily Run</Txt>
          <InfoButton onPress={onRules} />
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

/** Small round "i" button — same look as the campaign level sheet's info button. */
function InfoButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Daily Run rules"
      hitSlop={(SIZE.minTap - 28) / 2}
      onPress={onPress}
      style={styles.infoButton}
    >
      <Txt variant="body" tone="secondary">i</Txt>
    </Pressable>
  );
}

interface DailyRunRulesSheetProps {
  visible: boolean;
  onClose: () => void;
}

/** The "Daily Run rules" bottom sheet, opened from the info button next to the card's label. */
export function DailyRunRulesSheet({ visible, onClose }: DailyRunRulesSheetProps) {
  useEffect(() => {
    if (!visible) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <Sheet kind="modal" onDismiss={onClose}>
      <Txt variant="headline">Daily Run rules</Txt>
      <ScrollView style={styles.rulesScroll} contentContainerStyle={styles.rulesList} showsVerticalScrollIndicator={false}>
        {RULES.map((rule) => (
          <View key={rule.title} style={styles.rule}>
            <Txt variant="button" style={styles.ruleTitle}>{rule.title}</Txt>
            <Txt variant="body" tone="secondary">{rule.body}</Txt>
          </View>
        ))}
      </ScrollView>
      <PillButton label="Got it" onPress={onClose} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  pool: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  card: {
    gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderRadius: RADIUS.card,
    backgroundColor: 'rgba(18,18,18,0.66)', borderWidth: 1, borderColor: COLORS.glassBorder,
  },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  headline: { marginTop: 3 },
  meta: { marginTop: 2 },
  seed: { alignItems: 'flex-end' },
  small: { fontSize: 11 },
  countdown: { fontSize: 14 },
  stats: { flexDirection: 'row', gap: 6 },
  stat: { flex: 1, gap: 2 },
  infoButton: {
    width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: COLORS.glassBorder,
  },
  rulesScroll: { flexShrink: 1, flexGrow: 0 },
  rulesList: { gap: 14, paddingBottom: 2 },
  rule: { gap: 3 },
  ruleTitle: { fontSize: 14 },
});
