import { BlendMode, FilterMode, MipmapMode, PaintStyle, Skia, TileMode } from '@shopify/react-native-skia';
import {
  BOOSTS, BOOST_INDEX, BOSS, BOSS_SHOT, DROP, ENEMY_SHOT, KIND_INDEX, RARITY_ORDER, OCTOPI,
  type BoostType, type Frame, type Layout,
} from '@sea-invaders/core';
import { COLORS } from '../ui/tokens';
import { PIXEL_RATIO, type PreparedSprite, type PreparedSprites } from './sprites';

type Recorder = ReturnType<typeof Skia.PictureRecorder>;
type Paint = ReturnType<typeof Skia.Paint>;
type Canvas = ReturnType<Recorder['beginRecording']>;
interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Read once on the JS thread; the worklet below closes over this value rather than the global. */
declare const __DEV__: boolean;
const DEV_HITBOX = __DEV__;

const FILL = PaintStyle.Fill;
const STROKE = PaintStyle.Stroke;

const SHOT_COLOR = Skia.Color('#19FB9B');
/** Crab shot (kindIndex 0): today's orange glow, unchanged. */
const CRAB_SHOT_COLOR = Skia.Color('#F48252');
const FIELD_EDGE = Skia.Color('rgba(236,228,253,0.12)');
/** Solid dark playfield (a themed backdrop image comes later): the darkest of the app's surface tokens. */
const FIELD_BG_COLOR = Skia.Color(COLORS.app);
/** Visible player shot in milli-units: 3 x 18 dp on a 400 dp wide field. The hitbox stays SHOT's. */
const SHOT_LOOK = { w: 42, h: 253 };

/** Boss palette by kind 1..5 (spec §4.2 / GameHud's BOSS_COLOR). */
const BOSS_HEX = ['#33cc66', '#3366ff', '#ffdd33', '#ff3333', '#9966ff'] as const;
const BOSS_RGB = ['51,204,102', '51,102,255', '255,221,51', '255,51,51', '153,102,255'] as const;
const BOSS_SK = BOSS_HEX.map((hex) => Skia.Color(hex));
const DEFAULT_BOSS_SK = Skia.Color('#FFFFFF');

/**
 * One radial-gradient shader per boss kind, built once in local (untransformed) units around the
 * origin — never per frame. Drawn behind the boss sprite through `canvas.translate`/`scale` so it
 * always ends up centred on the boss regardless of screen scale.
 */
const BOSS_GLOW_RADIUS = Math.max(BOSS.width, BOSS.height) * 0.65;
const BOSS_GLOW = BOSS_RGB.map((rgb) =>
  Skia.Shader.MakeRadialGradient(
    Skia.Point(0, 0),
    BOSS_GLOW_RADIUS,
    [Skia.Color(`rgba(${rgb},0.65)`), Skia.Color(`rgba(${rgb},0)`)],
    [0, 1],
    TileMode.Clamp,
  ),
);

/** Crimson's rage tint and the phase-transition white flash: built once, reused every frame. */
const RAGE_FILTER = Skia.ColorFilter.MakeBlend(Skia.Color('#FF6060'), BlendMode.Modulate);
const WHITE_FLASH_FILTER = Skia.ColorFilter.MakeBlend(Skia.Color('#FFFFFF'), BlendMode.SrcIn);

/** Void's temporal freeze: a violet tint over the whole field, drawn last (on top of everything). */
const FREEZE_OVERLAY = Skia.Color('rgba(153,102,255,0.18)');

/**
 * ICE_FREEZE indication (owner ruling): one of the owner's three ice sprites drawn over every crab,
 * plus the legacy full-field fog drawn right after them (legacy `boost-effects.js:453-489`'s
 * desktop-branch full-canvas rect at 0.1 alpha). The ice sprites themselves are pre-scaled in
 * `sprites.ts` (`PreparedSprites.ice`); the variant per crab is picked deterministically below
 * (crab offset + kind) so it doesn't flicker frame to frame, and drawn at `ICE_ALPHA` via the same
 * `drawSpriteAt` every other sprite uses.
 */
const ICE_ALPHA = 0.75;
const ICE_FOG_COLOR = Skia.Color('rgba(170,238,255,0.10)');

const SHIELD_COLOR = Skia.Color('rgba(0,221,255,0.6)');
const PLAYER_SHIELD_STROKE = 4;
const BOSS_SHIELD_STROKE = 6;

