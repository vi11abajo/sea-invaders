import { BlendMode, ClipOp, PaintStyle, Skia, type SkColorFilter } from '@shopify/react-native-skia';
import { CRAB, ENEMY_SHOT, SHIP, type Frame, type Layout } from '@sea-invaders/core';
import type { Sprites } from './sprites';

type Recorder = ReturnType<typeof Skia.PictureRecorder>;
type Paint = ReturnType<typeof Skia.Paint>;

/** Read once on the JS thread; the worklet below closes over this value rather than the global. */
declare const __DEV__: boolean;
const DEV_HITBOX = __DEV__;

/**
 * Crab tint by `typeIndex` (normal, armored, swift, fanner, diver): `null` keeps the sprite's own
 * colours (kind picks the crab's base sprite); the rest modulate/lighten the sprite to read the type
 * at a glance without a second sprite set.
 */
const TYPE_FILTERS: (SkColorFilter | null)[] = [
  null,
  Skia.ColorFilter.MakeBlend(Skia.Color('#8A8F9C'), BlendMode.Modulate),
  Skia.ColorFilter.MakeBlend(Skia.Color('#FFFFFF'), BlendMode.Screen),
  Skia.ColorFilter.MakeBlend(Skia.Color('#FFD166'), BlendMode.Modulate),
  Skia.ColorFilter.MakeBlend(Skia.Color('#FF5C5C'), BlendMode.Modulate),
];

const SHOT_COLOR = '#19FB9B';
const ENEMY_SHOT_COLOR = '#F48252';
const FIELD_EDGE = 'rgba(236,228,253,0.12)';
/** Visible player shot in milli-units: 3 x 18 dp on a 400 dp wide field. The hitbox stays SHOT's. */
const SHOT_LOOK = { w: 42, h: 253 };
const FILL = PaintStyle.Fill;

/**
 * Records one frame on a transparent canvas; the world backdrop is drawn behind it.
 * It runs on the UI thread inside useDerivedValue, so it must stay a worklet.
 * `facing`: -1 left, 0 front, 1 right — picks the Octopi sprite.
 */
export function drawFrame(recorder: Recorder, paint: Paint, f: Frame, l: Layout, w: number, h: number, sprites: Sprites, facing: number) {
  'worklet';
  const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, w, h));
  const k = l.scale;
  const px = (mu: number) => l.offsetX + mu * k;
  const py = (mu: number) => l.offsetY + mu * k;
  paint.setStyle(FILL);
  paint.setColorFilter(null);
  paint.setAlphaf(1);

  // Reef backdrop: aspect-fill bg1 to the field rectangle, clipped so it never bleeds past the sides.
  const fieldRect = { x: l.offsetX, y: l.offsetY, width: l.width, height: l.height };
  canvas.save();
  canvas.clipRect(fieldRect, ClipOp.Intersect, false);
  const bg = sprites.bg;
  const bgW = bg.width();
  const bgH = bg.height();
  const fieldAspect = l.width / l.height;
  const bgAspect = bgW / bgH;
  let bsx = 0;
  let bsy = 0;
  let bsw = bgW;
  let bsh = bgH;
  if (bgAspect > fieldAspect) {
    bsw = bgH * fieldAspect;
    bsx = (bgW - bsw) / 2;
  } else {
    bsh = bgW / fieldAspect;
    bsy = (bgH - bsh) / 2;
  }
  canvas.drawImageRect(bg, { x: bsx, y: bsy, width: bsw, height: bsh }, fieldRect, paint);
  canvas.restore();

  // On screens wider than the field, faint lines mark its sides.
  if (l.offsetX > 0.5) {
    paint.setColor(Skia.Color(FIELD_EDGE));
    canvas.drawRect({ x: l.offsetX - 1, y: 0, width: 1, height: h }, paint);
    canvas.drawRect({ x: l.offsetX + l.width, y: 0, width: 1, height: h }, paint);
  }

  // Crabs: the sprite for the crab's kind (colour), tinted by its type.
  const crabSize = CRAB.size * k;
  for (let i = 0; i < f.crabs.length; i += 5) {
    const cx = px(f.crabs[i]!);
    const cy = py(f.crabs[i + 1]!);
    const kind = f.crabs[i + 2]!;
    const typeIndex = f.crabs[i + 3]!;
    const image = sprites.crabs[kind]!;
    paint.setColorFilter(TYPE_FILTERS[typeIndex]!);
    canvas.drawImageRect(
      image,
      { x: 0, y: 0, width: image.width(), height: image.height() },
      { x: cx - crabSize / 2, y: cy - crabSize / 2, width: crabSize, height: crabSize },
      paint,
    );
  }
  paint.setColorFilter(null);

  // Player shots: a bright core over a soft glow.
  const sw = SHOT_LOOK.w * k;
  const sh = SHOT_LOOK.h * k;
  paint.setColor(Skia.Color(SHOT_COLOR));
  for (let i = 0; i < f.shots.length; i += 2) {
    const x = px(f.shots[i]!) - sw / 2;
    const y = py(f.shots[i + 1]!) - sh / 2;
    paint.setAlphaf(0.25);
    canvas.drawRect({ x: x - sw, y: y - sw, width: sw * 3, height: sh + sw * 2 }, paint);
    paint.setAlphaf(1);
    canvas.drawRect({ x, y, width: sw, height: sh }, paint);
  }

  // Enemy shots: orange, with the same kind of glow.
  const er = ENEMY_SHOT.radius * k;
  paint.setColor(Skia.Color(ENEMY_SHOT_COLOR));
  for (let i = 0; i < f.enemyShots.length; i += 3) {
    const x = px(f.enemyShots[i]!);
    const y = py(f.enemyShots[i + 1]!);
    paint.setAlphaf(0.25);
    canvas.drawCircle(x, y, er * 1.9, paint);
    paint.setAlphaf(1);
    canvas.drawCircle(x, y, er, paint);
  }
  paint.setAlphaf(1);

  // Ship: the Octopi sprite by movement direction. It blinks while invulnerable.
  if (f.ship.invuln === 0 || Math.floor(f.ship.invuln / 6) % 2 === 0) {
    const sx = px(f.ship.x);
    const sy = py(f.ship.y);
    const image = facing < 0 ? sprites.ship.left : facing > 0 ? sprites.ship.right : sprites.ship.front;
    const shipW = SHIP.size * k;
    const shipH = shipW * (image.height() / image.width());
    canvas.drawImageRect(
      image,
      { x: 0, y: 0, width: image.width(), height: image.height() },
      { x: sx - shipW / 2, y: sy - shipH / 2, width: shipW, height: shipH },
      paint,
    );
    if (DEV_HITBOX) {
      paint.setColor(Skia.Color(SHOT_COLOR));
      paint.setAlphaf(0.6);
      canvas.drawCircle(sx, sy, SHIP.hitRadius * k, paint);
      paint.setAlphaf(1);
    }
  }
  return recorder.finishRecordingAsPicture();
}
