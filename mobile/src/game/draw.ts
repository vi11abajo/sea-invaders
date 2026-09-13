import { BlendMode, ClipOp, PaintStyle, Skia, TileMode, type SkFont } from '@shopify/react-native-skia';
import {
  BOOSTS, BOOST_INDEX, BOSS, BOSS_SHOT, DROP, ENEMY_SHOT, KIND_INDEX, RARITY_ORDER, SHIP,
  type BoostType, type Frame, type Layout,
} from '@sea-invaders/core';
import type { PreparedSprite, PreparedSprites } from './sprites';

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
const SCRIM_COLOR = Skia.Color('rgba(0,0,0,0.45)');
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

const SHIELD_COLOR = Skia.Color('rgba(0,221,255,0.6)');
const PLAYER_SHIELD_STROKE = 4;
const BOSS_SHIELD_STROKE = 6;

const WELL_RADIUS = 400;
const WELL_FILL_COLOR = Skia.Color('rgba(20,10,40,0.55)');
const WELL_STROKE_COLOR = Skia.Color('#9966FF');
const WELL_STROKE_W = 3;

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

/** A unit box centred on the origin, reused (via `canvas.scale`) for the zigzag diamond and the drop's rounded square — never reallocated per shot/drop. */
const UNIT_SQUARE = { x: -0.5, y: -0.5, width: 1, height: 1 };
/** A narrow unit rect trailing above the origin, reused for the meteor's motion trail. */
const METEOR_TRAIL_UNIT = { x: -0.15, y: -2.4, width: 0.3, height: 2 };
/** One rounded-rect resource built once (never per drop): drawn at `DROP.size * k` via `canvas.scale`. */
const DROP_RRECT = Skia.RRectXY(UNIT_SQUARE, 0.15, 0.15);
const DROP_TEXT_COLOR = Skia.Color('#0B0F1A');

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

/** Two-letter code per `BoostType` (spec, `BOOST_INDEX` order). */
const BOOST_CODE: Record<BoostType, string> = {
  RAPID_FIRE: 'RF', ICE_FREEZE: 'IF', HEALTH_BOOST: 'HB', POINTS_FREEZE: 'PF',
  SHIELD_BARRIER: 'SB', AUTO_TARGET: 'AT', INVINCIBILITY: 'IN', MULTI_SHOT: 'MS', SCORE_MULTIPLIER: 'SM', RICOCHET: 'RC',
  WAVE_BLAST: 'WB', COIN_SHOWER: 'CS', GRAVITY_WELL: 'GW', PIERCING_BULLETS: 'PB',
  RANDOM_CHAOS: 'RX', SPEED_TAMER: 'ST',
};
/** Rarity colour by `RARITY_ORDER` index (0..3): common, rare, epic, legendary. */
const RARITY_COLOR_HEX = ['#ffffff', '#00ddff', '#9f00ff', '#ffd700'] as const;

interface DropLook {
  color: ReturnType<typeof Skia.Color>;
  code: string;
}

/** One `{ color, code }` entry per `BOOST_INDEX` slot, built once at module load. */
const DROP_LOOK: DropLook[] = Object.entries(BOOST_INDEX).reduce<DropLook[]>((table, [type, index]) => {
  const t = type as BoostType;
  const colorHex = RARITY_COLOR_HEX[RARITY_ORDER.indexOf(BOOSTS[t].rarity)]!;
  table[index] = { color: Skia.Color(colorHex), code: BOOST_CODE[t]! };
  return table;
}, []);

export interface DropTextOffset {
  dx: number;
  dy: number;
}

/**
 * Precomputes each drop code's centring offset for `drawText`, once per font load (see the
 * `useMemo` in `GameScreen` keyed on `font`) rather than measuring text inside the frame loop.
 */
export function dropTextOffsets(font: SkFont): DropTextOffset[] {
  const { ascent, descent } = font.getMetrics();
  return DROP_LOOK.map(({ code }) => {
    const advance = font.getGlyphWidths(font.getGlyphIDs(code)).reduce((sum, glyphW) => sum + glyphW, 0);
    return { dx: -advance / 2, dy: -(ascent + descent) / 2 };
  });
}

