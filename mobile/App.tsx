import { MobileWalletProvider } from '@wallet-ui/react-native-web3js';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { APP_IDENTITY, CHAIN, RPC_URL } from './src/api/config';
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
  const { session, loading, signIn, error } = useSession();
  const { model, refresh } = useHomeModel(session);
  const home = () => {
    setScreen('home');
    refresh();
  };

  // The session is loading (the stored one is being restored, or a sign-in is in flight): show the
  // backdrop only, so a cold start does not flash "Connect wallet" before it resolves.
  if (loading) return <Backdrop />;

  switch (screen) {
    case 'practice':
      return <GameScreen onExit={home} />;
    case 'daily':
      return <DailyRunScreen onExit={home} />;
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
          alert={error}
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
