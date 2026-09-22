import { Canvas, Rect, Shader, Skia, type SkRuntimeEffect } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { Easing, useDerivedValue, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { COLORS, SIGNATURE_GRADIENT } from './tokens';

/**
 * A full-bleed swirl for a menu screen (owner's pick 2026-09-22 evening), adapted for Skia's SkSL
 * from the React Bits `Balatro` component (MIT + Commons Clause, https://reactbits.dev — the same
 * credit `lightning.ts`/`tunnel.ts` already carry). Changes from the original: SkSL types and entry
 * point; mouse interaction removed entirely (`uMouse` is gone, not just zeroed); `uIsRotate` is gone
 * too — the gallery's own default is `false`, so the branch it gated is simply never taken, baked out
 * rather than kept as a dead uniform; every other knob (offset, contrast, lighting, spin amount,
 * pixel filter, spin ease) is baked in as a constant, the same "the look is fixed, only ... moves"
 * call `tunnel.ts` made for the gravity well — only colour and spin speed vary here.
 *
 * No downscale: a Skia `Group`/`Rect` transform does not lower a fragment shader's own per-pixel
 * cost on the GPU backend the way it would on a software rasteriser (the shader still runs once per
 * *screen* pixel regardless of any CTM scale; only rendering to a smaller offscreen surface first
 * would cut it, which the public API here does not offer cheaply). The actual cost control is the
 * shader itself: a plain 5-iteration loop of trig, no noise or texture lookups, cheaper per pixel
 * than `lightning.ts`'s own 6-octave `fbm`, which already runs on up to four lanes at once at 120 Hz.
 *
 * Uniforms, in order the shader declares them: `iResolution`, `iTime` (seconds), `uSpinSpeed`,
 * `uColor1`/`uColor2`/`uColor3` (each an RGBA 0..1 vector). Built once at module load; `null` if the
 * device's Skia cannot compile it, in which case the caller shows a flat fill in the darkest colour.
 */
export const BALATRO: SkRuntimeEffect | null = Skia.RuntimeEffect.Make(`
uniform float2 iResolution;
uniform float iTime;
uniform float uSpinSpeed;
uniform float4 uColor1;
uniform float4 uColor2;
uniform float4 uColor3;

const float SPIN_ROTATION = -2.0;
const float CONTRAST = 3.5;
const float LIGHTING = 0.4;
const float SPIN_AMOUNT = 0.25;
const float PIXEL_FILTER = 745.0;
const float SPIN_EASE = 1.0;

half4 main(float2 fragCoord) {
  float2 screenSize = iResolution;
  float pixel_size = length(screenSize) / PIXEL_FILTER;
  float2 uv = (floor(fragCoord * (1.0 / pixel_size)) * pixel_size - 0.5 * screenSize) / length(screenSize);
  float uv_len = length(uv);

  // uIsRotate is always false here (a static menu backdrop, never spun by a click): speed keeps only
  // the constant term the original's "not rotating" branch already left it with.
  float speed = (SPIN_ROTATION * SPIN_EASE * 0.2) + 302.2;

  float new_pixel_angle = atan(uv.y, uv.x) + speed - SPIN_EASE * 20.0 * (SPIN_AMOUNT * uv_len + (1.0 - SPIN_AMOUNT));
  float2 mid = (screenSize / length(screenSize)) / 2.0;
  uv = float2(uv_len * cos(new_pixel_angle) + mid.x, uv_len * sin(new_pixel_angle) + mid.y) - mid;

  uv *= 30.0;
  float baseSpeed = iTime * uSpinSpeed;

  float2 uv2 = float2(uv.x + uv.y, uv.x + uv.y);
  for (int i = 0; i < 5; i++) {
    uv2 += sin(max(uv.x, uv.y)) + uv;
    uv += 0.5 * float2(
      cos(5.1123314 + 0.353 * uv2.y + baseSpeed * 0.131121),
      sin(uv2.x - 0.113 * baseSpeed)
    );
    uv -= cos(uv.x + uv.y) - sin(uv.x * 0.711 - uv.y);
  }

  float contrast_mod = (0.25 * CONTRAST + 0.5 * SPIN_AMOUNT + 1.2);
  float paint_res = min(2.0, max(0.0, length(uv) * 0.035 * contrast_mod));
  float c1p = max(0.0, 1.0 - contrast_mod * abs(1.0 - paint_res));
  float c2p = max(0.0, 1.0 - contrast_mod * abs(paint_res));
  float c3p = 1.0 - min(1.0, c1p + c2p);
  float light = (LIGHTING - 0.2) * max(c1p * 5.0 - 4.0, 0.0) + LIGHTING * max(c2p * 5.0 - 4.0, 0.0);

  float4 col = (0.3 / CONTRAST) * uColor1
    + (1.0 - 0.3 / CONTRAST) * (uColor1 * c1p + uColor2 * c2p + float4(c3p * uColor3.rgb, c3p * uColor1.a))
    + light;

  float alpha = clamp(col.a, 0.0, 1.0);
  float3 rgb = clamp(col.rgb, 0.0, 1.0) * alpha;
  return half4(half3(rgb), half(alpha));
}
`);

/** One lap of the shared `iTime` ramp, in seconds, before `withRepeat` starts it over: long enough
 * that a player would need to leave a menu open for hours to ever see the reset. */
const TIME_SPAN_S = 100000;

/** The app's own signature tokens: violet, teal, near-black — `SIGNATURE_GRADIENT`'s first and
 * next-to-last stops, and the darkest surface token, rather than new hex literals. */
const DEFAULT_COLORS: readonly [string, string, string] = [
  SIGNATURE_GRADIENT.colors[0], SIGNATURE_GRADIENT.colors[4], COLORS.app,
];
/** The gallery's own default (`spinSpeed` 7.0) spins fast enough to distract behind menu content. */
const DEFAULT_SPEED = 1.4;

/** `#RRGGBB` to a premultiply-ready RGBA 0..1 vector (alpha always 1 — the app never themes this with
 * a translucent stop). */
function hexToRgba(hex: string): [number, number, number, number] {
  const v = Number.parseInt(hex.slice(1, 7), 16);
  return [((v >> 16) & 0xff) / 255, ((v >> 8) & 0xff) / 255, (v & 0xff) / 255, 1];
}

export interface BalatroBackdropProps {
  style?: StyleProp<ViewStyle>;
  /** Violet, teal, near-black (the app's own signature tokens) unless overridden. */
  colors?: readonly [string, string, string];
  /** The shader's own spin speed; defaults slow, for a menu backdrop. */
  speed?: number;
}

/**
 * A full-bleed Balatro swirl (owner's pick 2026-09-22 evening): no required props, no mouse
 * interaction. Lane B wires this into the Shop screen; it renders on its own wherever it is mounted.
 */
export function BalatroBackdrop({ style, colors = DEFAULT_COLORS, speed = DEFAULT_SPEED }: BalatroBackdropProps) {
  const { width, height } = useWindowDimensions();
  const time = useSharedValue(0);

  useEffect(() => {
    time.value = withRepeat(withTiming(TIME_SPAN_S, { duration: TIME_SPAN_S * 1000, easing: Easing.linear }), -1, false);
  }, [time]);

  const [color1, color2, color3] = colors;
  // Parsed once per colour prop change, not per frame — only `time.value` moves every frame below.
  const c1 = useMemo(() => hexToRgba(color1), [color1]);
  const c2 = useMemo(() => hexToRgba(color2), [color2]);
  const c3 = useMemo(() => hexToRgba(color3), [color3]);

  const uniforms = useDerivedValue(() => ({
    iResolution: [width, height],
    iTime: time.value,
    uSpinSpeed: speed,
    uColor1: c1,
    uColor2: c2,
    uColor3: c3,
  }), [width, height, speed, c1, c2, c3]);

  if (BALATRO === null) {
    return <View style={[StyleSheet.absoluteFill, style, { backgroundColor: color3 }]} />;
  }

  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Canvas style={StyleSheet.absoluteFill}>
        <Rect x={0} y={0} width={width} height={height}>
          <Shader source={BALATRO} uniforms={uniforms} />
        </Rect>
      </Canvas>
    </View>
  );
}
