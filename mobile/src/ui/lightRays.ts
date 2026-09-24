import { Skia, type SkRuntimeEffect } from '@shopify/react-native-skia';

/** One lap of a shader's shared `iTime` ramp (both callers below use the same trick as
 * `SwirlBackdrop.tsx`'s own `time`): long enough that `withRepeat`'s reset is never seen in a
 * session, driven by `withRepeat(withTiming(RAY_TIME_SPAN_S, { duration: RAY_TIME_SPAN_S * 1000 }))`. */
export const RAY_TIME_SPAN_S = 100000;

/** `rgba(r, g, b, a)` (the format both backdrops' own ray tables already use) to an RGB 0..1 vector
 * for the shader's `raysColor` uniform — alpha is ignored, each ray's own `Group` opacity animation
 * (already in both files, unchanged) carries the fade instead. */
export function rayColorVec3(rgba: string): [number, number, number] {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgba);
  if (m === null) return [1, 1, 1];
  return [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255];
}

/**
 * Light through deep water, adapted for Skia's SkSL from the
 * React Bits `LightRays` component (MIT + Commons Clause, https://reactbits.dev — the same credit
 * `lightning.ts`/`tunnel.ts` already carry). Two callers share this one effect: `Backdrop.tsx` (the
 * generic menu/play backdrop) and `ReefBackdrop.tsx` (the campaign map), each drawing it twice — once
 * per ray, at its own anchor and colour — in place of the skewed gradient rect each drew before.
 *
 * Changes from the original: SkSL types and entry point; no mouse follow (`mousePos`/`mouseInfluence`
 * are gone, not zeroed); no noise grain, no light mode, and saturation is left at the gallery's own
 * neutral 1.0 (dropped, since a no-op multiply there was pure cost); `distortion` is dropped too (a
 * 0.0 no-op in every caller). What is left varies only by `iResolution`/`rayPos`/`rayDir`/`raysColor`;
 * `raysSpeed` is baked into the two ray "seeds" as `SPEED_A`/`SPEED_B` below, slow — a breathing pulse
 * roughly once every couple of seconds, not the gallery's own brisk default. The output is
 * premultiplied, as Skia expects: `alpha = max(r, g, b)` after the same top-to-bottom tint the
 * original applies, the same closing move `lightning.ts`/`orb.ts` both make.
 *
 * Uniforms, in order: `iResolution` (dp), `iTime` (seconds), `rayPos` (the ray's origin, dp),
 * `rayDir` (unit vector, screen space with y flipped — matches the gallery's own `coord` flip so
 * "down the screen" is `(0, 1)`), `raysColor` (RGB 0..1). Built once at module load; `null` if the
 * device's Skia cannot compile it, in which case the caller keeps drawing nothing extra (the world
 * gradient and blurred bands underneath already carry the backdrop on their own).
 */
export const LIGHT_RAYS: SkRuntimeEffect | null = Skia.RuntimeEffect.Make(`
uniform float2 iResolution;
uniform float iTime;
uniform float2 rayPos;
uniform float2 rayDir;
uniform float3 raysColor;

// The gallery's own two ray "seeds" (its \`rays1\`/\`rays2\`), speed baked slow for a breathing pulse
// rather than the gallery's brisk \`raysSpeed = 1\` default.
const float SPEED_A = 1.5 * 0.35;
const float SPEED_B = 1.1 * 0.35;
const float LIGHT_SPREAD = 1.0;
const float RAY_LENGTH = 2.2;
const float FADE_DISTANCE = 1.0;

float rayStrength(float2 raySource, float2 rayRefDirection, float2 coord, float seedA, float seedB, float speed) {
  float2 sourceToCoord = coord - raySource;
  float2 dirNorm = normalize(sourceToCoord);
  float cosAngle = dot(dirNorm, rayRefDirection);

  float spreadFactor = pow(max(cosAngle, 0.0), 1.0 / LIGHT_SPREAD);

  float dist = length(sourceToCoord);
  float maxDistance = iResolution.x * RAY_LENGTH;
  float lengthFalloff = clamp((maxDistance - dist) / maxDistance, 0.0, 1.0);
  float fadeFalloff = clamp((iResolution.x * FADE_DISTANCE - dist) / (iResolution.x * FADE_DISTANCE), 0.5, 1.0);
  float pulse = 0.8 + 0.2 * sin(iTime * speed * 3.0);

  float baseStrength = clamp(
    (0.45 + 0.15 * sin(cosAngle * seedA + iTime * speed)) +
    (0.3 + 0.2 * cos(-cosAngle * seedB + iTime * speed)),
    0.0, 1.0
  );

  return baseStrength * lengthFalloff * fadeFalloff * spreadFactor * pulse;
}

half4 main(float2 fragCoord) {
  float2 coord = float2(fragCoord.x, iResolution.y - fragCoord.y);

  float rays1 = rayStrength(rayPos, rayDir, coord, 36.2214, 21.11349, SPEED_A);
  float rays2 = rayStrength(rayPos, rayDir, coord, 22.3991, 18.0234, SPEED_B);
  float3 col = float3(rays1) * 0.5 + float3(rays2) * 0.4;

  float brightness = 1.0 - (coord.y / iResolution.y);
  col.x *= 0.1 + brightness * 0.8;
  col.y *= 0.3 + brightness * 0.6;
  col.z *= 0.5 + brightness * 0.5;
  col *= raysColor;
  col = clamp(col, 0.0, 1.0);

  float alpha = max(col.r, max(col.g, col.b));
  return half4(half3(col), half(alpha));
}
`);
