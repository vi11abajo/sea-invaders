import { Skia, type SkRuntimeEffect } from '@shopify/react-native-skia';
import { LIGHTNING_HUE } from './lightning';

/**
 * The Storm Tyrant's homing orb (enemy shot kind `orb`), adapted for Skia's SkSL from the React Bits `Orb` component (MIT + Commons Clause,
 * https://reactbits.dev — the same credit `lightning.ts`/`tunnel.ts` already carry). Changes from the
 * original: SkSL types and entry point; no hover/mouse logic and no rotation input (the gallery's own
 * `hover`/`rot` uniforms are gone, not just zeroed); the hue is baked to `LIGHTNING_HUE` — the same
 * cyan the Tyrant's claws (and his lightning) already use, so every part of him reads as one boss;
 * `backgroundColor` is gone too — this always draws over the dark field, so the gallery's own
 * light/dark blend (`bgLuminance`) collapses to its `bgLuminance = 0` branch, which is just
 * `finalCol = darkCol`, so only that branch is kept. The output is premultiplied, as Skia expects:
 * `extractAlpha`'s own normalise-then-remultiply is dropped because `darkCol`'s channels are already
 * each <= `max(r,g,b)` by construction, i.e. already premultiplied (the same simplification
 * `lightning.ts`'s own ending already makes).
 *
 * Uniforms, in order: `iResolution` (the square drawn around the shot, dp) and `iTime` (seconds).
 * Built once at module load; `null` if the device's Skia cannot compile it, in which case the caller
 * keeps the plain pulsing circle it always drew.
 */
export const ORB: SkRuntimeEffect | null = Skia.RuntimeEffect.Make(`
uniform float2 iResolution;
uniform float iTime;

const float HUE_DEG = ${LIGHTNING_HUE}.0; // the Tyrant's own cyan (\`LIGHTNING_HUE\`, \`lightning.ts\`)
const float3 BASE_COLOR_1 = float3(0.611765, 0.262745, 0.996078);
const float3 BASE_COLOR_2 = float3(0.298039, 0.760784, 0.913725);
const float3 BASE_COLOR_3 = float3(0.062745, 0.078431, 0.600000);
const float INNER_RADIUS = 0.6;
const float NOISE_SCALE = 0.65;

float3 rgb2yiq(float3 c) {
  float y = dot(c, float3(0.299, 0.587, 0.114));
  float i = dot(c, float3(0.596, -0.274, -0.322));
  float q = dot(c, float3(0.211, -0.523, 0.312));
  return float3(y, i, q);
}

float3 yiq2rgb(float3 c) {
  float r = c.x + 0.956 * c.y + 0.621 * c.z;
  float g = c.x - 0.272 * c.y - 0.647 * c.z;
  float b = c.x - 1.106 * c.y + 1.703 * c.z;
  return float3(r, g, b);
}

float3 adjustHue(float3 color, float hueDeg) {
  float hueRad = hueDeg * 3.14159265 / 180.0;
  float3 yiq = rgb2yiq(color);
  float cosA = cos(hueRad);
  float sinA = sin(hueRad);
  float i = yiq.y * cosA - yiq.z * sinA;
  float q = yiq.y * sinA + yiq.z * cosA;
  yiq.y = i;
  yiq.z = q;
  return yiq2rgb(yiq);
}

float3 hash33(float3 p3) {
  p3 = fract(p3 * float3(0.1031, 0.11369, 0.13787));
  p3 += dot(p3, p3.yxz + 19.19);
  return -1.0 + 2.0 * fract(float3(p3.x + p3.y, p3.x + p3.z, p3.y + p3.z) * p3.zyx);
}

float snoise3(float3 p) {
  const float K1 = 0.333333333;
  const float K2 = 0.166666667;
  float3 i = floor(p + (p.x + p.y + p.z) * K1);
  float3 d0 = p - (i - (i.x + i.y + i.z) * K2);
  float3 e = step(float3(0.0), d0 - d0.yzx);
  float3 i1 = e * (1.0 - e.zxy);
  float3 i2 = 1.0 - e.zxy * (1.0 - e);
  float3 d1 = d0 - (i1 - K2);
  float3 d2 = d0 - (i2 - K1);
  float3 d3 = d0 - 0.5;
  float4 h = max(0.6 - float4(dot(d0, d0), dot(d1, d1), dot(d2, d2), dot(d3, d3)), 0.0);
  float4 n = h * h * h * h * float4(
    dot(d0, hash33(i)), dot(d1, hash33(i + i1)), dot(d2, hash33(i + i2)), dot(d3, hash33(i + 1.0))
  );
  return dot(float4(31.316), n);
}

float light1(float intensity, float attenuation, float dist) {
  return intensity / (1.0 + dist * attenuation);
}
float light2(float intensity, float attenuation, float dist) {
  return intensity / (1.0 + dist * dist * attenuation);
}

half4 main(float2 fragCoord) {
  float2 center = iResolution * 0.5;
  float size = min(iResolution.x, iResolution.y);
  float2 uv = (fragCoord - center) / size * 2.0;

  float3 color1 = adjustHue(BASE_COLOR_1, HUE_DEG);
  float3 color2 = adjustHue(BASE_COLOR_2, HUE_DEG);
  float3 color3 = adjustHue(BASE_COLOR_3, HUE_DEG);

  float ang = atan(uv.y, uv.x);
  float len = length(uv);
  float invLen = len > 0.0 ? 1.0 / len : 0.0;

  float n0 = snoise3(float3(uv * NOISE_SCALE, iTime * 0.5)) * 0.5 + 0.5;
  float r0 = mix(mix(INNER_RADIUS, 1.0, 0.4), mix(INNER_RADIUS, 1.0, 0.6), n0);
  float d0 = distance(uv, (r0 * invLen) * uv);
  float v0 = light1(1.0, 10.0, d0);
  v0 *= smoothstep(r0 * 1.05, r0, len);
  v0 *= smoothstep(r0 * 0.8, r0 * 0.95, len);

  float cl = cos(ang + iTime * 2.0) * 0.5 + 0.5;
  float a = iTime * -1.0;
  float2 pos = float2(cos(a), sin(a)) * r0;
  float d = distance(uv, pos);
  float v1 = light2(1.5, 5.0, d);
  v1 *= light1(1.0, 50.0, d0);

  float v2 = smoothstep(1.0, mix(INNER_RADIUS, 1.0, n0 * 0.5), len);
  float v3 = smoothstep(INNER_RADIUS, mix(INNER_RADIUS, 1.0, 0.5), len);

  float3 colBase = mix(color1, color2, cl);
  float3 darkCol = mix(color3, colBase, v0);
  darkCol = (darkCol + v1) * v2 * v3;
  darkCol = clamp(darkCol, 0.0, 1.0);

  float alpha = max(darkCol.r, max(darkCol.g, darkCol.b));
  return half4(half3(darkCol), half(alpha));
}
`);
