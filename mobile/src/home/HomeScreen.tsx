import { formatCountdown, formatInt } from '@sea-invaders/core';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Backdrop } from '../ui/Backdrop';
import { PillButton } from '../ui/PillButton';
import { Toast } from '../ui/Toast';
import { COLORS } from '../ui/tokens';
import { ConnectSheet } from '../wallet/WalletSheets';
import { DailyRunCard, DailyRunRulesSheet } from './DailyRunCard';
import { ReefScene } from './ReefScene';
import { FeatureRow, HomeTopBar, type Feature } from './HomeTopBar';
import { Ticker, type TickerItem } from './Ticker';
import type { HomeModel, RankedInfo } from './model';

const FEATURE_NAMES: Record<Feature, string> = { campaign: 'Campaign', shop: 'Shop', ranks: 'Leaderboard', profile: 'Profile' };

/** Fractional SKR (the pool balance) renders with one decimal; `formatInt` is for whole scores. */
function formatSkr(value: number): string {
  return value.toFixed(1);
}

interface HomeScreenProps {
  model: HomeModel;
  onPractice: () => void;
  onDaily: () => void;
  onCampaign: () => void;
  onLeaderboard: () => void;
  /** Opens the Shop. Only called with a wallet: signed out, the Shop entry points open the Connect sheet instead. */
  onShop: () => void;
  /** Connect wallet when signed out; profile when signed in (still "coming soon"). */
  onWallet: () => void;
  /** Buys a ranked ticket on-chain; resolves false when declined or failed. */
  onBuyTicket: () => Promise<boolean>;
  /** Devnet only: mints test SKR to the wallet. */
  onFaucet: () => Promise<void>;
  ticketBusy?: boolean;
  /** A message from the app to show as a toast (e.g. a sign-in error, or a ticket/faucet result). */
  alert?: string | null;
  /** Called once a record transaction is confirmed, so ranked data (and the hint) refreshes. */
  onRecorded?: () => void;
  /** A failed "today" fetch's message, passed straight to the Daily Run card's signed-in/null state. */
  dailyError?: string | null;
}

/** Home, the "Reef": Octopi in the idle world, the Daily Run card and the ways into the game. */
export function HomeScreen({ model, onPractice, onDaily, onCampaign, onLeaderboard, onShop, onWallet, onBuyTicket, onFaucet, ticketBusy = false, alert = null, onRecorded = () => {}, dailyError = null }: HomeScreenProps) {
  const ranked = model.ranked;
  const now = useNow(ranked !== null);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const closeConnect = useCallback(() => setConnectOpen(false), []);
  const soon = (what: string) => setToast((t) => ({ id: (t?.id ?? 0) + 1, text: `${what} — coming soon` }));
  // The Shop's catalogue and purchases need a wallet: signed out, its entry points ask to connect first.
  const openShop = () => (model.wallet ? onShop() : setConnectOpen(true));

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
          <HomeTopBar wallet={model.wallet} onWallet={model.wallet ? () => soon('Profile') : onWallet} onShop={openShop} />
          <FeatureRow
            campaignBadge={campaign?.level ?? null}
            onPress={(f) => (f === 'campaign' ? onCampaign() : f === 'ranks' ? onLeaderboard() : f === 'shop' ? openShop() : soon(FEATURE_NAMES[f]))}
          />
        </View>
        {ticker.length > 0 && (
          <View style={styles.ticker}>
            <Ticker items={ticker} />
          </View>
        )}
        <ReefScene caption="Octopi · base defender" onOctopi={openShop} />
        <View style={[styles.inset, styles.bottom]}>
          <DailyRunCard
            ranked={ranked}
            now={now}
            signedIn={model.wallet !== null}
            onConnect={onWallet}
            error={dailyError}
            onPlay={onDaily}
            onBuyTicket={() => void onBuyTicket()}
            onFaucet={() => void onFaucet()}
            onRecorded={onRecorded}
            skrBalance={model.wallet?.skr ?? 0}
            busy={ticketBusy}
            onRules={() => setRulesOpen(true)}
          />
          <View style={styles.row}>
            <View style={styles.half}>
              <PillButton
                kind="glass"
                label={campaign ? `Campaign · ${campaign.level}/${campaign.total}` : 'Campaign'}
                onPress={onCampaign}
                fitLabel
              />
            </View>
            <View style={styles.half}>
              <PillButton kind="glass" label="Practice" onPress={onPractice} />
            </View>
          </View>
        </View>
      </View>
      <DailyRunRulesSheet visible={rulesOpen} onClose={() => setRulesOpen(false)} />
      <ConnectSheet
        visible={connectOpen}
        onContinue={() => {
          setConnectOpen(false);
          onWallet();
        }}
        onClose={closeConnect}
      />
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
  if (r.poolSkr > 0) items.push({ text: 'Weekly pool ', highlight: `${formatSkr(r.poolSkr)} SKR` });
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