/** INVINCIBILITY indication (spec M6): legacy rainbow outline, cycling every 6 ticks. The outline's
 * own `SkRRect` is precomputed per Octopi pose in `sprites.ts` (`PreparedSprites.invincibleOutline`)
 * and only translated here — never rebuilt per frame. */
const INVINCIBLE_COLORS = ['#ff0000', '#ff8800', '#ffff00', '#00ff00', '#0088ff', '#0000ff', '#8800ff'].map((hex) => Skia.Color(hex));
const INVINCIBLE_STROKE_W = 3;
const INVINCIBLE_SPARK_COUNT = 4;
const INVINCIBLE_SPARK_RISE_TICKS = 18;
/** How far a spark rises over its lifetime, and its size range, both in dp (unscaled, like the outline). */
const INVINCIBLE_SPARK_RISE = 24;
const INVINCIBLE_SPARK_MIN_R = 2;
const INVINCIBLE_SPARK_MAX_R = 4;

/** Legacy black-hole look (spec M8): base/pulse glow radius in units; `pulse = 0.5 + 0.5*sin(tick/4)`. */
const WELL_GLOW_BASE = 1470;
const WELL_GLOW_PULSE = 550;
/**
 * One radial gradient built once at the origin with unit radius 1: black core fading through
 * `rgba(20,20,50,0.9)` and `rgba(0,100,255,0.6)` to transparent. Drawn every frame through
 * `canvas.translate` + `canvas.scale` to the well's centre and current glow radius.
 */
const WELL_GRADIENT = Skia.Shader.MakeRadialGradient(
  Skia.Point(0, 0),
  1,
  [Skia.Color('#000000'), Skia.Color('rgba(20,20,50,0.9)'), Skia.Color('rgba(0,100,255,0.6)'), Skia.Color('rgba(0,100,255,0)')],
  [0, 0.3, 0.6, 1],
  TileMode.Clamp,
);

const HEAVY_COLOR = Skia.Color('#B8BEC9');
const FAST_COLOR = Skia.Color('#FFE45C');
const WAVE_COLOR = Skia.Color('#2EE6D6');
const EXPLOSIVE_COLOR = Skia.Color('#FF8C1A');
const EXPLOSIVE_CORE_COLOR = Skia.Color('#33190A');
const BERSERK_COLOR = Skia.Color('#FF3333');
const SPIRAL_COLOR = Skia.Color('#9966FF');
const RING_COLOR = Skia.Color('#FFFFFF');
const CLONE_COLOR = Skia.Color('#FFFFFF');
const GRAVITY_SHOT_COLOR = Skia.Color('rgba(20,10,40,0.85)');
const RING_STROKE_W = 4;
const GRAVITY_STROKE_W = 5;

/** `heavy`'s diameter, and `fast`'s bar size, both in milli-units (spec, Task 16 addendum). */
const HEAVY_DIAMETER = 280;
const FAST_W = 30;
const FAST_H = 200;

/** A unit box centred on the origin, reused (via `canvas.scale`) for the zigzag diamond — never reallocated per shot. */
const UNIT_SQUARE = { x: -0.5, y: -0.5, width: 1, height: 1 };
/** A narrow unit rect trailing above the origin, reused for the meteor's motion trail. */
const METEOR_TRAIL_UNIT = { x: -0.15, y: -2.4, width: 0.3, height: 2 };

/** Reused for every axis-aligned shot/UI shape whose size or position varies frame to frame (the
 * `fast` bar, the meteor trail, the boss shield ellipse): each draw call consumes it synchronously,
 * so one shared instance is safe across sequential uses within the same frame — no per-shot alloc. */
const SCRATCH_RECT: Rect = { x: 0, y: 0, width: 0, height: 0 };
function scratch(x: number, y: number, width: number, height: number): Rect {
  'worklet';
  SCRATCH_RECT.x = x;
  SCRATCH_RECT.y = y;
  SCRATCH_RECT.width = width;
  SCRATCH_RECT.height = height;
  return SCRATCH_RECT;
}

/** Rarity colour by `RARITY_ORDER` index (0..3): common, rare, epic, legendary. */
const RARITY_COLOR_HEX = ['#ffffff', '#00ddff', '#9f00ff', '#ffd700'] as const;
/** Fraction of `DROP.size * k` used as the soft glow disc's radius, behind the drop's icon. */
const DROP_GLOW_SCALE = 0.7;
const DROP_GLOW_ALPHA = 0.45;

