import {
  BlendColor, Blur, Canvas, ColorMatrix, Group, Image, LinearGradient, Paint, Path, Rect, Skia, useImage, vec,
  type SkImage, type SkPath,
} from '@shopify/react-native-skia';
import { levelById, LEVELS_PER_REEF } from '@sea-invaders/core';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useDerivedValue, useSharedValue, withRepeat, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { KeyArtScrim } from '../ui/KeyArtScrim';
import { MOTION } from '../ui/tokens';
import {
  REEF_KEY_ART, REEF_KEY_ART_BACKGROUND, REEF_KEY_ART_BLEND, REEF_KEY_ART_BOSS_LOOM, REEF_KEY_ART_DIM, REEF_KEY_ART_SCRIM,
  reefKeyArtTint,
} from './reefBackground';
import { FIRST_VETERAN_REEF, REEF_ACCENT, REEF_WORLD } from './reefs';

/** Ruling R66 (fix round): on top of `REEF_KEY_ART_DIM`, reefs `FIRST_VETERAN_REEF` and up (the
 * second campaign) get this much extra dim so they read deeper/darker than the first five. */
const REEF_KEY_ART_DEEP_DIM = 0.15;

/** Flora bar sizes and sway periods, `CampaignMap.dc.html`'s `FLORA` table. Bars 0, 3, 6 use the reef's `floraAccent`. */
const FLORA = [
  { w: 22, h: 62, ms: 3200 }, { w: 34, h: 34, ms: 4100 }, { w: 16, h: 92, ms: 2800 }, { w: 48, h: 28, ms: 5000 },
  { w: 18, h: 70, ms: 3600 }, { w: 28, h: 46, ms: 4400 }, { w: 16, h: 56, ms: 3000 }, { w: 24, h: 80, ms: 4800 },
] as const;
const DOME_HEIGHT = 230;
const FLORA_HEIGHT = 150;
const BOSS_LOOM_TOP = 104;
const BOSS_LOOM_SIZE = 330;
const BOSS_LOOM_OPACITY = 0.14;
const BOSS_LOOM_BLUR = 3;
/** The top glow band's opacity on the map, and the dimmer one under a run. */
const GLOW_OPACITY = { map: 0.5, play: 0.3 } as const;
/** Under a run the rays run at half strength, like the generic play backdrop, so crabs and shots stay readable. */
const RAYS_OPACITY = { map: 1, play: 0.5 } as const;

/**
 * CSS `saturate(.6)` as a colour matrix (W3C filter-effects formula, s = 0.6): the looming
 * background boss (`CampaignMap.dc.html`: `filter: blur(1px) saturate(.6)`) is dimmed, not fully
 * greyscaled.
 */
const LOOM_SATURATE_MATRIX = [
  0.6852, 0.286, 0.0288, 0, 0,
  0.0852, 0.886, 0.0288, 0, 0,
  0.0852, 0.286, 0.6288, 0, 0,
  0, 0, 0, 1, 0,
];

export type ReefBackdropVariant = 'map' | 'play';

interface ReefBackdropProps {
  /** Reef 1..10. */
  reef: number;
  /**
   * 'map' is the campaign map's world as designed; 'play' sits under a run: dimmer glow, rays at
   * half strength, and never the looming boss (the real crabs or boss are on the field).
   */
  variant?: ReefBackdropVariant;
  /** The reef boss's sprite, looming behind the map; ignored under a run. */
  bossSprite?: SkImage | null;
  /** How far above the screen's bottom edge the seabed dome and flora sit, in dp (the map keeps its bottom panel clear). */
  floorBottom?: number;
}

/**
 * One reef's world (`CampaignMap.dc.html`): its water gradient, the top glow band, two swaying light
 * rays, the seabed dome, swaying flora and, on the map, its boss looming in the water. The campaign
 * map and every screen of that reef's levels draw it, so a level looks like the reef it belongs to.
 */
