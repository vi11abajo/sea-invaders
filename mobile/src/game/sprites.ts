import { FilterMode, MipmapMode, Skia, useImage, type SkImage } from '@shopify/react-native-skia';
import { BOSS, CRAB, DROP, OCTOPI, type Layout } from '@sea-invaders/core';
import { useMemo } from 'react';
import { PixelRatio } from 'react-native';

/**
 * Read once on the JS thread; `draw.ts`'s worklet closes over this value rather than calling into
 * RN. Offscreen surfaces are sized in physical pixels using this ratio (spec: a several-hundred px
 * source sprite pre-scaled straight to dp size on a high-density screen was a ~12x reduction with no
 * filtering, then upscaled back — "extremely crushed"); `drawSpriteAt` scales back down to dp at
 * draw time.
 */
export const PIXEL_RATIO = PixelRatio.get();

export interface Sprites {
  octopi: { front: SkImage; hit: SkImage };
  /** Colour by `kind` (0..4): green, blue, violet, red, yellow. */
  crabs: SkImage[];
  /** Two extracted GIF frames per boss, colour by `kind` (1..5): green, blue, yellow, red, violet; `bosses[kind - 1]` (0-based). */
  bosses: [SkImage, SkImage][];
  /** One icon per `BoostType`, in `BOOST_INDEX` order. */
  boosts: SkImage[];
}

/**
 * Loads every sprite once via `useImage`. Returns `null` until all of them have decoded, so the
 * caller can hold the game loop and show a loading state instead of drawing with a missing image.
 */
