import { Blur, Canvas, Group, LinearGradient, Paint, Rect, Shader, Skia, vec } from '@shopify/react-native-skia';
import { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Easing, useSharedValue, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';
import { MOTION, WORLD_GRADIENT, type WorldTheme } from './tokens';

/** Fine monochrome noise at 7% alpha (premultiplied output). */
const NOISE = Skia.RuntimeEffect.Make(`
half4 main(float2 p) {
  float n = fract(sin(dot(floor(p), float2(12.9898, 78.233))) * 43758.5453);
  return half4(half3(n) * 0.07, 0.07);
}`);

const RAY_COLORS: Record<WorldTheme, [[string, string], [string, string]]> = {
  night: [
    ['rgba(153,69,255,0.45)', 'rgba(153,69,255,0)'],
    ['rgba(40,224,185,0.4)', 'rgba(40,224,185,0)'],
  ],
  day: [
    ['rgba(255,255,255,0.4)', 'rgba(255,255,255,0)'],
    ['rgba(255,255,255,0.3)', 'rgba(255,255,255,0)'],
  ],
};

interface BackdropProps {
  theme?: WorldTheme;
  floorGlow?: boolean;
}

/** Light through deep water: the world gradient, blurred bands, two animated rays and fine noise. */
export function Backdrop({ theme = 'night', floorGlow = false }: BackdropProps) {
  const { width: w, height: h } = useWindowDimensions();
  const rayA = useSharedValue<number>(MOTION.raysMin);
  const rayB = useSharedValue<number>(MOTION.raysMax);

  useEffect(() => {
    const easing = Easing.inOut(Easing.quad);
    rayA.value = withRepeat(withTiming(MOTION.raysMax, { duration: MOTION.raysMs, easing }), -1, true);
    rayB.value = withRepeat(withTiming(MOTION.raysMin, { duration: MOTION.raysMs + 700, easing }), -1, true);
  }, [rayA, rayB]);

  const world = WORLD_GRADIENT[theme];
  const night = theme === 'night';
  const [rayColorA, rayColorB] = RAY_COLORS[theme];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Canvas style={StyleSheet.absoluteFill}>
        <Rect x={0} y={0} width={w} height={h}>
          <LinearGradient start={vec(0, 0)} end={vec(0, h)} colors={[...world.colors]} positions={[...world.positions]} />
        </Rect>
        {night && (
          <Group layer={<Paint><Blur blur={80} mode="decal" /></Paint>}>
            <Band w={w} y={h * 0.06} height={h * 0.2} colors={['#9945FF', '#5497D5']} opacity={0.28} />
            <Band w={w} y={h * 0.46} height={h * 0.16} colors={['#43B4CA', '#19FB9B']} opacity={0.2} />
            <Band w={w} y={h * 0.8} height={h * 0.18} colors={['#8752F3', '#9945FF']} opacity={0.16} />
          </Group>
        )}
        <Group layer={<Paint><Blur blur={18} mode="decal" /></Paint>}>
          <Ray x={w * 0.1} width={w * 0.3} h={h} skew={-0.244} colors={rayColorA} opacity={rayA} />
          <Ray x={w * 0.55} width={w * 0.25} h={h} skew={-0.349} colors={rayColorB} opacity={rayB} />
        </Group>
        {night && floorGlow && (
          <Rect x={0} y={h * 0.66} width={w} height={h * 0.34}>
            <LinearGradient start={vec(0, h * 0.66)} end={vec(0, h)} colors={['rgba(25,251,155,0)', 'rgba(25,251,155,0.15)']} />
          </Rect>
        )}
        {NOISE !== null && (
          <Rect x={0} y={0} width={w} height={h}>
            <Shader source={NOISE} />
          </Rect>
        )}
      </Canvas>
    </View>
  );
}

function Band({ w, y, height, colors, opacity }: { w: number; y: number; height: number; colors: [string, string]; opacity: number }) {
  return (
    <Rect x={-w * 0.2} y={y} width={w * 1.4} height={height} opacity={opacity}>
      <LinearGradient start={vec(0, 0)} end={vec(w, 0)} colors={colors} />
    </Rect>
  );
}

function Ray({ x, width, h, skew, colors, opacity }: {
  x: number; width: number; h: number; skew: number; colors: [string, string]; opacity: SharedValue<number>;
}) {
  return (
    <Group opacity={opacity} origin={vec(x, 0)} transform={[{ skewX: skew }]}>
      <Rect x={x} y={-h * 0.1} width={width} height={h * 1.2}>
        <LinearGradient start={vec(0, 0)} end={vec(0, h)} colors={colors} />
      </Rect>
    </Group>
  );
}
