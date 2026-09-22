import { Skia, type SkRuntimeEffect } from '@shopify/react-native-skia';

/**
 * Concentric glowing rings (owner's pick of 2026-09-22 evening), adapted for Skia's SkSL from the
 * React Bits `MagicRings` component (three.js; MIT + Commons Clause, https://reactbits.dev — the same
 * credit `lightning.ts`/`tunnel.ts` already carry). Two moments share this one effect (`draw.ts`'s
 * `revive_rings`/`phase_rings` kinds): the Tide's return around Octopi, and a boss's phase change
 * around itself — the ring look is identical, only the colour and the disc's size differ per caller.
 *
 * Changes from the original: SkSL types and entry point; no mouse/hover/click-burst/parallax (every
 * uniform that drove them is gone); one colour instead of two (`uColorTwo`'s gradient collapses to a
 * per-ring brightness falloff instead); ring count, thickness, spacing, attenuation and the fade
 * curve are baked in as constants — the same "look is fixed, only ... moves" call `tunnel.ts` made.
 * The fade curve is tuned to stay near full brightness for the short one-shot windows both callers
 * use (`EFFECT_LIFETIME.revive_rings`/`phase_rings`, `draw.ts`) — the caller's own `1 - progress`
 * alpha (the same fade every other one-shot effect in `draw.ts` already applies) does the visible
 * taper, not this shader's own `fade()`, so both callers get the same smooth end regardless of this
 * shader's fixed cycle length. The output is premultiplied, as Skia expects: since ring colour and
 * alpha both come out of the same additive `col`, and `alpha = max(col.r, col.g, col.b)` afterwards,
 * every channel is already <= alpha (the same closing move `lightning.ts` and `orb.ts` both make).
 *
 * Uniforms, in order: `iResolution` (the square drawn around the target, dp), `iTime` (seconds
 * *since this instance started*, not the global clock — the rings must start small on every call, so
 * the caller passes its own entry's age, not `f.tick`), and `uColor` (RGB 0..1). Built once at module
 * load; `null` if the device's Skia cannot compile it, in which case the caller draws a small plain
 * ring burst instead (the same fallback shape most one-shot effects in `draw.ts` already use).
 */
export const MAGIC_RINGS: SkRuntimeEffect | null = Skia.RuntimeEffect.Make(`
uniform float2 iResolution;
uniform float iTime;
uniform float3 uColor;

const int RING_COUNT = 3;
const float BASE_RADIUS = 0.18;
const float RADIUS_STEP = 0.14;
const float SCALE_RATE = 0.5;
const float RING_GAP = 1.4;
const float ATTENUATION = 9.0;
const float LINE_THICKNESS = 1.8;
// Both callers' one-shot windows (0.75 s / 1.0 s, \`EFFECT_LIFETIME\`) sit inside the "stays lit"
// part of this cycle; the caller's own progress-based alpha does the visible fade instead.
const float CYCLE = 1.3;
const float FADE_IN = 0.08;
const float FADE_OUT = 1.0;
const float HP = 1.5707963;

float ringFade(float t) {
  return t < FADE_IN ? smoothstep(0.0, FADE_IN, t) : 1.0 - smoothstep(FADE_OUT, CYCLE - 0.05, t);
}

float ring(float2 p, float ri, float cut, float t0, float px) {
  float t = mod(iTime + t0, CYCLE);
  float r = ri + t / CYCLE * SCALE_RATE;
  float d = abs(length(p) - r);
  float a = abs(atan(abs(p.y), abs(p.x))) / HP;
  float th = max(1.0 - a, 0.5) * px * LINE_THICKNESS;
  float h = (1.0 - smoothstep(th, th * 1.5, d)) + 1.0;
  d += pow(cut * a, 3.0) * r;
  return h * exp(-ATTENUATION * d) * ringFade(t);
}

half4 main(float2 fragCoord) {
  float px = 1.0 / min(iResolution.x, iResolution.y);
  float2 p = (fragCoord - 0.5 * iResolution) * px;
  float3 col = float3(0.0);
  float rcf = max(float(RING_COUNT) - 1.0, 1.0);
  for (int i = 0; i < RING_COUNT; i++) {
    float fi = float(i);
    float bright = mix(1.0, 0.5, fi / rcf);
    float amount = ring(p, BASE_RADIUS + fi * RADIUS_STEP, pow(RING_GAP, fi), i == 0 ? 0.0 : 0.35 * fi, px);
    col += uColor * bright * amount;
  }
  col = clamp(col, 0.0, 1.0);
  float alpha = max(col.r, max(col.g, col.b));
  return half4(half3(col), half(alpha));
}
`);
