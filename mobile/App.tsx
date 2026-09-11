import { Canvas, Circle, Fill, Rect } from '@shopify/react-native-skia';
import { FIELD_H, FIELD_W, fitField } from '@sea-invaders/core';
import { StatusBar } from 'expo-status-bar';
import { useWindowDimensions } from 'react-native';

export default function App() {
  const { width, height } = useWindowDimensions();
  const l = fitField(width, height);
  return (
    <>
      <StatusBar hidden />
      <Canvas style={{ flex: 1 }}>
        <Fill color="#000433" />
        <Rect x={l.offsetX} y={l.offsetY} width={l.width} height={l.height} color="#0C2A6E" />
        <Circle
          cx={l.offsetX + (FIELD_W / 2) * l.scale}
          cy={l.offsetY + (FIELD_H - 1600) * l.scale}
          r={160 * l.scale}
          color="#4E9CFA"
        />
      </Canvas>
    </>
  );
}
