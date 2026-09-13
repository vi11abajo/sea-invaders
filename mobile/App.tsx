import { MobileWalletProvider } from '@wallet-ui/react-native-web3js';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { WalletDeclined, pollUntilConfirmed, sendWithBlockhashRetry, useSignAndSend } from './src/api/chain';
import { APP_IDENTITY, CHAIN, RPC_URL } from './src/api/config';
import { confirmTicket, requestFaucet, requestTicket } from './src/api/daily';
import { useSession } from './src/api/useSession';
import { CampaignLevelScreen } from './src/campaign/CampaignLevelScreen';
import { CampaignScreen } from './src/campaign/CampaignScreen';
import { useCampaignSync } from './src/campaign/sync';
import { useCampaign } from './src/campaign/useCampaign';
import { DailyRunScreen } from './src/daily/DailyRunScreen';
import { LeaderboardScreen } from './src/daily/LeaderboardScreen';
import { GameScreen } from './src/game/GameScreen';
import { HomeScreen } from './src/home/HomeScreen';
import { useHomeModel } from './src/home/useHomeModel';
import { SelfTestScreen } from './src/selftest/SelfTestScreen';
import { Backdrop } from './src/ui/Backdrop';
import { useAppFonts } from './src/ui/fonts';
import { UiGallery } from './src/ui/gallery/UiGallery';

type Route = 'app' | 'selftest' | 'ui' | { kind: 'level'; id: number };
type Screen = 'home' | 'practice' | 'daily' | 'leaderboard' | 'campaign' | { kind: 'level'; id: number; practice: boolean };

/**
 * seainvaders://selftest opens the self-test, seainvaders://ui the design gallery,
 * seainvaders://level/<id> opens that campaign level directly (QA entry point for boss levels);
 * anything else opens the app.
 */
function routeFor(url: string | null): Route {
  if (url === null) return 'app';
  if (url.startsWith('seainvaders://selftest')) return 'selftest';
  if (url.startsWith('seainvaders://ui')) return 'ui';
  const level = /^seainvaders:\/\/level\/(\d+)/.exec(url);
  if (level) {
    const id = Number(level[1]);
    if (Number.isInteger(id) && id >= 1 && id <= 30) return { kind: 'level', id };
  }
  return 'app';
}

