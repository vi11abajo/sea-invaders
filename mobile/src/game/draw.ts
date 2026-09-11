import { Skia } from '@shopify/react-native-skia';
import { CRAB, ENEMY_SHOT, SHIP, SHOT, type Frame, type Layout } from '@sea-invaders/core';

type Recorder = ReturnType<typeof Skia.PictureRecorder>;
type Paint = ReturnType<typeof Skia.Paint>;

/** Crab colours by kind, from the web game's crab palette. */
const CRAB_COLORS = ['#3366ff', '#33cc66', '#cc3333', '#9966ff', '#ffdd33'];

/** Records one frame. It runs on the UI thread inside useDerivedValue, so it must stay a worklet. */
export function drawFrame(recorder: Recorder, paint: Paint, f: Frame, l: Layout, w: number, h: number) {
  'worklet';
  const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, w, h));
  const k = l.scale;
  const px = (mu: number) => l.offsetX + mu * k;
  const py = (mu: number) => l.offsetY + mu * k;

  paint.setColor(Skia.Color('#000433'));
  canvas.drawRect({ x: 0, y: 0, width: w, height: h }, paint);
  paint.setColor(Skia.Color('#0C2A6E'));
  canvas.drawRect({ x: l.offsetX, y: l.offsetY, width: l.width, height: l.height }, paint);

  const crab = CRAB.size * k;
  for (let i = 0; i < f.crabs.length; i += 3) {
    paint.setColor(Skia.Color(CRAB_COLORS[f.crabs[i + 2]!] ?? '#ffffff'));
    canvas.drawRect({ x: px(f.crabs[i]!) - crab / 2, y: py(f.crabs[i + 1]!) - crab / 2, width: crab, height: crab }, paint);
  }

  paint.setColor(Skia.Color('#F8E3CC'));
  const sw = SHOT.w * k;
  const sh = SHOT.h * k;
  for (let i = 0; i < f.shots.length; i += 2) {
    canvas.drawRect({ x: px(f.shots[i]!) - sw / 2, y: py(f.shots[i + 1]!) - sh / 2, width: sw, height: sh }, paint);
  }

  paint.setColor(Skia.Color('#FF6B6B'));
  for (let i = 0; i < f.enemyShots.length; i += 2) {
    canvas.drawCircle(px(f.enemyShots[i]!), py(f.enemyShots[i + 1]!), ENEMY_SHOT.radius * k, paint);
  }

  // Ship: the sprite-sized circle and the much smaller hitbox. It blinks while invulnerable.
  if (f.ship.invuln === 0 || Math.floor(f.ship.invuln / 6) % 2 === 0) {
    paint.setColor(Skia.Color('#4E9CFA'));
    canvas.drawCircle(px(f.ship.x), py(f.ship.y), (SHIP.size / 2) * k, paint);
    paint.setColor(Skia.Color('#F8E3CC'));
    canvas.drawCircle(px(f.ship.x), py(f.ship.y), SHIP.hitRadius * k, paint);
  }
  return recorder.finishRecordingAsPicture();
}
