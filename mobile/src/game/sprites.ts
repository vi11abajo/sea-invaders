import { FilterMode, MipmapMode, Skia, loadData, useImage, type SkColorFilter, type SkImage, type SkSurface } from '@shopify/react-native-skia';
import { BOSS, CRAB, DROP, OCTOPI, type Layout } from '@sea-invaders/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PixelRatio } from 'react-native';
import { lookKey, type Look } from './looks';
import { tintFilter } from './skins';

/**
 * Read once on the JS thread; `draw.ts`'s worklet closes over this value rather than calling into
 * RN. Offscreen surfaces are sized in physical pixels using this ratio: a several-hundred px
 * source sprite pre-scaled straight to dp size on a high-density screen was a ~12x reduction with no
 * filtering, then upscaled back — extremely crushed; `drawSpriteAt` scales back down to dp at
 * draw time.
 */
export const PIXEL_RATIO = PixelRatio.get();

/** The base Octopi's front pose: the in-game sprite and the source of every base or tint UI snapshot (`useOctopiArt`). */
const OCTOPI_FRONT = require('../../assets/sprites/octopiFront.png');

export interface Sprites {
  octopi: { front: SkImage; hit: SkImage };
  /**
   * Colour by `kind` (0..9): 0-4 the legacy green/blue/violet/red/yellow, 5-9 the reefs 6-10
   * veterans in the same order (`TYPE_COLOUR`, `core/src/config.ts`) — warden (green), herald
   * (blue), bubbler (yellow), bombardier (red), patriarch (violet).
   */
  crabs: SkImage[];
  /** ICE_FREEZE indication: three ice sprites, drawn one per crab (`draw.ts` picks a
   * deterministic variant per crab so it doesn't flicker). Index order is arbitrary — the three are
   * visually interchangeable. */
  ice: SkImage[];
  /**
   * Two extracted GIF frames per boss, colour by `kind` (1..10): 1-5 the legacy green/blue/yellow/
   * red/violet, 6-10 the reefs 6-10 five (Templar, Castellan, Corsair, Tyrant, Huntsman) in the same
   * colour order; `bosses[kind - 1]` (0-based).
   */
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

  // The reefs 6-10 veteran crabs, colour by kind 5..9 (warden, herald, bubbler, bombardier,
  // patriarch — `TYPE_COLOUR`, `core/src/config.ts`): green, blue, yellow, red, violet.
  const crabVetGreen = useImage(require('../../assets/sprites/crabVetGreen.png'));
  const crabVetBlue = useImage(require('../../assets/sprites/crabVetBlue.png'));
  const crabVetYellow = useImage(require('../../assets/sprites/crabVetYellow.png'));
  const crabVetRed = useImage(require('../../assets/sprites/crabVetRed.png'));
  const crabVetViolet = useImage(require('../../assets/sprites/crabVetViolet.png'));

  // ICE_FREEZE indication: three interchangeable ice sprites.
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