/** Everything that needs the wallet provider and the session. */
function Shell({ initialLevelId = null }: { initialLevelId?: number | null }) {
  // The deep link is a QA tool: it always opens in practice mode so it can never mutate real
  // progress (a non-current level would also make finishLevel reject — see CampaignLevelScreen).
  const [screen, setScreen] = useState<Screen>(initialLevelId !== null ? { kind: 'level', id: initialLevelId, practice: true } : 'home');
  // Bumped on every level (re-)entry so the level screen's key changes even when `id`/`practice`
  // do not (e.g. "Retry level"), forcing a fresh mount instead of reusing the finished run's state.
  const [levelAttempt, setLevelAttempt] = useState(0);
  const { session, restoring, signIn, error } = useSession();
  const campaign = useCampaign();
  const { synced } = useCampaignSync(session, campaign.progress, campaign.replaceProgress);
  const { model, refresh, error: homeError } = useHomeModel(session, campaign.progress);
  const signAndSend = useSignAndSend();
  const [ticketBusy, setTicketBusy] = useState(false);
  const [ticketMessage, setTicketMessage] = useState<string | null>(null);
  const home = () => {
    setScreen('home');
    refresh();
  };

  // Screens show `ticketMessage` as a one-shot toast (an effect keyed on the prop value, so a
  // repeated identical string or a remount would otherwise replay it). Clearing it back to null
  // right after this render commits means every new message is a real null -> text transition —
  // the screen's effect always fires exactly once per message, and re-entering a screen later
  // sees null rather than replaying whatever was last shown.
  useEffect(() => {
    if (ticketMessage === null) return;
    setTicketMessage(null);
  }, [ticketMessage]);

  // Buys a ranked ticket: prepare, sign and send (a stale blockhash gets one fresh
  // prepare-and-retry), then poll the backend until the tx is confirmed on-chain before
  // refreshing — the backend only clears its 5s player cache once it sees the confirmation, so
  // refreshing any earlier can still show the pre-purchase attempt count. A decline leaves the
  // caller on the same screen with no message (spec §8).
  const buyTicket = useCallback(async (): Promise<boolean> => {
    setTicketBusy(true);
    try {
      const { signature } = await sendWithBlockhashRetry(requestTicket, signAndSend);
      await pollUntilConfirmed(() => confirmTicket(signature));
      setTicketMessage('Ticket bought');
      refresh();
      return true;
    } catch (e) {
      if (!(e instanceof WalletDeclined)) setTicketMessage(e instanceof Error ? e.message : 'Purchase failed');
      return false;
    } finally {
      setTicketBusy(false);
    }
  }, [signAndSend, refresh]);

  const buyFaucet = useCallback(async () => {
    setTicketBusy(true);
    try {
      const { amountSkr } = await requestFaucet();
      setTicketMessage(`+${amountSkr} SKR from the faucet`);
      refresh();
    } catch (e) {
      setTicketMessage(e instanceof Error ? e.message : 'Faucet failed');
    } finally {
      setTicketBusy(false);
    }
  }, [refresh]);

  // Until the stored session is read, show the backdrop only, so a cold start does not flash
  // "Connect wallet" before it resolves. A sign-in in flight keeps Home on screen.
  if (restoring) return <Backdrop />;

  // The campaign screens need the loaded progress; a fresh install or the level deep link can
  // reach them before AsyncStorage resolves, so they briefly show the backdrop only.
  if (typeof screen === 'object') {
    if (campaign.progress === null) return <Backdrop />;
    return (
      <CampaignLevelScreen
        key={`${screen.id}-${screen.practice}-${levelAttempt}`}
        levelId={screen.id}
        practice={screen.practice}
        progress={campaign.progress}
        startLevel={campaign.startLevel}
        finishLevel={campaign.finishLevel}
        onNext={(id) => {
          setLevelAttempt((n) => n + 1);
          setScreen({ kind: 'level', id, practice: false });
        }}
        onDone={() => setScreen('campaign')}
        onExit={() => setScreen('campaign')}
      />
    );
  }

  switch (screen) {
    case 'practice':
      return <GameScreen onExit={home} />;
    case 'campaign':
      if (campaign.progress === null) return <Backdrop />;
      return (
        <CampaignScreen
          progress={campaign.progress}
          onPlay={(id, practice) => setScreen({ kind: 'level', id, practice })}
          onBack={home}
          synced={session === null || synced}
        />
      );
    case 'daily':
      return (
        <DailyRunScreen
          onExit={home}
          ticket={
            model.ranked && model.wallet
              ? { priceSkr: model.ranked.ticketPriceSkr, skrBalance: model.wallet.skr, cluster: model.ranked.cluster }
              : null
          }
          onBuyTicket={buyTicket}
          onFaucet={buyFaucet}
          ticketBusy={ticketBusy}
          alert={ticketMessage}
          recordedBest={model.ranked?.recordedBest ?? 0}
          onRecorded={refresh}
        />
      );
    case 'leaderboard':
      return <LeaderboardScreen onBack={home} />;
    default:
      return (
        <HomeScreen
          model={model}
          onPractice={() => setScreen('practice')}
          onDaily={() => setScreen('daily')}
          onCampaign={() => setScreen('campaign')}
          onLeaderboard={() => setScreen('leaderboard')}
          onWallet={() => void signIn()}
          onBuyTicket={buyTicket}
          onFaucet={buyFaucet}
          onRecorded={refresh}
          ticketBusy={ticketBusy}
          alert={ticketMessage ?? error}
          dailyError={homeError}
        />
      );
  }
}

export default function App() {
  const [route, setRoute] = useState<Route>('app');
  const fontsReady = useAppFonts();

  useEffect(() => {
    Linking.getInitialURL().then((url) => setRoute(routeFor(url)));
    const sub = Linking.addEventListener('url', ({ url }) => setRoute(routeFor(url)));
    return () => sub.remove();
  }, []);

  if (!fontsReady) return null;

  const initialLevelId = typeof route === 'object' ? route.id : null;

  return (
    <MobileWalletProvider chain={CHAIN} endpoint={RPC_URL} identity={APP_IDENTITY}>
      <StatusBar hidden />
      {route === 'selftest' ? <SelfTestScreen /> : route === 'ui' ? <UiGallery /> : <Shell initialLevelId={initialLevelId} />}
    </MobileWalletProvider>
  );
}
