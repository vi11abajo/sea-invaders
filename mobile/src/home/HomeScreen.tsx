import { formatCountdown, formatInt } from '@sea-invaders/core';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Backdrop } from '../ui/Backdrop';
import { PillButton } from '../ui/PillButton';
import { Toast } from '../ui/Toast';
import { COLORS } from '../ui/tokens';
import { DailyRunCard } from './DailyRunCard';
import { HangarScene } from './HangarScene';
import { FeatureRow, HomeTopBar, type Feature } from './HomeTopBar';
import { Ticker, type TickerItem } from './Ticker';
import type { HomeModel, RankedInfo } from './model';

const FEATURE_NAMES: Record<Feature, string> = { campaign: 'Campaign', shop: 'Shop', ranks: 'Leaderboard', profile: 'Profile' };

interface HomeScreenProps {
  model: HomeModel;
  onPractice: () => void;
  onDaily: () => void;
  onLeaderboard: () => void;
  /** Connect wallet when signed out; profile when signed in (still "coming soon"). */
  onWallet: () => void;
  /** Buys a ranked ticket on-chain; resolves false when declined or failed. */
  onBuyTicket: () => Promise<boolean>;
  /** Devnet only: mints test SKR to the wallet. */
  onFaucet: () => Promise<void>;
  ticketBusy?: boolean;
  /** A message from the app to show as a toast (e.g. a sign-in error, or a ticket/faucet result). */
  alert?: string | null;
}

/** Home, the "Hangar": Octopi in the idle world, the Daily Run card and the ways into the game. */
export function HomeScreen({ model, onPractice, onDaily, onLeaderboard, onWallet, onBuyTicket, onFaucet, ticketBusy = false, alert = null }: HomeScreenProps) {
  const ranked = model.ranked;
  const now = useNow(ranked !== null);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const soon = (what: string) => setToast((t) => ({ id: (t?.id ?? 0) + 1, text: `${what} — coming soon` }));

  useEffect(() => {
    if (alert !== null) setToast((t) => ({ id: (t?.id ?? 0) + 1, text: alert }));
  }, [alert]);

  const ticker = ranked === null ? [] : tickerItems(ranked, now);
  const campaign = model.campaign;

  return (
    <View style={styles.root}>
      <Backdrop floorGlow />
      <View style={styles.column}>
        <View style={styles.inset}>
          <HomeTopBar wallet={model.wallet} onWallet={model.wallet ? () => soon('Profile') : onWallet} onShop={() => soon('Shop')} />
          <FeatureRow campaignBadge={campaign?.level ?? null} onPress={(f) => (f === 'ranks' ? onLeaderboard() : soon(FEATURE_NAMES[f]))} />
        </View>
        {ticker.length > 0 && (
          <View style={styles.ticker}>
            <Ticker items={ticker} />
          </View>
        )}
        <HangarScene caption="Octopi · base ship" onOctopi={() => soon('Shop')} />
        <View style={[styles.inset, styles.bottom]}>
          <DailyRunCard
            ranked={ranked}
            now={now}
            onPlay={onDaily}
            onBuyTicket={() => void onBuyTicket()}
            onFaucet={() => void onFaucet()}
            skrBalance={model.wallet?.skr ?? 0}
            busy={ticketBusy}
          />
          <View style={styles.row}>
            <View style={styles.half}>
              <PillButton
                kind="glass"
                label={campaign ? `Campaign · ${campaign.level}/${campaign.total}` : 'Campaign'}
                onPress={() => soon('Campaign')}
              />
            </View>
            <View style={styles.half}>
              <PillButton kind="glass" label="Practice" onPress={onPractice} />
            </View>
          </View>
        </View>
      </View>
      {toast !== null && <Toast key={toast.id} text={toast.text} onHide={() => setToast(null)} />}
    </View>
  );
}

/** Wall-clock time, refreshed every second while something on screen counts down. */
function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ticking]);
  return now;
}

function tickerItems(r: RankedInfo, now: number): TickerItem[] {
  const items: TickerItem[] = [];
  if (r.poolSkr > 0) items.push({ text: 'Weekly pool ', highlight: `${formatInt(r.poolSkr)} SKR` });
  items.push({ text: `Seed #${r.seed} · new in `, highlight: formatCountdown((r.newSeedAt - now) / 1000) });
  if (r.weekRank !== null) items.push({ text: "You're ", highlight: `#${r.weekRank}` });
  items.push({ text: 'Top 10 paid after ', highlight: 'Mon 00:00 UTC' });
  return items;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.app },
  column: { flex: 1, paddingTop: 28, paddingBottom: 28 },
  inset: { paddingHorizontal: 16, gap: 16 },
  ticker: { marginTop: 22 },
  bottom: { gap: 10 },
  row: { flexDirection: 'row', gap: 8 },
  half: { flex: 1 },
});
