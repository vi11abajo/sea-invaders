import { FilterMode, MipmapMode, Skia, loadData, useImage, type SkColorFilter, type SkImage, type SkSurface } from '@shopify/react-native-skia';
import { BOSS, CRAB, DROP, OCTOPI, type Layout } from '@sea-invaders/core';
import { useEffect, useMemo, useState } from 'react';
import { PixelRatio } from 'react-native';
import type { SkinIndex } from '../loadout/items';
import { tintMatrix } from '../shop/tints';
import { SKIN_FILTERS } from './skins';

/**
 * Read once on the JS thread; `draw.ts`'s worklet closes over this value rather than calling into
 * RN. Offscreen surfaces are sized in physical pixels using this ratio (spec: a several-hundred px
 * source sprite pre-scaled straight to dp size on a high-density screen was a ~12x reduction with no
 * filtering, then upscaled back — "extremely crushed"); `drawSpriteAt` scales back down to dp at
 * draw time.
 */
export const PIXEL_RATIO = PixelRatio.get();

/** Octopi's front pose: the in-game sprite and the source of every UI snapshot (`useOctopiArt`). */
const OCTOPI_FRONT = require('../../assets/sprites/octopiFront.png');

export interface Sprites {
  octopi: { front: SkImage; hit: SkImage };
  /** Colour by `kind` (0..4): green, blue, violet, red, yellow. */
  crabs: SkImage[];
  /** ICE_FREEZE indication (owner ruling): three ice sprites, drawn one per crab (`draw.ts` picks a
   * deterministic variant per crab so it doesn't flicker). Index order is arbitrary — the three are
   * visually interchangeable. */
  ice: SkImage[];
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
  const front = useImage(OCTOPI_FRONT);
  const hit = useImage(require('../../assets/sprites/OctopiOoff.png'));

  // Crab colour order matches CRAB_COLORS in draw.ts: kind 0..4.
  const crabGreen = useImage(require('../../assets/sprites/crabGreen.png'));
  const crabBlue = useImage(require('../../assets/sprites/crabBlue.png'));
  const crabViolet = useImage(require('../../assets/sprites/crabViolet.png'));
  const crabRed = useImage(require('../../assets/sprites/crabRed.png'));
  const crabYellow = useImage(require('../../assets/sprites/crabYellow.png'));

  // ICE_FREEZE indication (owner ruling): three interchangeable ice sprites.
  const ice1 = useImage(require('../../assets/sprites/ice1.png'));
  const ice2 = useImage(require('../../assets/sprites/ice2.png'));
  const ice3 = useImage(require('../../assets/sprites/ice3.png'));

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
      ice1 === null || ice2 === null || ice3 === null ||
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
      ice: [ice1, ice2, ice3],
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
    ice1, ice2, ice3,
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
  /**
   * The colour filter the `scaled === false` fallback must draw `image` through: an Octopi pose's
   * skin tint when its tinted snapshot failed and `image` is the untinted original. Null when the
   * snapshot already carries the tint, and for every sprite that has none.
   */
  filter: SkColorFilter | null;
}

