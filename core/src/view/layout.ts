import { FIELD_H, FIELD_W } from '../config';
import type { Input } from '../types';

/** How the fixed playfield maps onto the screen. `scale` is screen points per milli-unit. */
export interface Layout {
  scale: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

/** Fits the playfield by width (by height on screens wider than 1:2), centred horizontally and anchored to the bottom. The top band left over is for the HUD. */
export function fitField(screenW: number, screenH: number): Layout {
  const scale = Math.min(screenW / FIELD_W, screenH / FIELD_H);
  const width = FIELD_W * scale;
  const height = FIELD_H * scale;
  return { scale, offsetX: (screenW - width) / 2, offsetY: screenH - height, width, height };
}

/** Converts a touch point into an integer ship target, lifted by `liftMu` so the ship stays above the finger. */
export function touchToInput(layout: Layout, px: number, py: number, liftMu: number): Input {
  return {
    x: Math.round((px - layout.offsetX) / layout.scale) + 0,
    y: Math.round((py - layout.offsetY) / layout.scale) - liftMu + 0,
  };
}
