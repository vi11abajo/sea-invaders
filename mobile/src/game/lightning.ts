import { Skia, type SkRuntimeEffect } from '@shopify/react-native-skia';

/**
 * The Storm Tyrant's lightning (spec §5.2 row 9, owner's pick of 2026-09-22 evening): a runtime
 * shader that draws one jagged bolt down a lane, adapted for Skia's SkSL from the React Bits
 * `Lightning` component (MIT + Commons Clause, https://reactbits.dev — the same credit the landing
 * page carries for its cursor and gallery). Changes from the original: SkSL types and entry point,
 * six noise octaves instead of ten (a phone GPU draws up to four lanes at once at 120 Hz), and the
 * coordinate frame is the LANE, not a wide canvas — `uv.x` spans the lane's width and `uv.y` is
 * scaled by the lane's aspect so the noise stays square, which is what lets one narrow strip carry a
 * whole bolt. The output is premultiplied, as Skia expects: every channel is already below the alpha
 * it derives from the brightest one.
 *
 * Uniforms, in order: `iResolution` (lane width, height in dp), `iTime` (seconds), `uHue` (degrees),
 * `uXOffset`, `uSpeed`, `uIntensity`, `uSize`. Built once at module load; `null` if the device's
 * Skia cannot compile it (the caller then falls back to the plain flash it drew before).
 */
export const LIGHTNING: SkRuntimeEffect | null = Skia.RuntimeEffect.Make(`
uniform float2 iResolution;
uniform float iTime;
uniform float uHue;
uniform float uXOffset;
uniform float uSpeed;
uniform float uIntensity;
uniform float uSize;

float3 hsv2rgb(float3 c) {
  float3 rgb = clamp(abs(mod(c.x * 6.0 + float3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return c.z * mix(float3(1.0), rgb, c.y);
}

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash12(float2 p) {
  float3 p3 = fract(float3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float2x2 rotate2d(float theta) {
  float c = cos(theta);
  float s = sin(theta);
  return float2x2(c, -s, s, c);
}

float noise(float2 p) {
  float2 ip = floor(p);
  float2 fp = fract(p);
  float a = hash12(ip);
  float b = hash12(ip + float2(1.0, 0.0));
  float c = hash12(ip + float2(0.0, 1.0));
  float d = hash12(ip + float2(1.0, 1.0));
  float2 t = smoothstep(0.0, 1.0, fp);
  return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
}

float fbm(float2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 6; ++i) {
    value += amplitude * noise(p);
    p = rotate2d(0.45) * p;
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

half4 main(float2 fragCoord) {
  float2 uv = fragCoord / iResolution;
  uv = 2.0 * uv - 1.0;
  uv.y *= iResolution.y / iResolution.x;
  uv.x += uXOffset;
  uv += 2.0 * fbm(uv * uSize + 0.8 * iTime * uSpeed) - 1.0;
  float dist = abs(uv.x);
  float3 baseColor = hsv2rgb(float3(uHue / 360.0, 0.7, 0.8));
  float3 col = baseColor * (mix(0.0, 0.07, hash11(iTime * uSpeed)) / max(dist, 0.001)) * uIntensity;
  col = clamp(col, 0.0, 1.0);
  float a = max(col.r, max(col.g, col.b));
  return half4(half3(col), half(a));
}
`);

/** Hue of the Tyrant's bolt: the cyan of his own claws, so a strike reads as his. */
export const LIGHTNING_HUE = 196;
/** How bright a fresh strike is; it fades with the strike's own lifetime. */
export const LIGHTNING_INTENSITY = 1.6;
/** Noise scale: smaller values make broader forks, larger ones a finer crackle. */
export const LIGHTNING_SIZE = 1.4;
/** How fast the bolt re-shapes itself, in multiples of the shader's own clock. */
export const LIGHTNING_SPEED = 3;