export function ReefBackdrop({ reef, variant = 'map', bossSprite = null, floorBottom = 0 }: ReefBackdropProps) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <ReefWorld reef={reef} variant={variant} bossSprite={variant === 'map' ? bossSprite : null} floorBottom={floorBottom} />
      {/* On the key art the seabed dome and the flora are gone (the owner: they hid the reef) and the header gets a scrim. */}
      {REEF_KEY_ART_BACKGROUND ? (
        <KeyArtScrim opacity={REEF_KEY_ART_SCRIM.opacity} fraction={REEF_KEY_ART_SCRIM.fraction} />
      ) : (
        <Flora reef={reef} floorBottom={floorBottom} />
      )}
    </View>
  );
}

function toTransparent(rgba: string): string {
  return rgba.replace(/[\d.]+\)$/, '0)');
}

function buildDomePath(width: number, height: number, floorBottom: number): SkPath {
  const rx = width * 0.6;
  const ry = DOME_HEIGHT;
  const cx = width / 2;
  const cy = height - floorBottom;
  const path = Skia.Path.Make();
  path.addArc(Skia.XYWHRect(cx - rx, cy - ry, rx * 2, ry * 2), 180, 180);
  path.close();
  return path;
}

function ReefWorld({ reef, variant, bossSprite, floorBottom }: {
  reef: number; variant: ReefBackdropVariant; bossSprite: SkImage | null; floorBottom: number;
}) {
  const { width, height } = useWindowDimensions();
  const world = REEF_WORLD[reef - 1]!;

  const rayA = useSharedValue<number>(MOTION.raysMin);
  const rayB = useSharedValue<number>(MOTION.raysMax);
  const drift = useSharedValue(0);

  useEffect(() => {
    const easing = Easing.inOut(Easing.quad);
    rayA.value = withRepeat(withTiming(MOTION.raysMax, { duration: 4500, easing }), -1, true);
    rayB.value = withRepeat(withTiming(MOTION.raysMin, { duration: 5500, easing }), -1, true);
    drift.value = withRepeat(withTiming(1, { duration: 3500, easing }), -1, true);
  }, [rayA, rayB, drift]);

  // Drift 0..-10 dp, matching CSS `@keyframes drift`: a plain numeric derived value (no array/object
  // rebuilt per frame) fed straight into `Image`'s own `y`.
  const bossY = useDerivedValue(() => BOSS_LOOM_TOP + drift.value * -10);
  // Built once per screen size — never rebuilt inside a worklet.
  const domePath = useMemo(() => buildDomePath(width, height, floorBottom), [width, height, floorBottom]);
  const bossLeft = width / 2 - BOSS_LOOM_SIZE / 2;
  // The key art decodes once per mount; the water gradient underneath shows until it has.
  const keyArt = useImage(REEF_KEY_ART_BACKGROUND ? REEF_KEY_ART : null);
  // The looming boss: the design's faint ghost on the gradient, a clearer figure on the busy art.
  const bossLoom = REEF_KEY_ART_BACKGROUND ? REEF_KEY_ART_BOSS_LOOM : { opacity: BOSS_LOOM_OPACITY, blur: BOSS_LOOM_BLUR };
  // Ruling R66 (fix round): reefs 6-10 tint the key art with the reef's own accent instead of the
  // boss colour (reef 9's accent and reef 4's boss colour are both hue 0, which made the two
  // backdrops read pixel-identical), plus an extra dim, so the second campaign reads deeper and
  // darker. Below `FIRST_VETERAN_REEF`, unchanged: the boss's own colour, from its real kind
  // (`levelById(...).boss`), not `reef as BossKind`.
  const isDeepReef = reef >= FIRST_VETERAN_REEF;
  const keyArtTint = isDeepReef ? REEF_ACCENT[reef - 1]! : reefKeyArtTint(levelById(reef * LEVELS_PER_REEF).boss!);
  const keyArtDim = REEF_KEY_ART_DIM[variant] + (isDeepReef ? REEF_KEY_ART_DEEP_DIM : 0);

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Rect x={0} y={0} width={width} height={height}>
        <LinearGradient start={vec(0, 0)} end={vec(0, height)} colors={[...world.bg.colors]} positions={[...world.bg.positions]} />
      </Rect>
      {REEF_KEY_ART_BACKGROUND ? (
        keyArt !== null && (
          <>
            <Image image={keyArt} x={0} y={0} width={width} height={height} fit="cover">
              <BlendColor color={keyArtTint} mode={REEF_KEY_ART_BLEND} />
            </Image>
            <Rect x={0} y={0} width={width} height={height} color={`rgba(0,0,0,${keyArtDim})`} />
          </>
        )
      ) : (
        <>
          <Group layer={<Paint><Blur blur={70} mode="decal" /></Paint>} opacity={GLOW_OPACITY[variant]}>
            <Rect x={-width * 0.25} y={-height * 0.1} width={width * 1.5} height={height * 0.45}>
              <LinearGradient start={vec(0, 0)} end={vec(width, 0)} colors={[...world.glow]} />
            </Rect>
          </Group>
          <Group opacity={RAYS_OPACITY[variant]} layer={<Paint><Blur blur={18} mode="decal" /></Paint>}>
            <Ray x={width * 0.14} width={width * 0.26} h={height} skew={-0.244} color={world.ray} opacity={rayA} />
            <Ray x={width * 0.58} width={width * 0.18} h={height} skew={-0.349} color={world.ray2} opacity={rayB} />
          </Group>
        </>
      )}
      {bossSprite !== null && (
        <Image image={bossSprite} x={bossLeft} y={bossY} width={BOSS_LOOM_SIZE} height={BOSS_LOOM_SIZE} opacity={bossLoom.opacity} fit="contain">
          <ColorMatrix matrix={LOOM_SATURATE_MATRIX} />
          <Blur blur={bossLoom.blur} mode="decal" />
        </Image>
      )}
      {!REEF_KEY_ART_BACKGROUND && (
        <Path path={domePath} style="fill">
          <LinearGradient
            start={vec(0, height - floorBottom - DOME_HEIGHT)}
            end={vec(0, height - floorBottom)}
            colors={[...world.floor.colors]}
            positions={[...world.floor.positions]}
          />
        </Path>
      )}
    </Canvas>
  );
}

