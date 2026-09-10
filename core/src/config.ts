/**
 * Gameplay constants in milli-units and ticks. The playfield is fixed and
 * identical on every device so that ranked runs are comparable.
 */
export const FIELD_W = 5625; // 5.625 units
export const FIELD_H = 11250; // 11.25 units

export const SHIP = {
  /** Sprite box: 20% of the field width. */
  size: 1125,
  /** Hitbox radius: a 0.32-unit circle, 3–4x smaller than the sprite. */
  hitRadius: 160,
  /** Maximum movement per axis per tick. */
  maxStep: 250,
  minY: 5000,
  maxY: FIELD_H - 700,
  startY: FIELD_H - 1600,
  lives: 3,
  invulnTicks: 120,
  fireInterval: 8,
} as const;

export const SHOT = { w: 120, h: 360, speed: 240 } as const;

export const ENEMY_SHOT = {
  radius: 96,
  speed: 110,
  /** Wave-1 fire chance per tick, in 1/1000. */
  perMille: 20,
} as const;

export const CRAB = {
  /** About 9.4% of the field width. */
  size: 530,
  kinds: 5,
  cols: 6,
  gapX: 800,
  gapY: 700,
  startY: 1500,
  /** Horizontal speed per tick at the start of wave 1. */
  baseSpeed: 6,
  stepDown: 250,
  points: 10,
} as const;
