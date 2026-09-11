import { PaintStyle, Skia } from '@shopify/react-native-skia';
import { CRAB, ENEMY_SHOT, SHIP, type Frame, type Layout } from '@sea-invaders/core';

type Recorder = ReturnType<typeof Skia.PictureRecorder>;
type Paint = ReturnType<typeof Skia.Paint>;

/** Crab colours by kind: the reef-life palette. The rings stand in for the owner's crab art. */
const CRAB_COLORS = ['#CFF15E', '#55E9AB', '#CA9FF5', '#F48252', '#FFC526'];
const SHOT_COLOR = '#19FB9B';
const ENEMY_SHOT_COLOR = '#F48252';
const FIELD_EDGE = 'rgba(236,228,253,0.12)';
/** Visible player shot in milli-units: 3 x 18 dp on a 400 dp wide field. The hitbox stays SHOT's. */
const SHOT_LOOK = { w: 42, h: 253 };
const FILL = PaintStyle.Fill;
const STROKE = PaintStyle.Stroke;

/**
 * Records one frame on a transparent canvas; the world backdrop is drawn behind it.
 * It runs on the UI thread inside useDerivedValue, so it must stay a worklet.
 */
export function drawFrame(recorder: Recorder, paint: Paint, f: Frame, l: Layout, w: number, h: number) {
  'worklet';
  const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, w, h));
  const k = l.scale;
  const px = (mu: number) => l.offsetX + mu * k;
  const py = (mu: number) => l.offsetY + mu * k;
  paint.setStyle(FILL);

  // On screens wider than the field, faint lines mark its sides.
  if (l.offsetX > 0.5) {
    paint.setColor(Skia.Color(FIELD_EDGE));
    canvas.drawRect({ x: l.offsetX - 1, y: 0, width: 1, height: h }, paint);
    canvas.drawRect({ x: l.offsetX + l.width, y: 0, width: 1, height: h }, paint);
  }

  // Crabs: a faint disc inside a ring of the kind's reef colour.
  const crabR = (CRAB.size / 2) * k;
  for (let i = 0; i < f.crabs.length; i += 3) {
    const cx = px(f.crabs[i]!);
    const cy = py(f.crabs[i + 1]!);
    paint.setColor(Skia.Color(CRAB_COLORS[f.crabs[i + 2]!] ?? '#FFFFFF'));
    paint.setStyle(FILL);
    paint.setAlphaf(0.14);
    canvas.drawCircle(cx, cy, crabR, paint);
    paint.setStyle(STROKE);
    paint.setStrokeWidth(1.5);
    paint.setAlphaf(0.9);
    canvas.drawCircle(cx, cy, crabR - 0.75, paint);
  }
  paint.setStyle(FILL);

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
  for (let i = 0; i < f.enemyShots.length; i += 2) {
    const x = px(f.enemyShots[i]!);
    const y = py(f.enemyShots[i + 1]!);
    paint.setAlphaf(0.25);
    canvas.drawCircle(x, y, er * 1.9, paint);
    paint.setAlphaf(1);
    canvas.drawCircle(x, y, er, paint);
  }

  // Ship: a ring standing in for Octopi, and its much smaller hitbox. It blinks while invulnerable.
  if (f.ship.invuln === 0 || Math.floor(f.ship.invuln / 6) % 2 === 0) {
    const sx = px(f.ship.x);
    const sy = py(f.ship.y);
    const shipR = (SHIP.size / 2) * k;
    paint.setColor(Skia.Color('#000000'));
    paint.setAlphaf(0.15);
    canvas.drawCircle(sx, sy, shipR, paint);
    paint.setColor(Skia.Color('#FFFFFF'));
    paint.setStyle(STROKE);
    paint.setStrokeWidth(1.5);
    paint.setAlphaf(0.7);
    canvas.drawCircle(sx, sy, shipR - 0.75, paint);
    paint.setStyle(FILL);
    paint.setColor(Skia.Color(SHOT_COLOR));
    paint.setAlphaf(0.6);
    canvas.drawCircle(sx, sy, SHIP.hitRadius * k, paint);
  }
  return recorder.finishRecordingAsPicture();
}