function Ray({ x, width, h, skew, color, opacity }: {
  x: number; width: number; h: number; skew: number; color: string; opacity: SharedValue<number>;
}) {
  return (
    <Group opacity={opacity} origin={vec(x, 0)} transform={[{ skewX: skew }]}>
      <Rect x={x} y={-h * 0.1} width={width} height={h * 0.9}>
        <LinearGradient start={vec(0, 0)} end={vec(0, h * 0.8)} colors={[color, toTransparent(color)]} />
      </Rect>
    </Group>
  );
}

function Flora({ reef, floorBottom }: { reef: number; floorBottom: number }) {
  const world = REEF_WORLD[reef - 1]!;
  const accent = REEF_ACCENT[reef - 1]!;
  return (
    <View style={[styles.flora, { bottom: floorBottom }]} pointerEvents="none">
      {FLORA.map((f, i) => (
        <FloraBar key={i} w={f.w} h={f.h} durationMs={f.ms} color={i % 3 === 0 ? world.floraAccent : accent} />
      ))}
    </View>
  );
}

function FloraBar({ w, h, durationMs, color }: { w: number; h: number; durationMs: number; color: string }) {
  const sway = useSharedValue(0);
  useEffect(() => {
    sway.value = withRepeat(withTiming(1, { duration: durationMs, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [durationMs, sway]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${(sway.value - 0.5) * 6}deg` }] }));
  return (
    <Animated.View
      style={[
        { width: w, height: h, borderTopLeftRadius: w / 2, borderTopRightRadius: w / 2, backgroundColor: color, opacity: 0.5 },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  flora: {
    position: 'absolute', left: 0, right: 0, height: FLORA_HEIGHT,
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 6,
  },
});
