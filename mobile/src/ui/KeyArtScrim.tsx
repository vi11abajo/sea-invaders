import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

interface KeyArtScrimProps {
  /** How black the top edge is, 0..1. */
  opacity: number;
  /** How far down the screen the scrim has faded out, as a fraction of the screen height. */
  fraction: number;
}

/**
 * Darkens the bright upper water of a key-art background under whatever sits there (a top bar, a
 * header, a ticker): black at `opacity` along the top edge, gone by `fraction` of the screen
 * height, the picture below untouched. Absolutely positioned; put it right after the art.
 */
export function KeyArtScrim({ opacity, fraction }: KeyArtScrimProps) {
  const { width, height } = useWindowDimensions();
  const h = Math.round(height * fraction);
  return (
    <View style={[styles.scrim, { height: h }]} pointerEvents="none">
      <Canvas style={StyleSheet.absoluteFill}>
        <Rect x={0} y={0} width={width} height={h}>
          <LinearGradient start={vec(0, 0)} end={vec(0, h)} colors={[`rgba(0,0,0,${opacity})`, 'rgba(0,0,0,0)']} />
        </Rect>
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, width: '100%' },
});