/** One rarity-coloured `SkColor` per `BOOST_INDEX` slot, built once at module load. */
const DROP_GLOW_COLOR: ReturnType<typeof Skia.Color>[] = Object.entries(BOOST_INDEX).reduce<ReturnType<typeof Skia.Color>[]>(
  (table, [type, index]) => {
    const t = type as BoostType;
    const colorHex = RARITY_COLOR_HEX[RARITY_ORDER.indexOf(BOOSTS[t].rarity)]!;
    table[index] = Skia.Color(colorHex);
    return table;
  },
  [],
);

/**
 * Draws `sprite` with its top-left corner at `(left, top)`. When this sprite's own pre-scale
 * succeeded (`sprite.scaled`), `sprite.image` is a physical-pixel-sized snapshot (see `sprites.ts`);
 * scaling the canvas down by `1 / PIXEL_RATIO` before drawing it at its native size renders it at
 * the intended dp size, with Skia's own linear resample doing the (small, constant) final scale
 * rather than a second nearest-neighbour resize of an already mip-filtered image. `PIXEL_RATIO` is
 * imported as a plain number computed once on the JS thread (`sprites.ts`), so this worklet closes
 * over a constant rather than calling into RN — same pattern as `DEV_HITBOX` above.
 * Otherwise (this sprite's own offscreen render failed) falls back to the precomputed-rect
 * `drawImageRectOptions`, mip-filtered the same way — one sprite falling back never affects any other.
 */
function drawSpriteAt(canvas: Canvas, paint: Paint, sprite: PreparedSprite, left: number, top: number) {
  'worklet';
  if (sprite.scaled) {
    canvas.save();
    canvas.translate(left, top);
    canvas.scale(1 / PIXEL_RATIO, 1 / PIXEL_RATIO);
    canvas.drawImageOptions(sprite.image, 0, 0, FilterMode.Linear, MipmapMode.None, paint);
    canvas.restore();
    return;
  }
  canvas.save();
  canvas.translate(left, top);
  canvas.drawImageRectOptions(sprite.image, sprite.src, sprite.dest, FilterMode.Linear, MipmapMode.Linear, paint);
  canvas.restore();
}

/**
 * Records one frame on a transparent canvas; the world backdrop is drawn behind it.
 * It runs on the UI thread inside useDerivedValue, so it must stay a worklet.
 */
