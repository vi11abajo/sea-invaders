import { MobileWalletProvider } from '@wallet-ui/react-native-web3js';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { BlockhashExpired, WalletDeclined, useSignAndSend } from './src/api/chain';
import { APP_IDENTITY, CHAIN, RPC_URL } from './src/api/config';
import { requestFaucet, requestTicket } from './src/api/daily';
import { useSession } from './src/api/useSession';
import { DailyRunScreen } from './src/daily/DailyRunScreen';
import { LeaderboardScreen } from './src/daily/LeaderboardScreen';
import { GameScreen } from './src/game/GameScreen';
import { HomeScreen } from './src/home/HomeScreen';
import { useHomeModel } from './src/home/useHomeModel';
import { SelfTestScreen } from './src/selftest/SelfTestScreen';
import { Backdrop } from './src/ui/Backdrop';
import { useAppFonts } from './src/ui/fonts';
import { UiGallery } from './src/ui/gallery/UiGallery';

type Route = 'app' | 'selftest' | 'ui';
type Screen = 'home' | 'practice' | 'daily' | 'leaderboard';

/** seainvaders://selftest opens the self-test, seainvaders://ui the design gallery; anything else opens the app. */
function routeFor(url: string | null): Route {
  if (url === null) return 'app';
  if (url.startsWith('seainvaders://selftest')) return 'selftest';
  if (url.startsWith('seainvaders://ui')) return 'ui';
  return 'app';
}

/** Everything that needs the wallet provider and the session. */
function Shell() {
  const [screen, setScreen] = useState<Screen>('home');
  const { session, restoring, signIn, error } = useSession();
  const { model, refresh } = useHomeModel(session);
  const signAndSend = useSignAndSend();
  const [ticketBusy, setTicketBusy] = useState(false);
  const [ticketMessage, setTicketMessage] = useState<string | null>(null);
  const home = () => {
    setScreen('home');
    refresh();
  };

  // Buys a ranked ticket: prepare, sign and send; a stale blockhash gets one fresh prepare-and-retry.
  // A decline leaves the caller on the same screen with no message (spec §8).
  const buyTicket = useCallback(async (): Promise<boolean> => {
    setTicketBusy(true);
    try {
      let prepared = await requestTicket();
      try {
        await signAndSend(prepared);
      } catch (e) {
        if (!(e instanceof BlockhashExpired)) throw e;
        prepared = await requestTicket();
        await signAndSend(prepared);
      }
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

  switch (screen) {
    case 'practice':
      return <GameScreen onExit={home} />;
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
          onLeaderboard={() => setScreen('leaderboard')}
          onWallet={() => void signIn()}
          onBuyTicket={buyTicket}
          onFaucet={buyFaucet}
          ticketBusy={ticketBusy}
          alert={ticketMessage ?? error}
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

  return (
    <MobileWalletProvider chain={CHAIN} endpoint={RPC_URL} identity={APP_IDENTITY}>
      <StatusBar hidden />
      {route === 'selftest' ? <SelfTestScreen /> : route === 'ui' ? <UiGallery /> : <Shell />}
    </MobileWalletProvider>
  );
}
