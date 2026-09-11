import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { GameScreen } from './src/game/GameScreen';
import { HomeScreen } from './src/home/HomeScreen';
import { OFFLINE_HOME } from './src/home/model';
import { SelfTestScreen } from './src/selftest/SelfTestScreen';
import { useAppFonts } from './src/ui/fonts';
import { UiGallery } from './src/ui/gallery/UiGallery';

type Route = 'app' | 'selftest' | 'ui';
type Screen = 'home' | 'practice';

/** seainvaders://selftest opens the self-test, seainvaders://ui the design gallery; anything else opens the app. */
function routeFor(url: string | null): Route {
  if (url === null) return 'app';
  if (url.startsWith('seainvaders://selftest')) return 'selftest';
  if (url.startsWith('seainvaders://ui')) return 'ui';
  return 'app';
}

export default function App() {
  const [route, setRoute] = useState<Route>('app');
  const [screen, setScreen] = useState<Screen>('home');
  const fontsReady = useAppFonts();

  useEffect(() => {
    Linking.getInitialURL().then((url) => setRoute(routeFor(url)));
    const sub = Linking.addEventListener('url', ({ url }) => setRoute(routeFor(url)));
    return () => sub.remove();
  }, []);

  if (!fontsReady) return null;

  return (
    <>
      <StatusBar hidden />
      {route === 'selftest' ? (
        <SelfTestScreen />
      ) : route === 'ui' ? (
        <UiGallery />
      ) : screen === 'practice' ? (
        <GameScreen onExit={() => setScreen('home')} />
      ) : (
        <HomeScreen model={OFFLINE_HOME} onPractice={() => setScreen('practice')} />
      )}
    </>
  );
}
