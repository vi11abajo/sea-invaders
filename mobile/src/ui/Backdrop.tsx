import { Blur, Canvas, Group, LinearGradient, Paint, Rect, Shader, Skia, vec } from '@shopify/react-native-skia';
import { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import {
  Easing, useDerivedValue, useSharedValue, withRepeat, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { LIGHT_RAYS, RAY_TIME_SPAN_S, rayColorVec3 } from './lightRays';
import { MOTION, WORLD_GRADIENT, type WorldTheme } from './tokens';

/** Fine monochrome noise at 7% alpha (premultiplied output). */
const NOISE = Skia.RuntimeEffect.Make(`
half4 main(float2 p) {
  float n = fract(sin(dot(floor(p), float2(12.9898, 78.233))) * 43758.5453);
  return half4(half3(n) * 0.07, 0.07);
}`);

/** Owner's pick 2026-09-22 evening: each theme's two rays, one peak colour apiece (the `LIGHT_RAYS`
 * shader computes its own falloff, so no gradient stop pair is needed any more). */
const RAY_COLORS: Record<WorldTheme, [string, string]> = {
  night: ['rgba(153,69,255,0.45)', 'rgba(40,224,185,0.4)'],
  day: ['rgba(255,255,255,0.4)', 'rgba(255,255,255,0.3)'],
};

interface BackdropProps {
  theme?: WorldTheme;
  /** 'play' drops the blurred bands and halves the rays, so crabs and shots stay readable. */
  variant?: 'menu' | 'play';
  floorGlow?: boolean;
}

/** Light through deep water: the world gradient, blurred bands, two animated rays and fine noise. */
export function Backdrop({ theme = 'night', variant = 'menu', floorGlow = false }: BackdropProps) {
  const { width: w, height: h } = useWindowDimensions();
  const rayA = useSharedValue<number>(MOTION.raysMin);
  const rayB = useSharedValue<number>(MOTION.raysMax);
  // Owner's pick 2026-09-22 evening: the shader's own slow-breathing clock, the same long-lap ramp
  // `BalatroBackdrop.tsx` uses for its `iTime` — `rayA`/`rayB` above still drive each ray's own
  // opacity exactly as they always did.
  const rayTime = useSharedValue(0);

  useEffect(() => {
    const easing = Easing.inOut(Easing.quad);
    rayA.value = withRepeat(withTiming(MOTION.raysMax, { duration: MOTION.raysMs, easing }), -1, true);
    rayB.value = withRepeat(withTiming(MOTION.raysMin, { duration: MOTION.raysMs + 700, easing }), -1, true);
    rayTime.value = withRepeat(withTiming(RAY_TIME_SPAN_S, { duration: RAY_TIME_SPAN_S * 1000, easing: Easing.linear }), -1, false);
  }, [rayA, rayB, rayTime]);

  const world = WORLD_GRADIENT[theme];
  const night = theme === 'night';
  const play = variant === 'play';
  const [rayColorA, rayColorB] = RAY_COLORS[theme];
  const rayVecA = rayColorVec3(rayColorA);
  const rayVecB = rayColorVec3(rayColorB);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Canvas style={StyleSheet.absoluteFill}>
        <Rect x={0} y={0} width={w} height={h}>
          <LinearGradient start={vec(0, 0)} end={vec(0, h)} colors={[...world.colors]} positions={[...world.positions]} />
        </Rect>
        {night && !play && (
          <Group layer={<Paint><Blur blur={80} mode="decal" /></Paint>}>
            <Band w={w} y={h * 0.06} height={h * 0.2} colors={['#9945FF', '#5497D5']} opacity={0.28} />
            <Band w={w} y={h * 0.46} height={h * 0.16} colors={['#43B4CA', '#19FB9B']} opacity={0.2} />
            <Band w={w} y={h * 0.8} height={h * 0.18} colors={['#8752F3', '#9945FF']} opacity={0.16} />
          </Group>
        )}
        {LIGHT_RAYS !== null && (
          <Group opacity={play ? 0.5 : 1}>
            <Ray w={w} h={h} x={w * 0.35} color={rayVecA} opacity={rayA} time={rayTime} />
            <Ray w={w} h={h} x={w * 0.65} color={rayVecB} opacity={rayB} time={rayTime} />
          </Group>
        )}
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

/**
 * Owner's pick 2026-09-22 evening (`lightRays.ts`, React Bits `LightRays`): one full-canvas shader
 * fill anchored above the screen, in place of the skewed gradient rect this used to draw. `opacity`
 * is the same per-ray breathing animation the file always had; `time` is shared by both rays, driving
 * the shader's own slow pulse. No blur wrapper any more — the shader's own falloff is already soft,
 * and skipping the extra blur pass is most of this replacement's performance budget.
 */
function Ray({ w, h, x, color, opacity, time }: {
  w: number; h: number; x: number; color: [number, number, number]; opacity: SharedValue<number>; time: SharedValue<number>;
}) {
  const uniforms = useDerivedValue(() => ({
    iResolution: [w, h],
    iTime: time.value,
    rayPos: [x, -0.15 * h],
    rayDir: [0, 1],
    raysColor: color,
  }), [w, h, x, color, time]);
  return (
    <Group opacity={opacity}>
      <Rect x={0} y={0} width={w} height={h}>
        <Shader source={LIGHT_RAYS!} uniforms={uniforms} />
      </Rect>
    </Group>
  );
}