  // The reefs 6-10 bosses, kind 6..10 (Templar, Castellan, Corsair, Tyrant, Huntsman), same
  // green/blue/yellow/red/violet colour order as the legacy five. Two frames each, flipped every 60
  // ticks in draw.ts, same as the legacy bosses.
  const bossVetGreen0 = useImage(require('../../assets/sprites/crabBossVetGreen-0.png'));
  const bossVetGreen1 = useImage(require('../../assets/sprites/crabBossVetGreen-1.png'));
  const bossVetBlue0 = useImage(require('../../assets/sprites/crabBossVetBlue-0.png'));
  const bossVetBlue1 = useImage(require('../../assets/sprites/crabBossVetBlue-1.png'));
  const bossVetYellow0 = useImage(require('../../assets/sprites/crabBossVetYellow-0.png'));
  const bossVetYellow1 = useImage(require('../../assets/sprites/crabBossVetYellow-1.png'));
  const bossVetRed0 = useImage(require('../../assets/sprites/crabBossVetRed-0.png'));
  const bossVetRed1 = useImage(require('../../assets/sprites/crabBossVetRed-1.png'));
  const bossVetViolet0 = useImage(require('../../assets/sprites/crabBossVetViolet-0.png'));
  const bossVetViolet1 = useImage(require('../../assets/sprites/crabBossVetViolet-1.png'));

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
      crabVetGreen === null || crabVetBlue === null || crabVetYellow === null || crabVetRed === null || crabVetViolet === null ||
      ice1 === null || ice2 === null || ice3 === null ||
      bossGreen0 === null || bossGreen1 === null || bossBlue0 === null || bossBlue1 === null ||
      bossYellow0 === null || bossYellow1 === null || bossRed0 === null || bossRed1 === null ||
      bossViolet0 === null || bossViolet1 === null ||
      bossVetGreen0 === null || bossVetGreen1 === null || bossVetBlue0 === null || bossVetBlue1 === null ||
      bossVetYellow0 === null || bossVetYellow1 === null || bossVetRed0 === null || bossVetRed1 === null ||
      bossVetViolet0 === null || bossVetViolet1 === null ||
      rapidFire === null || iceFreeze === null || healthBoost === null || pointsFreeze === null ||
      shieldBarrier === null || autoTarget === null || invincibility === null || multiShot === null ||
      scoreMultiplier === null || waveBlast === null || coinShower === null ||
      gravityWell === null || piercingBullets === null || randomChaos === null || speedTamer === null
    ) {
      return null;
    }
    return {
      octopi: { front, hit },
      crabs: [
        crabGreen, crabBlue, crabViolet, crabRed, crabYellow,
        crabVetGreen, crabVetBlue, crabVetYellow, crabVetRed, crabVetViolet,
      ],
      ice: [ice1, ice2, ice3],
      bosses: [
        [bossGreen0, bossGreen1],
        [bossBlue0, bossBlue1],
        [bossYellow0, bossYellow1],
        [bossRed0, bossRed1],
        [bossViolet0, bossViolet1],
        [bossVetGreen0, bossVetGreen1],
        [bossVetBlue0, bossVetBlue1],
        [bossVetYellow0, bossVetYellow1],
        [bossVetRed0, bossVetRed1],
        [bossVetViolet0, bossVetViolet1],
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
    crabVetGreen, crabVetBlue, crabVetYellow, crabVetRed, crabVetViolet,
    ice1, ice2, ice3,
    bossGreen0, bossGreen1, bossBlue0, bossBlue1, bossYellow0, bossYellow1, bossRed0, bossRed1, bossViolet0, bossViolet1,
    bossVetGreen0, bossVetGreen1, bossVetBlue0, bossVetBlue1, bossVetYellow0, bossVetYellow1,
    bossVetRed0, bossVetRed1, bossVetViolet0, bossVetViolet1,
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
   * tint when its tinted snapshot failed and `image` is the untinted original. Null when the
   * snapshot already carries the tint, and for every sprite that has none.
   */
  filter: SkColorFilter | null;
}

export interface PreparedSprites {
  /** Octopi's two poses in the run's look (`octopiLook`): a drawn pair, or the base pair with a tint baked into their snapshots (`prepareOctopi`). */
  octopi: { front: PreparedSprite; hit: PreparedSprite };
  crabs: PreparedSprite[];
  /**
   * ICE_FREEZE indication: the three ice sprites, pre-scaled to fit inside a
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
 * (an Octopi tint's `ColorMatrix`) recolours the pixels in the same draw, so a tinted snapshot costs
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

/** `w x h` for `image` scaled to fit inside a `boxW x boxH` box, keeping its own aspect ratio. */
function fitInside(image: SkImage, boxW: number, boxH: number): { w: number; h: number } {
  const scale = Math.min(boxW / image.width(), boxH / image.height());
  return { w: image.width() * scale, h: image.height() * scale };
}

/**
 * Disposes `image` now rather than at GC. A throw is swallowed: a failed release must never stop
 * the caller's own clean-up (the art queue below settles every job and always unlocks itself).
 */
function disposeQuietly(image: SkImage | null | undefined): void {
  try {
    image?.dispose();
  } catch {
    // Nothing left to do: the image is released at GC instead.
  }
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
 * A drawn look's two decoded poses: the Front pose and the Ooff (hit) pose, and the
 * `lookKey` of the look they were decoded for — a pair is only ever used for that look.
 */
export interface ArtPair {
  key: string;
  front: SkImage;
  ooff: SkImage;
}

/** True when `art` is `look`'s own decoded pair (never another look's). */
function isPairOf(art: ArtPair | null, look: Look): art is ArtPair {
  return art !== null && look.kind === 'art' && art.key === lookKey(look);
}

/**
 * Octopi's front and hit poses in `look` (`octopiLook`), pre-scaled like every other sprite. A drawn
 * look with its own pair decoded (`art`) is drawn as is: Front for the front pose, Ooff for the hit
 * pose. Otherwise the base pair is used, recoloured for a tint look by the tint's
 * `ColorMatrix` in the same offscreen draw (both base poses share the body colour `#1C6DC6` the
 * matrix is calibrated on); the base look keeps Octopi's own colours.
 *
 * The base poses are fitted to Octopi's width, as they always were. A drawn pose fits INSIDE the
 * base Front's box instead: no wider than Octopi's width and no taller than the base
 * Front at that width, its own aspect kept — a tall pair like Bunny (h/w 1.23) comes out narrower,
 * not taller; a wide one keeps the base width. Every look is sized to match the base Octopi's
 * size, and the hit box (the core's `OCTOPI.size`) is the same whatever Octopi wears. Each pose is
 * fitted on its own, as the base pair's two poses are, and centred on Octopi by `draw.ts` as before.
 */
export function prepareOctopi(sprites: Sprites, layout: Layout, look: Look, art: ArtPair | null): PreparedOctopi {
  const octopiW = OCTOPI.size * layout.scale;
  const base = sprites.octopi;
  const baseFrontH = octopiW * (base.front.height() / base.front.width());
  if (isPairOf(art, look)) {
    const f = fitInside(art.front, octopiW, baseFrontH);
    const o = fitInside(art.ooff, octopiW, baseFrontH);
    return { octopi: { front: preparedFrom(art.front, f.w, f.h), hit: preparedFrom(art.ooff, o.w, o.h) } };
  }
  const filter = tintFilter(look.kind === 'tint' ? look.tint : null);
  const front = preparedFrom(base.front, octopiW, baseFrontH, undefined, filter);
  const hit = preparedFrom(base.hit, octopiW, octopiW * (base.hit.height() / base.hit.width()), undefined, filter);
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
 * filtering (fixing both a frame-rate issue and the crushed-sprite blur described above): the UI-thread worklet then draws
 * each with a single `canvas.drawImageOptions` call, no per-frame resampling. Memoized in two parts
 * for `GameScreen`: the world sprites (`prepareWorld`) rebuild only when `sprites`/`layout` change,
 * Octopi's two poses in `look` (`prepareOctopi`) also when Octopi's look or its drawn pair `art`
 * changes. A drawn look waits for its own pair (`useArtPair`) the way the world waits for its
 * sprites — null until it is decoded, and never drawn with another look's pair — so a run never
 * starts on the base Octopi and swaps to the champion a moment later; `GameScreen` passes the base
 * look instead when the pair fails to decode.
 */
export function usePreparedSprites(sprites: Sprites | null, layout: Layout, look: Look, art: ArtPair | null): PreparedSprites | null {
  const world = useMemo(() => (sprites === null ? null : prepareWorld(sprites, layout)), [sprites, layout]);
  const octopi = useMemo(
    () => (sprites === null || (look.kind === 'art' && !isPairOf(art, look)) ? null : prepareOctopi(sprites, layout, look, art)),
    [sprites, layout, look, art],
  );
  return useMemo(() => (world === null || octopi === null ? null : { ...world, ...octopi }), [world, octopi]);
}

/**
 * The decode state of a look's drawn pair (`useArtPair`): the pair itself once both poses are
 * decoded; `'loading'` while they are not (or while the pair in hand is another look's); `'failed'`
 * when either pose cannot be read or decoded; null for a base or tint look, which has no pair.
 */
export type ArtPairState = ArtPair | 'loading' | 'failed' | null;

/**
 * How long a released pair outlives the look it was decoded for before it is disposed. A pose
 * whose snapshot failed draws the pair's own image (`preparedFrom`'s fallback), and the UI thread
 * may still be finishing a frame of the previous poses when React runs the clean-up; a second is
 * far past any such frame.
 */
const PAIR_RELEASE_MS = 1000;

/**
 * Decodes `look`'s drawn Front/Ooff pair for a run (only the equipped pair, never
 * the other twenty). The answer always belongs to the look passed in THIS render: a pair decoded
 * for a previous look is never returned, so a look that changes while the run is mounted (the
 * loadout answering after a quick tap on Practice) cannot draw or prime the old look's art under
 * the new look's key. A failed decode and a rejected read of the asset both give `'failed'` (the
 * read goes through `decodeArt`, which settles either way). A pair is disposed once its look is
 * gone (after `PAIR_RELEASE_MS`), and one decoded for a look already gone is disposed at once.
 */
export function useArtPair(look: Look): ArtPairState {
  const key = lookKey(look);
  // `key` names the look completely, so the effect below follows `key`; the ref only hands it the
  // look object that key was made from.
  const lookRef = useRef(look);
  lookRef.current = look;
  const [held, setHeld] = useState<{ key: string; pair: ArtPair | null } | null>(null);
  useEffect(() => {
    const current = lookRef.current;
    if (current.kind !== 'art') return undefined;
    let alive = true;
    let shown: ArtPair | null = null;
    void Promise.all([decodeArt(current.front), decodeArt(current.ooff)]).then(([front, ooff]) => {
      if (!alive || front === null || ooff === null) {
        // Never handed out, so nothing can be drawing either image.
        disposeQuietly(front);
        disposeQuietly(ooff);
        if (alive) setHeld({ key, pair: null });
        return;
      }
      shown = { key, front, ooff };
      setHeld({ key, pair: shown });
    });
    return () => {
      alive = false;
      // Forget this look's answer first, so a quick return to it decodes afresh instead of reusing
      // a pair about to be disposed (or a stale failure).
      setHeld((h) => (h !== null && h.key === key ? null : h));
      const released = shown;
      shown = null;
      if (released === null) return;
      setTimeout(() => {
        disposeQuietly(released.front);
        disposeQuietly(released.ooff);
      }, PAIR_RELEASE_MS);
    };
  }, [key]);
  if (look.kind !== 'art') return null;
  if (held === null || held.key !== key) return 'loading';
  return held.pair ?? 'failed';
}

/*
 * Octopi on UI screens (Home's hero, the result pose, Shop and Profile thumbs, leaderboard rows):
 * small snapshots of a look's front pose — the base sprite, recoloured for a tint look, or a drawn
 * pair's Front — pre-scaled through the same `renderScaled` path as the game. A
 * source decodes to ~4 MB (the 1024 px base sprite) or ~8 MB (a 1400 px drawn Front), so sources
 * are decoded one at a time, only while a snapshot waits on them, and released as soon as none
 * does: a Shop or Profile full of drawn thumbs decodes each Front once, in turn, never all of them
 * at once, and a leaderboard decodes one Front per distinct look however many rows wear it. Screens
 * hold only their own snapshots (a 160 dp hero is about 1 MB at 3x, a 56 dp thumb about 0.1 MB).
 */

/**
 * Snapshots kept for reuse across screens; the oldest is dropped past this count (a screen keeps
 * its own reference). Room for the Profile's champions and skins together (27 tiles) with the hero.
 */
const ART_LIMIT = 48;
const artCache = new Map<string, SkImage>();
const artJobs = new Map<string, Promise<SkImage | null>>();

/** A snapshot waiting for its source to be decoded. */
interface ArtJob {
  key: string;
  look: Look;
  px: number;
  done: (image: SkImage | null) => void;
}
const artQueue: ArtJob[] = [];
let artDraining = false;

function artKey(look: Look, px: number): string {
  return `${lookKey(look)}@${px}`;
}

/** The asset a look's snapshot is made from, and its identity: a drawn look's own Front, else the base front pose. */
function artSourceOf(look: Look): { id: string; asset: number } {
  return look.kind === 'art' ? { id: look.key, asset: look.front } : { id: 'base', asset: OCTOPI_FRONT };
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
 * Renders `source` in `look` into a snapshot that fits a `px x px` physical-pixel square, keeping
 * its aspect ratio: recoloured for a tint look, as is otherwise (`source` is a drawn look's own
 * Front). Falls back to a CPU surface where the GPU offscreen one is unavailable, so a UI Octopi
 * never goes missing.
 */
function renderArt(source: SkImage, look: Look, px: number): SkImage | null {
  const { w, h } = containSize(source, px / PIXEL_RATIO);
  const filter = tintFilter(look.kind === 'tint' ? look.tint : null);
  return (
    renderScaled(source, w, h, undefined, filter) ??
    renderScaled(source, w, h, undefined, filter, (width, height) => Skia.Surface.Make(width, height))
  );
}

/** Decodes `asset`; null when it cannot be read or decoded (started inside the chain so a throw lands in the catch). */
function decodeArt(asset: number): Promise<SkImage | null> {
  return Promise.resolve()
    .then(() => loadData(asset, (data) => Skia.Image.MakeImageFromEncoded(data)))
    .catch(() => null);
}

/**
 * Works through `artQueue` one source at a time: every waiting snapshot of the source already
 * decoded is made before the next source is decoded, and a source is released (`dispose`, not left
 * to GC) the moment no queued snapshot needs it.
 */
async function drainArt(): Promise<void> {
  if (artDraining) return;
  artDraining = true;
  let held: { id: string; image: SkImage | null } | null = null;
  while (artQueue.length > 0) {
    const heldId = held?.id;
    const same = heldId === undefined ? -1 : artQueue.findIndex((j) => artSourceOf(j.look).id === heldId);
    const job = artQueue.splice(Math.max(0, same), 1)[0]!;
    let art: SkImage | null = null;
    try {
      const { id, asset } = artSourceOf(job.look);
      if (held === null || held.id !== id) {
        // Forgotten before it is disposed, so it can never be disposed twice.
        const old = held;
        held = null;
        disposeQuietly(old?.image);
        held = { id, image: await decodeArt(asset) };
      }
      art = held.image === null ? null : renderArt(held.image, job.look, job.px);
    } catch {
      art = null;
    }
    // Every job settles, whatever happened above.
    if (art !== null) rememberArt(job.key, art);
    artJobs.delete(job.key);
    job.done(art);
  }
  // Unlocked before the last release, so the next request always drains.
  artDraining = false;
  const last = held;
  held = null;
  disposeQuietly(last?.image);
}

function requestArt(look: Look, px: number): Promise<SkImage | null> {
  const key = artKey(look, px);
  const cached = artCache.get(key);
  if (cached !== undefined) {
    rememberArt(key, cached);
    return Promise.resolve(cached);
  }
  const running = artJobs.get(key);
  if (running !== undefined) return running;
  const job = new Promise<SkImage | null>((resolve) => {
    artQueue.push({ key, look, px, done: resolve });
  });
  artJobs.set(key, job);
  void drainArt();
  return job;
}

/**
 * Makes the snapshot `useOctopiArt(look, box)` will ask for from an already decoded `source` — the
 * run's own front pose: a drawn look's Front, else the base sprite — so a later screen finds it
 * ready without decoding the asset again.
 */
export function primeOctopiArt(source: SkImage, look: Look, box: number): void {
  const px = Math.round(box * PIXEL_RATIO);
  if (px <= 0) return;
  const key = artKey(look, px);
  if (artCache.has(key) || artJobs.has(key)) return;
  const art = renderArt(source, look, px);
  if (art !== null) rememberArt(key, art);
}

/**
 * Octopi's front pose in `look` (`looks.ts`: its own colours, a tint of `shop/tints.ts`, or a drawn
 * pair's Front), pre-scaled to fit a `box x box` dp square at physical pixels: draw it into that
 * square (`fit="contain"`) and it lands 1:1 on the screen's pixels. Null until the snapshot is
 * ready, or while `box` is 0 (not laid out yet). Keyed by `lookKey(look)` and the physical size, so
 * every screen and row wearing the same look at the same size shares one snapshot.
 */
export function useOctopiArt(look: Look, box: number): SkImage | null {
  const px = Math.round(box * PIXEL_RATIO);
  const key = artKey(look, px);
  // `key` names the look completely, so the effect below follows `key`; the ref only hands it the
  // look object that key was made from.
  const lookRef = useRef(look);
  lookRef.current = look;
  const [held, setHeld] = useState<{ key: string; image: SkImage } | null>(null);
  useEffect(() => {
    if (px <= 0) return undefined;
    let alive = true;
    void requestArt(lookRef.current, px).then((image) => {
      if (alive && image !== null) setHeld({ key, image });
    });
    return () => {
      alive = false;
    };
  }, [key, px]);
  if (px <= 0) return null;
  if (held !== null && held.key === key) return held.image;
  // A snapshot another screen already made draws on the first frame, before the effect above holds it.
  return artCache.get(key) ?? null;
}