export function drawFrame(
  recorder: Recorder,
  paint: Paint,
  f: Frame,
  l: Layout,
  w: number,
  h: number,
  sprites: PreparedSprites,
  fieldRect: Rect,
) {
  'worklet';
  const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, w, h));
  const k = l.scale;
  const px = (mu: number) => l.offsetX + mu * k;
  const py = (mu: number) => l.offsetY + mu * k;
  paint.setStyle(FILL);
  paint.setColorFilter(null);
  paint.setAlphaf(1);

  // Solid dark playfield (spec M4): a themed backdrop image comes later.
  paint.setColor(FIELD_BG_COLOR);
  canvas.drawRect(fieldRect, paint);

  // On screens wider than the field, faint lines mark its sides.
  if (l.offsetX > 0.5) {
    paint.setColor(FIELD_EDGE);
    canvas.drawRect(scratch(l.offsetX - 1, 0, 1, h), paint);
    canvas.drawRect(scratch(l.offsetX + l.width, 0, 1, h), paint);
  }

  // Gravity well (legacy look, spec M8): one radial gradient, black core fading to transparent blue.
  if (f.well !== null) {
    const wx = px(f.well.x);
    const wy = py(f.well.y);
    const pulse = 0.5 + 0.5 * Math.sin(f.tick / 4);
    const glowRadius = (WELL_GLOW_BASE + WELL_GLOW_PULSE * pulse) * k;
    paint.setShader(WELL_GRADIENT);
    canvas.save();
    canvas.translate(wx, wy);
    canvas.scale(glowRadius, glowRadius);
    canvas.drawCircle(0, 0, 1, paint);
    canvas.restore();
    paint.setShader(null);
  }

  // ICE_FREEZE (owner ruling): an ice sprite over every crab below, plus the legacy fog after them.
  let iceFreeze = false;
  for (let i = 0; i < f.boosts.length; i += 2) {
    if (f.boosts[i] === BOOST_INDEX.ICE_FREEZE) {
      iceFreeze = true;
      break;
    }
  }

  // Crabs: the sprite for the crab's kind already encodes its colour/type (TYPE_COLOUR); no tint.
  for (let i = 0; i < f.crabs.length; i += 5) {
    const cx = px(f.crabs[i]!);
    const cy = py(f.crabs[i + 1]!);
    const kind = f.crabs[i + 2]!;
    const sprite = sprites.crabs[kind];
    if (sprite === undefined) continue;
    drawSpriteAt(canvas, paint, sprite, cx - sprite.w / 2, cy - sprite.h / 2);
    if (iceFreeze) {
      const variant = (Math.floor(i / 5) + kind) % 3;
      const iceSprite = sprites.ice[variant];
      if (iceSprite !== undefined) {
        paint.setAlphaf(ICE_ALPHA);
        drawSpriteAt(canvas, paint, iceSprite, cx - iceSprite.w / 2, cy - iceSprite.h / 2);
        paint.setAlphaf(1);
      }
    }
  }
  if (iceFreeze) {
    paint.setColor(ICE_FOG_COLOR);
    canvas.drawRect(fieldRect, paint);
  }

  // Player shots: a bright core over a soft glow.
  const sw = SHOT_LOOK.w * k;
  const sh = SHOT_LOOK.h * k;
  paint.setColor(SHOT_COLOR);
  for (let i = 0; i < f.shots.length; i += 2) {
    const x = px(f.shots[i]!) - sw / 2;
    const y = py(f.shots[i + 1]!) - sh / 2;
    paint.setAlphaf(0.25);
    canvas.drawRect(scratch(x - sw, y - sw, sw * 3, sh + sw * 2), paint);
    paint.setAlphaf(1);
    canvas.drawRect(scratch(x, y, sw, sh), paint);
  }
  paint.setAlphaf(1);

  // Enemy shots: crab glow unchanged; heavy/fast/boss kinds get their own shape and colour.
  const baseR = BOSS_SHOT.radius * k;
  const bossColor = f.boss !== null ? BOSS_SK[f.boss.kind - 1]! : DEFAULT_BOSS_SK;
  for (let i = 0; i < f.enemyShots.length; i += 3) {
    const x = px(f.enemyShots[i]!);
    const y = py(f.enemyShots[i + 1]!);
    const kindIndex = f.enemyShots[i + 2]!;
    switch (kindIndex) {
      case KIND_INDEX.crab: {
        const er = ENEMY_SHOT.radius * k;
        paint.setColor(CRAB_SHOT_COLOR);
        paint.setAlphaf(0.25);
        canvas.drawCircle(x, y, er * 1.9, paint);
        paint.setAlphaf(1);
        canvas.drawCircle(x, y, er, paint);
        break;
      }
      case KIND_INDEX.heavy: {
        paint.setColor(HEAVY_COLOR);
        canvas.drawCircle(x, y, (HEAVY_DIAMETER / 2) * k, paint);
        break;
      }
      case KIND_INDEX.fast: {
        paint.setColor(FAST_COLOR);
        canvas.drawRect(scratch(x - (FAST_W * k) / 2, y - (FAST_H * k) / 2, FAST_W * k, FAST_H * k), paint);
        break;
      }
      case KIND_INDEX.straight: {
        paint.setColor(bossColor);
        canvas.drawCircle(x, y, baseR, paint);
        break;
      }
      case KIND_INDEX.zigzag: {
        paint.setColor(bossColor);
        canvas.save();
        canvas.translate(x, y);
        canvas.rotate(45, 0, 0);
        canvas.scale(baseR * 1.6, baseR * 1.6);
        canvas.drawRect(UNIT_SQUARE, paint);
        canvas.restore();
        break;
      }
      case KIND_INDEX.large: {
        paint.setColor(bossColor);
        canvas.drawCircle(x, y, baseR * 2, paint);
        break;
      }
      case KIND_INDEX.wave: {
        paint.setColor(WAVE_COLOR);
        canvas.drawCircle(x, y, baseR, paint);
        break;
      }
      case KIND_INDEX.ring: {
        paint.setStyle(STROKE);
        paint.setStrokeWidth(RING_STROKE_W);
        paint.setColor(RING_COLOR);
        canvas.drawCircle(x, y, baseR, paint);
        paint.setStyle(FILL);
        break;
      }
      case KIND_INDEX.explosive: {
        paint.setColor(EXPLOSIVE_COLOR);
        canvas.drawCircle(x, y, baseR, paint);
        paint.setColor(EXPLOSIVE_CORE_COLOR);
        canvas.drawCircle(x, y, baseR * 0.4, paint);
        break;
      }
      case KIND_INDEX.fragment: {
        paint.setColor(EXPLOSIVE_COLOR);
        canvas.drawCircle(x, y, baseR * 0.5, paint);
        break;
      }
      case KIND_INDEX.meteor: {
        paint.setColor(HEAVY_COLOR);
        paint.setAlphaf(0.35);
        canvas.save();
        canvas.translate(x, y);
        canvas.scale(baseR, baseR);
        canvas.drawRect(METEOR_TRAIL_UNIT, paint);
        canvas.restore();
        paint.setAlphaf(1);
        canvas.drawCircle(x, y, baseR, paint);
        break;
      }
      case KIND_INDEX.berserk: {
        paint.setColor(BERSERK_COLOR);
        canvas.drawCircle(x, y, baseR, paint);
        break;
      }
      case KIND_INDEX.spiral: {
        paint.setColor(SPIRAL_COLOR);
        canvas.drawCircle(x, y, baseR, paint);
        break;
      }
      case KIND_INDEX.gravity: {
        paint.setStyle(STROKE);
        paint.setStrokeWidth(GRAVITY_STROKE_W);
        paint.setColor(GRAVITY_SHOT_COLOR);
        canvas.drawCircle(x, y, baseR, paint);
        paint.setStyle(FILL);
        break;
      }
      case KIND_INDEX.clone: {
        paint.setColor(CLONE_COLOR);
        canvas.drawCircle(x, y, baseR, paint);
        break;
      }
      default:
        break;
    }
  }
  paint.setAlphaf(1);

  // Boss: glow, sprite (rage tint / transition flash), shield ring.
  if (f.boss !== null) {
    const b = f.boss;
    const bx = px(b.x);
    const by = py(b.y);
    const glow = BOSS_GLOW[b.kind - 1];
    if (glow !== undefined) {
      paint.setShader(glow);
      canvas.save();
      canvas.translate(bx, by);
      canvas.scale(k, k);
      canvas.drawCircle(0, 0, BOSS_GLOW_RADIUS, paint);
      canvas.restore();
      paint.setShader(null);
    }
    // Two extracted GIF frames, flipped every 60 ticks (1000 ms at 60 fps, as in the source GIF).
    const bossFrames = sprites.bosses[b.kind - 1];
    const sprite = bossFrames !== undefined ? bossFrames[Math.floor(f.tick / 60) % 2] : undefined;
    if (sprite !== undefined) {
      paint.setColorFilter(b.rage === 1 ? RAGE_FILTER : null);
      drawSpriteAt(canvas, paint, sprite, bx - sprite.w / 2, by - sprite.h / 2);
      paint.setColorFilter(null);
      if (b.transition === 1 && Math.floor(f.tick / 6) % 2 === 0) {
        paint.setColorFilter(WHITE_FLASH_FILTER);
        paint.setAlphaf(0.5);
        drawSpriteAt(canvas, paint, sprite, bx - sprite.w / 2, by - sprite.h / 2);
        paint.setColorFilter(null);
        paint.setAlphaf(1);
      }
    }
    if (b.shieldHp > 0) {
      const ow = b.w * k * 1.08;
      const oh = b.h * k * 1.08;
      paint.setStyle(STROKE);
      paint.setStrokeWidth(BOSS_SHIELD_STROKE);
      paint.setColor(SHIELD_COLOR);
      canvas.drawOval(scratch(bx - ow / 2, by - oh / 2, ow, oh), paint);
      paint.setStyle(FILL);
    }
  }

  // Drops: a soft glow disc in the rarity colour, with the boost's own icon over it.
  if (f.drops.length > 0) {
    const dropSize = DROP.size * k;
    const glowRadius = dropSize * DROP_GLOW_SCALE;
    paint.setStyle(FILL);
    for (let i = 0; i < f.drops.length; i += 3) {
      const x = px(f.drops[i]!);
      const y = py(f.drops[i + 1]!);
      const typeIndex = f.drops[i + 2]!;
      const glowColor = DROP_GLOW_COLOR[typeIndex];
      if (glowColor === undefined) continue;
      paint.setColor(glowColor);
      paint.setAlphaf(DROP_GLOW_ALPHA);
      canvas.drawCircle(x, y, glowRadius, paint);
      paint.setAlphaf(1);
      const icon = sprites.boosts[typeIndex];
      if (icon !== undefined) drawSpriteAt(canvas, paint, icon, x - icon.w / 2, y - icon.h / 2);
    }
  }

  // Octopi: always the front sprite, swapped for the damage pose while invulnerable (no blink).
  // Both poses come from `prepareOctopi` already in the active skin (the tint is baked into their
  // snapshots); only a pose whose snapshot failed carries the skin's prebuilt colour filter, which
  // its full-size fallback draw applies here.
  const sx = px(f.octopi.x);
  const sy = py(f.octopi.y);
  const octopiSprite = f.octopi.invuln > 0 ? sprites.octopi.hit : sprites.octopi.front;
  if (octopiSprite.filter !== null) paint.setColorFilter(octopiSprite.filter);
  drawSpriteAt(canvas, paint, octopiSprite, sx - octopiSprite.w / 2, sy - octopiSprite.h / 2);
  if (octopiSprite.filter !== null) paint.setColorFilter(null);
  if (DEV_HITBOX) {
    paint.setColor(SHOT_COLOR);
    paint.setAlphaf(0.6);
    canvas.drawCircle(sx, sy, OCTOPI.hitRadius * k, paint);
    paint.setAlphaf(1);
  }

  // Player shield: a cyan ring around Octopi.
  if (f.shield > 0) {
    paint.setStyle(STROKE);
    paint.setStrokeWidth(PLAYER_SHIELD_STROKE);
    paint.setColor(SHIELD_COLOR);
    canvas.drawCircle(sx, sy, OCTOPI.size * 0.7 * k, paint);
    paint.setStyle(FILL);
  }

  // INVINCIBILITY (spec M6): a legacy rainbow outline around Octopi, plus rising sparks.
  let invincible = false;
  for (let i = 0; i < f.boosts.length; i += 2) {
    if (f.boosts[i] === BOOST_INDEX.INVINCIBILITY) {
      invincible = true;
      break;
    }
  }
  if (invincible) {
    // Precomputed per Octopi pose in sprites.ts (never rebuilt here): centred at the local origin,
    // so a translate to Octopi's centre is all this needs — no scale, so the stroke stays 3 dp.
    const outlineRRect = f.octopi.invuln > 0 ? sprites.invincibleOutline.hit : sprites.invincibleOutline.front;
    const color = INVINCIBLE_COLORS[Math.floor(f.tick / 6) % INVINCIBLE_COLORS.length]!;
    paint.setStyle(STROKE);
    paint.setStrokeWidth(INVINCIBLE_STROKE_W);
    paint.setColor(color);
    paint.setAlphaf(0.5 + 0.3 * Math.sin(f.tick / 10));
    canvas.save();
    canvas.translate(sx, sy);
    canvas.drawRRect(outlineRRect, paint);
    canvas.restore();
    paint.setStyle(FILL);

    for (let i = 0; i < INVINCIBLE_SPARK_COUNT; i++) {
      const rndX = ((f.tick * 37 + i * 101) % 97) / 97;
      const rndPhase = ((f.tick * 53 + i * 131) % 89) / 89;
      const phase = (f.tick + Math.floor(rndPhase * INVINCIBLE_SPARK_RISE_TICKS)) % INVINCIBLE_SPARK_RISE_TICKS;
      const t = phase / INVINCIBLE_SPARK_RISE_TICKS;
      const dotX = sx + (rndX - 0.5) * octopiSprite.w;
      const dotY = sy - octopiSprite.h / 2 - t * INVINCIBLE_SPARK_RISE;
      const dotR = INVINCIBLE_SPARK_MIN_R + rndX * (INVINCIBLE_SPARK_MAX_R - INVINCIBLE_SPARK_MIN_R);
      paint.setColor(color);
      paint.setAlphaf((0.5 + 0.3 * Math.sin(f.tick / 10)) * (1 - t));
      canvas.drawCircle(dotX, dotY, dotR, paint);
    }
    paint.setAlphaf(1);
  }

  // Void's temporal freeze: a violet tint over the whole field, on top of everything else.
  if (f.boss !== null && f.boss.freeze > 0) {
    paint.setColor(FREEZE_OVERLAY);
    canvas.drawRect(fieldRect, paint);
  }

  return recorder.finishRecordingAsPicture();
}