export interface PreparedSprites {
  /** Octopi's two poses in the active skin, tinted into their snapshots (`prepareOctopi`). */
  octopi: { front: PreparedSprite; hit: PreparedSprite };
  crabs: PreparedSprite[];
  /**
   * ICE_FREEZE indication (owner ruling): the three ice sprites, pre-scaled to fit inside a
   * `CRAB.size * 1.3` square (keeping each image's own aspect ratio). `draw.ts` picks one of the
   * three per crab deterministically (by crab offset + kind) and draws it centred on that crab via
   * `drawSpriteAt` — same pre-scaled/mip-filtered path as every other sprite here.
   */
  ice: PreparedSprite[];
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
 * non-texture image `drawSpriteAt` (draw.ts) draws back down to dp size at draw time. A `filter`
 * (an Octopi skin's `ColorMatrix`) recolours the pixels in the same draw, so a tinted snapshot costs
 * nothing more than a plain one. Returns null if the surface, its snapshot, or the conversion is
 * unavailable on this device/driver, or if any of it throws.
 */
function renderScaled(
  image: SkImage,
  w: number,
  h: number,
  src?: Rect,
  filter: SkColorFilter | null = null,
  makeSurface: (width: number, height: number) => SkSurface | null = (width, height) => Skia.Surface.MakeOffscreen(width, height),
): SkImage | null {
  try {
    const width = Math.max(1, Math.round(w * PIXEL_RATIO));
    const height = Math.max(1, Math.round(h * PIXEL_RATIO));
    const surface = makeSurface(width, height);
    if (surface === null) return null;
    const canvas = surface.getCanvas();
    const paint = Skia.Paint();
    if (filter !== null) paint.setColorFilter(filter);
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

function preparedFrom(image: SkImage, w: number, h: number, src?: Rect, filter: SkColorFilter | null = null): PreparedSprite {
  const scaledImage = renderScaled(image, w, h, src, filter);
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
    // A failed snapshot falls back to the untinted original, so the tint moves to draw time.
    filter: ok ? null : filter,
  };
}

type PreparedOctopi = Pick<PreparedSprites, 'octopi'>;
type PreparedWorld = Omit<PreparedSprites, 'octopi'>;

/**
 * Octopi's front and hit poses in `skin`, pre-scaled like every other sprite with the skin's
 * `ColorMatrix` applied in the same offscreen draw (both poses share the body colour `#1C6DC6` the
 * matrix is calibrated on). The base skin draws untouched.
 */
export function prepareOctopi(sprites: Sprites, layout: Layout, skin: SkinIndex): PreparedOctopi {
  const filter = SKIN_FILTERS[skin] ?? null;
  const octopiW = OCTOPI.size * layout.scale;
  const front = preparedFrom(sprites.octopi.front, octopiW, octopiW * (sprites.octopi.front.height() / sprites.octopi.front.width()), undefined, filter);
  const hit = preparedFrom(sprites.octopi.hit, octopiW, octopiW * (sprites.octopi.hit.height() / sprites.octopi.hit.width()), undefined, filter);
  return { octopi: { front, hit } };
}

/** Every sprite but Octopi's: crabs, ice, bosses and boost icons. */
function prepareWorld(sprites: Sprites, layout: Layout): PreparedWorld {
  const k = layout.scale;

  const crabSize = CRAB.size * k;
  const crabs = sprites.crabs.map((img) => preparedFrom(img, crabSize, crabSize));

  const iceBox = CRAB.size * 1.3 * k;
  const ice = sprites.ice.map((img) => {
    const { w, h } = containSize(img, iceBox);
    return preparedFrom(img, w, h);
  });

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

  return { crabs, ice, bosses, boosts };
}

/**
 * Pre-scales every sprite to its exact on-screen size once, at physical-pixel resolution with mip
 * filtering (Task 4's FPS ruling, plus the crushed-sprite fix): the UI-thread worklet then draws
 * each with a single `canvas.drawImageOptions` call, no per-frame resampling. Octopi comes out in
 * `skin` (`prepareOctopi`).
 */
export function prepareSprites(sprites: Sprites, layout: Layout, skin: SkinIndex): PreparedSprites {
  return { ...prepareWorld(sprites, layout), ...prepareOctopi(sprites, layout, skin) };
}

/**
 * `prepareSprites` for `GameScreen`, memoized in two parts: the world sprites rebuild only when
 * `sprites`/`layout` change, Octopi's two tinted poses also when the active skin changes.
 */
export function usePreparedSprites(sprites: Sprites | null, layout: Layout, skin: SkinIndex): PreparedSprites | null {
  const world = useMemo(() => (sprites === null ? null : prepareWorld(sprites, layout)), [sprites, layout]);
  const octopi = useMemo(() => (sprites === null ? null : prepareOctopi(sprites, layout, skin)), [sprites, layout, skin]);
  return useMemo(() => (world === null || octopi === null ? null : { ...world, ...octopi }), [world, octopi]);
}

/*
 * Octopi on UI screens (Home's hero, the result pose, Shop and Profile thumbs): small snapshots of
 * the front pose, recoloured and pre-scaled through the same `renderScaled` path as the game. The
 * ~2300 px asset decodes to ~20 MB, so it is decoded only while a snapshot is being made and
 * released as soon as none is waiting; screens hold only their own snapshots (a 160 dp hero is
 * about 1 MB at 3x, a 56 dp thumb about 0.1 MB).
 */

/** Snapshots kept for reuse across screens; the oldest is dropped past this count (a screen keeps its own reference). */
const ART_LIMIT = 24;
const artCache = new Map<string, SkImage>();
const artJobs = new Map<string, Promise<SkImage | null>>();
/** The decoded asset while any snapshot waits on it; null otherwise. */
let artSource: Promise<SkImage | null> | null = null;
let artWaiting = 0;

function artKey(tint: string | null, px: number): string {
  return `${tint ?? 'base'}@${px}`;
}

function rememberArt(key: string, image: SkImage): void {
  artCache.delete(key);
  artCache.set(key, image);
  if (artCache.size > ART_LIMIT) {
    const oldest = artCache.keys().next().value;
    if (oldest !== undefined) artCache.delete(oldest);
  }
}

/**
 * Renders `source` recoloured to `tint` into a snapshot that fits a `px x px` physical-pixel square,
 * keeping its aspect ratio. Falls back to a CPU surface where the GPU offscreen one is unavailable,
 * so a UI Octopi never goes missing.
 */
function renderArt(source: SkImage, tint: string | null, px: number): SkImage | null {
  const { w, h } = containSize(source, px / PIXEL_RATIO);
  const filter = tint === null ? null : Skia.ColorFilter.MakeMatrix(tintMatrix(tint));
  return (
    renderScaled(source, w, h, undefined, filter) ??
    renderScaled(source, w, h, undefined, filter, (width, height) => Skia.Surface.Make(width, height))
  );
}

function requestArt(tint: string | null, px: number): Promise<SkImage | null> {
  const key = artKey(tint, px);
  const cached = artCache.get(key);
  if (cached !== undefined) {
    rememberArt(key, cached);
    return Promise.resolve(cached);
  }
  const running = artJobs.get(key);
  if (running !== undefined) return running;
  artWaiting += 1;
  if (artSource === null) {
    // Started inside the chain so a failure to resolve the asset lands in the catch, not the caller.
    artSource = Promise.resolve()
      .then(() => loadData(OCTOPI_FRONT, (data) => Skia.Image.MakeImageFromEncoded(data)))
      .catch(() => null);
  }
  const source = artSource;
  const job = source
    .then((image) => {
      if (image === null) return null;
      const art = renderArt(image, tint, px);
      if (art !== null) rememberArt(key, art);
      return art;
    })
    .catch(() => null)
    .finally(() => {
      artJobs.delete(key);
      artWaiting -= 1;
      if (artWaiting === 0 && artSource === source) {
        // Nothing else waits on the decoded asset: release its ~20 MB now rather than at GC.
        artSource = null;
        void source.then((image) => image?.dispose());
      }
    });
  artJobs.set(key, job);
  return job;
}

/**
 * Makes the snapshot `useOctopiArt(tint, box)` will ask for from an already decoded front pose (the
 * game's own sprite), so a later screen finds it ready without decoding the asset again.
 */
export function primeOctopiArt(source: SkImage, tint: string | null, box: number): void {
  const px = Math.round(box * PIXEL_RATIO);
  if (px <= 0) return;
  const key = artKey(tint, px);
  if (artCache.has(key) || artJobs.has(key)) return;
  const art = renderArt(source, tint, px);
  if (art !== null) rememberArt(key, art);
}

/**
 * Octopi's front pose recoloured to `tint` (null = its own colours, otherwise a `shop/tints.ts`
 * colour), pre-scaled to fit a `box x box` dp square at physical pixels: draw it into that square
 * (`fit="contain"`) and it lands 1:1 on the screen's pixels. Null until the snapshot is ready, or
 * while `box` is 0 (not laid out yet).
 */
export function useOctopiArt(tint: string | null, box: number): SkImage | null {
  const px = Math.round(box * PIXEL_RATIO);
  const key = artKey(tint, px);
  const [held, setHeld] = useState<{ key: string; image: SkImage } | null>(null);
  useEffect(() => {
    if (px <= 0) return undefined;
    let alive = true;
    void requestArt(tint, px).then((image) => {
      if (alive && image !== null) setHeld({ key, image });
    });
    return () => {
      alive = false;
    };
  }, [key, tint, px]);
  if (px <= 0) return null;
  if (held !== null && held.key === key) return held.image;
  // A snapshot another screen already made draws on the first frame, before the effect above holds it.
  return artCache.get(key) ?? null;
}