/** Draws `sprite` with its top-left corner at `(left, top)`: a plain `drawImage` when pre-scaled, else the precomputed-rect `drawImageRect` fallback (see `PreparedSprites.prescaled`). */
function drawSpriteAt(canvas: Canvas, paint: Paint, sprite: PreparedSprite, prescaled: boolean, left: number, top: number) {
  'worklet';
  if (prescaled) {
    canvas.drawImage(sprite.image, left, top, paint);
    return;
  }
  canvas.save();
  canvas.translate(left, top);
  canvas.drawImageRect(sprite.image, sprite.src, sprite.dest, paint);
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
  font: SkFont | null,
  dropOffsets: DropTextOffset[] | null,
) {
  'worklet';
  const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, w, h));
  const k = l.scale;
  const px = (mu: number) => l.offsetX + mu * k;
  const py = (mu: number) => l.offsetY + mu * k;
  paint.setStyle(FILL);
  paint.setColorFilter(null);
  paint.setAlphaf(1);

  // Reef backdrop, clipped so a fallback-path draw never bleeds past the field's edges.
  canvas.save();
  canvas.clipRect(fieldRect, ClipOp.Intersect, false);
  drawSpriteAt(canvas, paint, sprites.bg, sprites.prescaled, fieldRect.x, fieldRect.y);
  canvas.restore();

  // Dark scrim over the backdrop for readability, before any gameplay entity is drawn.
  paint.setColor(SCRIM_COLOR);
  canvas.drawRect(fieldRect, paint);

  // On screens wider than the field, faint lines mark its sides.
  if (l.offsetX > 0.5) {
    paint.setColor(FIELD_EDGE);
    canvas.drawRect(scratch(l.offsetX - 1, 0, 1, h), paint);
    canvas.drawRect(scratch(l.offsetX + l.width, 0, 1, h), paint);
  }

  // Gravity well: a pulsing dark circle with a violet ring, behind the crabs/ship/bullets.
  if (f.well !== null) {
    const wx = px(f.well.x);
    const wy = py(f.well.y);
    const wr = WELL_RADIUS * k * (1 + 0.15 * Math.sin(f.tick / 6));
    paint.setStyle(FILL);
    paint.setColor(WELL_FILL_COLOR);
    canvas.drawCircle(wx, wy, wr, paint);
    paint.setStyle(STROKE);
    paint.setStrokeWidth(WELL_STROKE_W);
    paint.setColor(WELL_STROKE_COLOR);
    canvas.drawCircle(wx, wy, wr, paint);
    paint.setStyle(FILL);
  }

  // Crabs: the sprite for the crab's kind already encodes its colour/type (TYPE_COLOUR); no tint.
  for (let i = 0; i < f.crabs.length; i += 5) {
    const cx = px(f.crabs[i]!);
    const cy = py(f.crabs[i + 1]!);
    const kind = f.crabs[i + 2]!;
    const sprite = sprites.crabs[kind];
    if (sprite !== undefined) drawSpriteAt(canvas, paint, sprite, sprites.prescaled, cx - sprite.w / 2, cy - sprite.h / 2);
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
    const sprite = sprites.bosses[b.kind - 1];
    if (sprite !== undefined) {
      paint.setColorFilter(b.rage === 1 ? RAGE_FILTER : null);
      drawSpriteAt(canvas, paint, sprite, sprites.prescaled, bx - sprite.w / 2, by - sprite.h / 2);
      paint.setColorFilter(null);
      if (b.transition === 1 && Math.floor(f.tick / 6) % 2 === 0) {
        paint.setColorFilter(WHITE_FLASH_FILTER);
        paint.setAlphaf(0.5);
        drawSpriteAt(canvas, paint, sprite, sprites.prescaled, bx - sprite.w / 2, by - sprite.h / 2);
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

  // Drops: a rounded square in the rarity colour with a two-letter code centred in dark text.
  if (f.drops.length > 0) {
    const dropSize = DROP.size * k;
    paint.setStyle(FILL);
    for (let i = 0; i < f.drops.length; i += 3) {
      const x = px(f.drops[i]!);
      const y = py(f.drops[i + 1]!);
      const typeIndex = f.drops[i + 2]!;
      const look = DROP_LOOK[typeIndex];
      if (look === undefined) continue;
      paint.setColor(look.color);
      canvas.save();
      canvas.translate(x, y);
      canvas.scale(dropSize, dropSize);
      canvas.drawRRect(DROP_RRECT, paint);
      canvas.restore();
      if (font !== null && dropOffsets !== null) {
        const offset = dropOffsets[typeIndex];
        if (offset !== undefined) {
          paint.setColor(DROP_TEXT_COLOR);
          canvas.drawText(look.code, x + offset.dx, y + offset.dy, paint, font);
        }
      }
    }
  }

  // Ship: always the front sprite, swapped for the damage pose while invulnerable (no blink).
  const sx = px(f.ship.x);
  const sy = py(f.ship.y);
  const shipSprite = f.ship.invuln > 0 ? sprites.ship.hit : sprites.ship.front;
  drawSpriteAt(canvas, paint, shipSprite, sprites.prescaled, sx - shipSprite.w / 2, sy - shipSprite.h / 2);
  if (DEV_HITBOX) {
    paint.setColor(SHOT_COLOR);
    paint.setAlphaf(0.6);
    canvas.drawCircle(sx, sy, SHIP.hitRadius * k, paint);
    paint.setAlphaf(1);
  }

  // Player shield: a cyan ring around the ship.
  if (f.shield > 0) {
    paint.setStyle(STROKE);
    paint.setStrokeWidth(PLAYER_SHIELD_STROKE);
    paint.setColor(SHIELD_COLOR);
    canvas.drawCircle(sx, sy, SHIP.size * 0.7 * k, paint);
    paint.setStyle(FILL);
  }

  // Void's temporal freeze: a violet tint over the whole field, on top of everything else.
  if (f.boss !== null && f.boss.freeze > 0) {
    paint.setColor(FREEZE_OVERLAY);
    canvas.drawRect(fieldRect, paint);
  }

  return recorder.finishRecordingAsPicture();
}
