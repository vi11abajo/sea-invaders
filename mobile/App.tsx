import { MobileWalletProvider } from '@wallet-ui/react-native-web3js';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { BackHandler, Linking, View } from 'react-native';
import { APP_IDENTITY, CHAIN, RPC_URL } from './src/api/config';
import { useSession } from './src/api/useSession';
import { DailyRunScreen } from './src/daily/DailyRunScreen';
import { GameScreen } from './src/game/GameScreen';
import { HomeScreen } from './src/home/HomeScreen';
import { useHomeModel } from './src/home/useHomeModel';
import { SelfTestScreen } from './src/selftest/SelfTestScreen';
import { Txt } from './src/ui/Txt';
import { useAppFonts } from './src/ui/fonts';
import { UiGallery } from './src/ui/gallery/UiGallery';
import { COLORS } from './src/ui/tokens';

type Route = 'app' | 'selftest' | 'ui';
type Screen = 'home' | 'practice' | 'daily' | 'leaderboard';

/** seainvaders://selftest opens the self-test, seainvaders://ui the design gallery; anything else opens the app. */
function routeFor(url: string | null): Route {
  if (url === null) return 'app';
  if (url.startsWith('seainvaders://selftest')) return 'selftest';
  if (url.startsWith('seainvaders://ui')) return 'ui';
  return 'app';
}

function Placeholder({ name, onBack }: { name: string; onBack: () => void }) {
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.app, alignItems: 'center', justifyContent: 'center' }}>
      <Txt variant="headline">{name}</Txt>
      <Txt variant="secondary" tone="tertiary">Coming in the next task · back returns home</Txt>
    </View>
  );
}

/** Everything that needs the wallet provider and the session. */
function Shell() {
  const [screen, setScreen] = useState<Screen>('home');
  const { session, signIn, error } = useSession();
  const { model, refresh } = useHomeModel(session);
  const home = () => {
    setScreen('home');
    refresh();
  };

  switch (screen) {
    case 'practice':
      return <GameScreen onExit={home} />;
    case 'daily':
      return <DailyRunScreen onExit={home} />;
    case 'leaderboard':
      return <Placeholder name="Leaderboard" onBack={home} />;
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