export function useSprites(): Sprites | null {
  const front = useImage(require('../../assets/sprites/octopiFront.png'));
  const hit = useImage(require('../../assets/sprites/OctopiOoff.png'));

  // Crab colour order matches CRAB_COLORS in draw.ts: kind 0..4.
  const crabGreen = useImage(require('../../assets/sprites/crabGreen.png'));
  const crabBlue = useImage(require('../../assets/sprites/crabBlue.png'));
  const crabViolet = useImage(require('../../assets/sprites/crabViolet.png'));
  const crabRed = useImage(require('../../assets/sprites/crabRed.png'));
  const crabYellow = useImage(require('../../assets/sprites/crabYellow.png'));

  // Boss colour order: kind 1..5. Two GIF frames each, flipped every 60 ticks in draw.ts.
  const bossGreen0 = useImage(require('../../assets/sprites/crabBOSSGreen-0.png'));
  const bossGreen1 = useImage(require('../../assets/sprites/crabBOSSGreen-1.png'));
  const bossBlue0 = useImage(require('../../assets/sprites/crabBossBlue-0.png'));
  const bossBlue1 = useImage(require('../../assets/sprites/crabBossBlue-1.png'));
  const bossYellow0 = useImage(require('../../assets/sprites/crabBossYellow-0.png'));
  const bossYellow1 = useImage(require('../../assets/sprites/crabBossYellow-1.png'));
  const bossRed0 = useImage(require('../../assets/sprites/crabBossRed-0.png'));
  const bossRed1 = useImage(require('../../assets/sprites/crabBossRed-1.png'));
  const bossViolet0 = useImage(require('../../assets/sprites/crabBossViolet-0.png'));
  const bossViolet1 = useImage(require('../../assets/sprites/crabBossViolet-1.png'));

  // Boost icons, in BOOST_INDEX order (RAPID_FIRE .. SPEED_TAMER).
  const rapidFire = useImage(require('../../assets/sprites/boosts/rapidFire.png'));
  const iceFreeze = useImage(require('../../assets/sprites/boosts/iceFreeze.png'));
  const healthBoost = useImage(require('../../assets/sprites/boosts/healthBoost.png'));
  const pointsFreeze = useImage(require('../../assets/sprites/boosts/pointsFreeze.png'));
  const shieldBarrier = useImage(require('../../assets/sprites/boosts/shieldBarrier.png'));
  const autoTarget = useImage(require('../../assets/sprites/boosts/autoTarget.png'));
  const invincibility = useImage(require('../../assets/sprites/boosts/invincibility.png'));
  const multiShot = useImage(require('../../assets/sprites/boosts/multiShot.png'));
  const scoreMultiplier = useImage(require('../../assets/sprites/boosts/scoreMultiplier.png'));
  const waveBlast = useImage(require('../../assets/sprites/boosts/waveBlast.png'));
  const coinShower = useImage(require('../../assets/sprites/boosts/coinShower.png'));
  const gravityWell = useImage(require('../../assets/sprites/boosts/gravityWell.png'));
  const piercingBullets = useImage(require('../../assets/sprites/boosts/piercingBullets.png'));
  const randomChaos = useImage(require('../../assets/sprites/boosts/randomChaos.png'));
  const speedTamer = useImage(require('../../assets/sprites/boosts/speedTamer.png'));

  return useMemo(() => {
    if (
      front === null || hit === null ||
      crabGreen === null || crabBlue === null || crabViolet === null || crabRed === null || crabYellow === null ||
      bossGreen0 === null || bossGreen1 === null || bossBlue0 === null || bossBlue1 === null ||
      bossYellow0 === null || bossYellow1 === null || bossRed0 === null || bossRed1 === null ||
      bossViolet0 === null || bossViolet1 === null ||
      rapidFire === null || iceFreeze === null || healthBoost === null || pointsFreeze === null ||
      shieldBarrier === null || autoTarget === null || invincibility === null || multiShot === null ||
      scoreMultiplier === null || waveBlast === null || coinShower === null ||
      gravityWell === null || piercingBullets === null || randomChaos === null || speedTamer === null
    ) {
      return null;
    }
    return {
      octopi: { front, hit },
      crabs: [crabGreen, crabBlue, crabViolet, crabRed, crabYellow],
      bosses: [
        [bossGreen0, bossGreen1],
        [bossBlue0, bossBlue1],
        [bossYellow0, bossYellow1],
        [bossRed0, bossRed1],
        [bossViolet0, bossViolet1],
      ],
      boosts: [
        rapidFire, iceFreeze, healthBoost, pointsFreeze,
        shieldBarrier, autoTarget, invincibility, multiShot, scoreMultiplier,
        waveBlast, coinShower, gravityWell, piercingBullets,
        randomChaos, speedTamer,
      ],
    };
  }, [
    front, hit,
    crabGreen, crabBlue, crabViolet, crabRed, crabYellow,
    bossGreen0, bossGreen1, bossBlue0, bossBlue1, bossYellow0, bossYellow1, bossRed0, bossRed1, bossViolet0, bossViolet1,
    rapidFire, iceFreeze, healthBoost, pointsFreeze, shieldBarrier, autoTarget, invincibility, multiShot,
    scoreMultiplier, waveBlast, coinShower, gravityWell, piercingBullets, randomChaos, speedTamer,
  ]);
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A sprite ready for the UI-thread worklet to draw at `(left, top)`, already sized to `w x h` (dp). */
export interface PreparedSprite {
  image: SkImage;
  /** On-screen size in dp. `image` itself is `w * PIXEL_RATIO x h * PIXEL_RATIO` (physical pixels) when `scaled`. */
  w: number;
  h: number;
  /**
   * True when `image` is this sprite's own pre-scaled snapshot, sized `w * PIXEL_RATIO x h *
   * PIXEL_RATIO` physical pixels (draw.ts's fast path scales it back down to dp and draws it with
   * `canvas.drawImageOptions`); false when this sprite's own offscreen render failed and `image` is
   * the original, full-resolution asset instead (draw via `drawImageRectOptions` using `src`/`dest`,
   * both mip-filtered the same way). This is decided per sprite — one sprite's offscreen render
   * failing never affects another's.
   */
  scaled: boolean;
  /**
   * `image`'s own bounds, always matching `image`: `{0, 0, w * PIXEL_RATIO, h * PIXEL_RATIO}`
   * (physical pixels) when `scaled`, the original asset's own bounds otherwise. Read by the
   * `drawImageRectOptions` + `translate` fallback when `scaled` is false; the fast (`scaled`) path
   * doesn't read it (it draws the whole snapshot via `drawImageOptions`), but it's kept accurate
   * regardless so `src` always describes `image`'s real bounds.
   */
  src: Rect;
  /** Where `image` lands on screen, in dp — read only by the `scaled === false` fallback path. */
  dest: Rect;
}

/** INVINCIBILITY outline geometry, in dp (unscaled): a stroke can't be sized by `canvas.scale`
 * without also scaling its width, so the outline rect is precomputed here at each Octopi pose's
 * real on-screen size instead of built from a transform in the per-frame worklet. */
export const INVINCIBLE_INFLATE = 4;
export const INVINCIBLE_CORNER_R = 8;

/** ICE_FREEZE ice-cube geometry (owner ruling), in dp (unscaled): sized to each crab sprite,
 * inflated 2 dp on each side with a 6 dp corner radius — precomputed here for the same reason as
 * the INVINCIBILITY outline above (a fill can be sized by `canvas.scale`, but precomputing keeps
 * this on the same once-per-layout path as every other prepared sprite geometry). */
export const ICE_CUBE_INFLATE = 2;
export const ICE_CUBE_CORNER_R = 6;

export interface PreparedSprites {
  octopi: { front: PreparedSprite; hit: PreparedSprite };
  /**
   * One precomputed `SkRRect` per Octopi pose (`front`/`hit`), centred at the local origin and sized
   * to that pose's own `w x h` inflated by `INVINCIBLE_INFLATE` on each side. `draw.ts` only
   * `canvas.translate`s to Octopi's centre before drawing it — never reallocated per frame.
   */
  invincibleOutline: { front: ReturnType<typeof Skia.RRectXY>; hit: ReturnType<typeof Skia.RRectXY> };
  crabs: PreparedSprite[];
  /**
   * One precomputed `SkRRect` per crab kind (`crabs[kind]`), centred at the local origin and sized
   * to that kind's own `w x h` inflated by `ICE_CUBE_INFLATE` on each side. `draw.ts` only
   * `canvas.translate`s to each crab's centre before drawing it — never reallocated per frame.
   */
  iceCubes: ReturnType<typeof Skia.RRectXY>[];
  /** `bosses[kind - 1] = [frame0, frame1]`, both pre-scaled to `BOSS.width x BOSS.height`. */
  bosses: [PreparedSprite, PreparedSprite][];
  boosts: PreparedSprite[];
}

/**
 * Renders `image` into an offscreen surface sized in PHYSICAL pixels — `round(w * PIXEL_RATIO) x
 * round(h * PIXEL_RATIO)`, not dp — so a large reduction (e.g. a several-hundred px source down to
 * a few dozen dp) is mip-filtered by Skia instead of nearest-sampled straight to a blurry/crushed
 * dp-sized image that then gets upscaled again by the OS compositor. `drawImageRectOptions` with
 * `FilterMode.Linear`/`MipmapMode.Linear` does that downsample; cropping `src` first (for an
 * aspect-fill) still works the same as before. Snapshots the result and converts it to a
 * non-texture image `drawSpriteAt` (draw.ts) draws back down to dp size at draw time. Returns null
 * if the surface, its snapshot, or the conversion is unavailable on this device/driver, or if any
 * of it throws.
 */
function renderScaled(image: SkImage, w: number, h: number, src?: Rect): SkImage | null {
  try {
    const width = Math.max(1, Math.round(w * PIXEL_RATIO));
    const height = Math.max(1, Math.round(h * PIXEL_RATIO));
    const surface = Skia.Surface.MakeOffscreen(width, height);
    if (surface === null) return null;
    const canvas = surface.getCanvas();
    const paint = Skia.Paint();
    const from = src ?? { x: 0, y: 0, width: image.width(), height: image.height() };
    canvas.drawImageRectOptions(image, from, { x: 0, y: 0, width, height }, FilterMode.Linear, MipmapMode.Linear, paint);
    surface.flush();
    const snapshot = surface.makeImageSnapshot();
    return snapshot.makeNonTextureImage();
  } catch {
    return null;
  }
}

/** `w x h` for `image` scaled to fit inside a `box x box` square, keeping its own aspect ratio. */
function containSize(image: SkImage, box: number): { w: number; h: number } {
  const imgW = image.width();
  const imgH = image.height();
  if (imgW >= imgH) {
    return { w: box, h: box * (imgH / imgW) };
  }
  return { w: box * (imgW / imgH), h: box };
}

/** The INVINCIBILITY outline `SkRRect` for a prepared sprite of size `w x h`, centred at `(0, 0)`. */
function outlineRRect(sprite: PreparedSprite): ReturnType<typeof Skia.RRectXY> {
  const w = sprite.w + INVINCIBLE_INFLATE * 2;
  const h = sprite.h + INVINCIBLE_INFLATE * 2;
  return Skia.RRectXY({ x: -w / 2, y: -h / 2, width: w, height: h }, INVINCIBLE_CORNER_R, INVINCIBLE_CORNER_R);
}

/** The ICE_FREEZE ice-cube `SkRRect` for a prepared sprite of size `w x h`, centred at `(0, 0)`. */
function iceCubeRRect(sprite: PreparedSprite): ReturnType<typeof Skia.RRectXY> {
  const w = sprite.w + ICE_CUBE_INFLATE * 2;
  const h = sprite.h + ICE_CUBE_INFLATE * 2;
  return Skia.RRectXY({ x: -w / 2, y: -h / 2, width: w, height: h }, ICE_CUBE_CORNER_R, ICE_CUBE_CORNER_R);
}

function preparedFrom(image: SkImage, w: number, h: number, src?: Rect): PreparedSprite {
  const scaledImage = renderScaled(image, w, h, src);
  const ok = scaledImage !== null;
  const fallbackSrc = src ?? { x: 0, y: 0, width: image.width(), height: image.height() };
  return {
    image: ok ? scaledImage : image,
    w,
    h,
    scaled: ok,
    // `src` always matches `image`'s own bounds: the scaled snapshot is `renderScaled`'s physical-
    // pixel surface size (`w * PIXEL_RATIO x h * PIXEL_RATIO`), the original asset's own bounds
    // when this particular sprite fell back instead — never a mismatched pair. `dest` (below)
    // stays in dp either way: the fallback path draws straight to the final on-screen size in one
    // step, with no offscreen surface in between.
    src: ok ? { x: 0, y: 0, width: w * PIXEL_RATIO, height: h * PIXEL_RATIO } : fallbackSrc,
    dest: { x: 0, y: 0, width: w, height: h },
  };
}

/**
 * Pre-scales every sprite to its exact on-screen size once, at physical-pixel resolution with mip
 * filtering (Task 4's FPS ruling, plus the crushed-sprite fix): the UI-thread worklet then draws
 * each with a single `canvas.drawImageOptions` call, no per-frame resampling. Called from a
 * `useMemo` in `GameScreen` keyed on `sprites`/`layout`, so it only reruns when either changes.
 */
export function prepareSprites(sprites: Sprites, layout: Layout): PreparedSprites {
  const k = layout.scale;

  const octopiW = OCTOPI.size * k;
  const front = preparedFrom(sprites.octopi.front, octopiW, octopiW * (sprites.octopi.front.height() / sprites.octopi.front.width()));
  const hit = preparedFrom(sprites.octopi.hit, octopiW, octopiW * (sprites.octopi.hit.height() / sprites.octopi.hit.width()));
  const invincibleOutline = { front: outlineRRect(front), hit: outlineRRect(hit) };

  const crabSize = CRAB.size * k;
  const crabs = sprites.crabs.map((img) => preparedFrom(img, crabSize, crabSize));
  const iceCubes = crabs.map(iceCubeRRect);

  const bossW = BOSS.width * k;
  const bossH = BOSS.height * k;
  const bosses = sprites.bosses.map(
    ([frame0, frame1]) => [preparedFrom(frame0, bossW, bossH), preparedFrom(frame1, bossW, bossH)] as [PreparedSprite, PreparedSprite],
  );

  const dropBox = DROP.size * k;
  const boosts = sprites.boosts.map((img) => {
    const { w, h } = containSize(img, dropBox);
    return preparedFrom(img, w, h);
  });

  return { octopi: { front, hit }, invincibleOutline, crabs, iceCubes, bosses, boosts };
}

/** `prepareSprites`, memoized on `sprites`/`layout` so it rebuilds only when either changes. */
export function usePreparedSprites(sprites: Sprites | null, layout: Layout): PreparedSprites | null {
  return useMemo(() => (sprites === null ? null : prepareSprites(sprites, layout)), [sprites, layout]);
}
