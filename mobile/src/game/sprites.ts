import { Skia, useImage, type SkImage } from '@shopify/react-native-skia';
import { BOSS, CRAB, SHIP, type Layout } from '@sea-invaders/core';
import { useMemo } from 'react';

export interface Sprites {
  ship: { front: SkImage; hit: SkImage };
  /** Colour by `kind` (0..4): green, blue, violet, red, yellow. */
  crabs: SkImage[];
  /** Colour by `kind` (1..5): green, blue, yellow, red, violet; `bosses[kind - 1]` (0-based). */
  bosses: SkImage[];
  bg: SkImage;
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

  // Boss colour order: kind 1..5.
  const bossGreen = useImage(require('../../assets/sprites/crabBOSSGreen.png'));
  const bossBlue = useImage(require('../../assets/sprites/crabBossBlue.png'));
  const bossYellow = useImage(require('../../assets/sprites/crabBossYellow.png'));
  const bossRed = useImage(require('../../assets/sprites/crabBossRed.png'));
  const bossViolet = useImage(require('../../assets/sprites/crabBossViolet.png'));

  const bg = useImage(require('../../assets/sprites/bg1.png'));

  return useMemo(() => {
    if (
      front === null || hit === null || bg === null ||
      crabGreen === null || crabBlue === null || crabViolet === null || crabRed === null || crabYellow === null ||
      bossGreen === null || bossBlue === null || bossYellow === null || bossRed === null || bossViolet === null
    ) {
      return null;
    }
    return {
      ship: { front, hit },
      crabs: [crabGreen, crabBlue, crabViolet, crabRed, crabYellow],
      bosses: [bossGreen, bossBlue, bossYellow, bossRed, bossViolet],
      bg,
    };
  }, [
    front, hit, bg,
    crabGreen, crabBlue, crabViolet, crabRed, crabYellow,
    bossGreen, bossBlue, bossYellow, bossRed, bossViolet,
  ]);
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A sprite ready for the UI-thread worklet to draw at `(left, top)`, already sized to `w x h`. */
export interface PreparedSprite {
  image: SkImage;
  w: number;
  h: number;
  /**
   * Only read when `PreparedSprites.prescaled` is false: `image`'s own bounds and the target rect
   * at the local origin, precomputed once for the `drawImageRect` + `translate` fallback.
   */
  src: Rect;
  dest: Rect;
}

export interface PreparedSprites {
  ship: { front: PreparedSprite; hit: PreparedSprite };
  crabs: PreparedSprite[];
  bosses: PreparedSprite[];
  bg: PreparedSprite;
  /**
   * False when the offscreen-surface pre-scale failed on this device (no GPU surface, or a
   * snapshot/non-texture conversion returned null): every `PreparedSprite.image` is then the
   * original full-resolution image and draw.ts falls back to `drawImageRect` + `translate`.
   */
  prescaled: boolean;
}

/**
 * Renders `image` into an offscreen surface at exactly `w x h` (cropping `src` first when given,
 * for an aspect-fill), snapshots it and converts it to a non-texture image the UI-thread worklet
 * can draw with a plain `canvas.drawImage`. Returns null if the surface, its snapshot, or the
 * conversion is unavailable on this device/driver, or if any of it throws.
 */
function renderScaled(image: SkImage, w: number, h: number, src?: Rect): SkImage | null {
  try {
    const width = Math.max(1, Math.round(w));
    const height = Math.max(1, Math.round(h));
    const surface = Skia.Surface.MakeOffscreen(width, height);
    if (surface === null) return null;
    const canvas = surface.getCanvas();
    const paint = Skia.Paint();
    const from = src ?? { x: 0, y: 0, width: image.width(), height: image.height() };
    canvas.drawImageRect(image, from, { x: 0, y: 0, width, height }, paint);
    surface.flush();
    const snapshot = surface.makeImageSnapshot();
    return snapshot.makeNonTextureImage();
  } catch {
    return null;
  }
}

/** Aspect-fill source rect for `image` covering a `destW x destH` box (crops the wider dimension). */
function coverSrc(image: SkImage, destW: number, destH: number): Rect {
  const imgW = image.width();
  const imgH = image.height();
  const destAspect = destW / destH;
  const imgAspect = imgW / imgH;
  if (imgAspect > destAspect) {
    const width = imgH * destAspect;
    return { x: (imgW - width) / 2, y: 0, width, height: imgH };
  }
  const height = imgW / destAspect;
  return { x: 0, y: (imgH - height) / 2, width: imgW, height };
}

function preparedFrom(image: SkImage, w: number, h: number, src?: Rect): { ok: boolean; sprite: PreparedSprite } {
  const scaled = renderScaled(image, w, h, src);
  const fallbackSrc = src ?? { x: 0, y: 0, width: image.width(), height: image.height() };
  return {
    ok: scaled !== null,
    sprite: { image: scaled ?? image, w, h, src: fallbackSrc, dest: { x: 0, y: 0, width: w, height: h } },
  };
}

/**
 * Pre-scales every sprite to its exact on-screen size once (Task 4's FPS ruling): the UI-thread
 * worklet then draws each with a single `canvas.drawImage`, no per-frame resampling. Called from
 * a `useMemo` in `GameScreen` keyed on `sprites`/`layout`, so it only reruns when either changes.
 */
export function prepareSprites(sprites: Sprites, layout: Layout): PreparedSprites {
  const k = layout.scale;

  const shipW = SHIP.size * k;
  const front = preparedFrom(sprites.ship.front, shipW, shipW * (sprites.ship.front.height() / sprites.ship.front.width()));
  const hit = preparedFrom(sprites.ship.hit, shipW, shipW * (sprites.ship.hit.height() / sprites.ship.hit.width()));

  const crabSize = CRAB.size * k;
  const crabs = sprites.crabs.map((img) => preparedFrom(img, crabSize, crabSize));

  const bossW = BOSS.width * k;
  const bossH = BOSS.height * k;
  const bosses = sprites.bosses.map((img) => preparedFrom(img, bossW, bossH));

  const bgW = layout.width;
  const bgH = layout.height;
  const bg = preparedFrom(sprites.bg, bgW, bgH, coverSrc(sprites.bg, bgW, bgH));

  const prescaled = front.ok && hit.ok && bg.ok && crabs.every((c) => c.ok) && bosses.every((b) => b.ok);

  return {
    ship: { front: front.sprite, hit: hit.sprite },
    crabs: crabs.map((c) => c.sprite),
    bosses: bosses.map((b) => b.sprite),
    bg: bg.sprite,
    prescaled,
  };
}

/** `prepareSprites`, memoized on `sprites`/`layout` so it rebuilds only when either changes. */
export function usePreparedSprites(sprites: Sprites | null, layout: Layout): PreparedSprites | null {
  return useMemo(() => (sprites === null ? null : prepareSprites(sprites, layout)), [sprites, layout]);
}
