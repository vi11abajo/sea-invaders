import { Canvas, LinearGradient, RoundedRect, vec } from '@shopify/react-native-skia';
import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { SIGNATURE_GRADIENT } from './tokens';

interface GradientFillProps {
  radius?: number;
  colors?: readonly string[];
  positions?: readonly number[];
}

/** Fills its parent, left to right. Put it first inside a view that sets its size. */
export function GradientFill({
  radius = 0,
  colors = SIGNATURE_GRADIENT.colors,
  positions = colors === SIGNATURE_GRADIENT.colors ? SIGNATURE_GRADIENT.positions : undefined,
}: GradientFillProps) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: width, h: height });
  };
  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout} pointerEvents="none">
      {size.w > 0 && (
        <Canvas style={StyleSheet.absoluteFill}>
          <RoundedRect x={0} y={0} width={size.w} height={size.h} r={radius}>
            <LinearGradient
              start={vec(0, 0)}
              end={vec(size.w, 0)}
              colors={[...colors]}
              positions={positions ? [...positions] : undefined}
            />
          </RoundedRect>
        </Canvas>
      )}
    </View>
  );
}
