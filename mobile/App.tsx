import { StatusBar } from 'expo-status-bar';
import { GameScreen } from './src/game/GameScreen';

export default function App() {
  return (
    <>
      <StatusBar hidden />
      <GameScreen />
    </>
  );
}
