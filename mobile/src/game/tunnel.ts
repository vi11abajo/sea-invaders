import { Skia, type SkRuntimeEffect } from '@shopify/react-native-skia';

/**
 * The gravity well's pull: fibre-like cables radiating
 * from the well's centre with light pulses running INWARD along them, so the black hole visibly
 * drinks. Adapted for Skia's SkSL from the React Bits `LightTunnel` component (MIT + Commons
 * Clause, https://reactbits.dev — credited like the Tyrant's lightning in `lightning.ts`).
 *
 * Changes from the original: SkSL types and entry point; every prop is baked in as a constant (the
 * look is fixed, only time moves); `fwidth` (no derivatives in a runtime effect) is a constant;
 * the far fade is measured against the disc's own edge, so the effect always fits the circle it is
 * drawn into — the well keeps exactly the on-screen size it had (the caller's `glowRadius`); no
 * grain, no mouse parallax, no light mode. The output is premultiplied, as Skia expects.
 *
 * Uniforms, in order: `iResolution` (the square the disc sits in, dp) and `iTime` (seconds).
 * Built once at module load; `null` if the device's Skia cannot compile it (the caller then keeps
 * the plain radial gradient it always drew).
 */
export const TUNNEL: SkRuntimeEffect | null = Skia.RuntimeEffect.Make(`
uniform float2 iResolution;
uniform float iTime;

const float SIZE = 0.25;          // uSize: with a square resolution the disc's edge sits at r = 1
const float FLOW_DIR = 1.0;       // inward: the light falls into the well
const float SPEED = 0.35;
const float PULSE_SPEED = 2.0;
const float PULSE_LENGTH = 0.28;
const float PULSE_BLEND = 1.0;
const float PULSE_WIDTH = 1.0;
const float CABLE_COUNT = 14.0;
const float THICKNESS = 0.35;
const float RIM_WIDTH = 0.15;
const float WAVINESS = 0.3;
const float SWAY = 0.5;
const float GLOW = 1.0;
const float FADE_NEAR = 0.18;     // the centre stays the gradient's black core underneath
const float EDGE_FADE_FROM = 0.72; // the cables melt away before the disc's rim
const float BRIGHTNESS = 1.0;
const float COLOR_VARIANCE = 1.0;
const float OPACITY = 0.9;
const float3 CABLE_COLOR = float3(0.529, 0.322, 0.953); // #8752F3, the signature gradient's violet
const float3 PULSE_COLOR = float3(0.792, 0.624, 0.961); // #CA9FF5, the reef's lilac

half4 main(float2 fragCoord) {
  float size = SIZE * 2.0;
  float speedBase = SPEED * 4.0 * FLOW_DIR;
  float waviness = WAVINESS * 0.15;
  float rotationOsc = SWAY * 0.5;
  float baseThick = THICKNESS * 0.35 + 0.05;
  float borderWeight = RIM_WIDTH * 0.15 + 0.01;

  float2 res = iResolution;
  float2 uv = (fragCoord - 0.5 * res) / min(res.y, res.x);
  uv /= (size + 0.0001);

  float r = length(uv);
  float angle = atan(uv.y, uv.x);
  float depth = -log(r + 0.0001);

  float swing = sin(iTime * (SPEED * 0.5 + 0.1)) * rotationOsc;
  float waveOffset = sin(depth * 1.2 + iTime * speedBase * 0.25) * waviness;

  float angleNormalized = (angle / 6.2831853) + 0.5;
  float finalAngle = fract(angleNormalized + waveOffset + swing);

  float cableID = floor(finalAngle * CABLE_COUNT);
  float gvX = (fract(finalAngle * CABLE_COUNT) - 0.5);

  float rand = fract(sin(cableID * 12.9898) * 43758.5453);
  float randSpeed = (0.4 + rand * 0.6) * speedBase * PULSE_SPEED;
  float cableThick = baseThick * (0.6 + rand * 0.4);

  float3 cableCol = CABLE_COLOR;
  cableCol *= 1.0 + (rand - 0.5) * 0.4 * COLOR_VARIANCE;
  cableCol = mix(cableCol, PULSE_COLOR, rand * 0.25 * COLOR_VARIANCE);

  float scroll = depth + (iTime * randSpeed);
  float pulseFact = fract(scroll);

  float distToCore = abs(gvX);
  float wireMask = smoothstep(cableThick, cableThick - 0.05, distToCore);
  float rimGlow = smoothstep(borderWeight, 0.0, abs(distToCore - cableThick));

  float pulseThick = cableThick * PULSE_WIDTH;
  float pulseMask = smoothstep(pulseThick, pulseThick - 0.05 * PULSE_WIDTH, distToCore);

  float pulseDist = abs(pulseFact - 0.5);
  float pulseTotal = PULSE_LENGTH;
  float pulseCore = pulseTotal * (1.0 - PULSE_BLEND);
  float pulseLo = min(pulseCore, pulseTotal - 0.01);
  float dataPulse = 1.0 - smoothstep(pulseLo, pulseTotal, pulseDist);

  float aRim = rimGlow;
  float aPulse = clamp(dataPulse * pulseMask, 0.0, 1.0);

  float3 fiberCol = cableCol * aRim * 1.3 * GLOW + PULSE_COLOR * dataPulse * 3.0 * pulseMask;

  float distFade = smoothstep(0.0, FADE_NEAR, r) * (1.0 - smoothstep(EDGE_FADE_FROM, 1.0, r));
  float inten = clamp(aRim + aPulse, 0.0, 1.0) * distFade;

  float3 finalCol = fiberCol * BRIGHTNESS;
  float alpha = clamp(inten, 0.0, 1.0) * OPACITY;
  float3 outRgb = clamp(finalCol * alpha, 0.0, 1.0);
  return half4(half3(outRgb), half(alpha));
}
`);
