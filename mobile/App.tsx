import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { GameScreen } from './src/game/GameScreen';
import { SelfTestScreen } from './src/selftest/SelfTestScreen';
import { UiGallery } from './src/ui/gallery/UiGallery';

type Route = 'game' | 'selftest' | 'ui';

/** seainvaders://selftest opens the self-test, seainvaders://ui the design gallery; anything else opens the game. */
function routeFor(url: string | null): Route {
  if (url === null) return 'game';
  if (url.startsWith('seainvaders://selftest')) return 'selftest';
  if (url.startsWith('seainvaders://ui')) return 'ui';
  return 'game';
}

export default function App() {
  const [route, setRoute] = useState<Route>('game');

  useEffect(() => {
    Linking.getInitialURL().then((url) => setRoute(routeFor(url)));
    const sub = Linking.addEventListener('url', ({ url }) => setRoute(routeFor(url)));
    return () => sub.remove();
  }, []);

  return (
    <>
      <StatusBar hidden />
      {route === 'selftest' ? <SelfTestScreen /> : route === 'ui' ? <UiGallery /> : <GameScreen />}
    </>
  );
}
