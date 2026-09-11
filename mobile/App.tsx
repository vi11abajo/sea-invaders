import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { GameScreen } from './src/game/GameScreen';
import { SelfTestScreen } from './src/selftest/SelfTestScreen';

type Route = 'game' | 'selftest';

/** seainvaders://selftest opens the determinism self-test; anything else opens the game. */
function routeFor(url: string | null): Route {
  return url !== null && url.startsWith('seainvaders://selftest') ? 'selftest' : 'game';
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
      {route === 'selftest' ? <SelfTestScreen /> : <GameScreen />}
    </>
  );
}
