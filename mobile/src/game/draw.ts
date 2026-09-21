import { BlendMode, BlurStyle, ClipOp, FilterMode, MipmapMode, PaintStyle, Skia, TileMode } from '@shopify/react-native-skia';
import {
  BOOSTS, BOOST_INDEX, BOSS, BOSS_SHOT, CRAB_STRIDE, CRAB_TYPES, DROP, ENEMY_SHOT, KIND_INDEX, RARITY_ORDER, OCTOPI, TYPE_INDEX,
  type BoostType, type CrabType, type Frame, type Layout,
} from '@sea-invaders/core';
import { COLORS, SIGNATURE_GRADIENT } from '../ui/tokens';
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
/** Solid dark playfield for runs without a themed world behind them: the darkest of the app's surface tokens. */
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
 * A damaged crab's shell (spec §1 last bullet, core v8): a crab whose `hp` is below its kind's max
 * (armored at 1/2, elder at 2/3 or 1/3) is drawn darker, one Skia colour matrix per lost hit point
 * scaling RGB by `DAMAGE_BRIGHTNESS` (alpha untouched) — 0.7 for one lost point, 0.49 for two. Both
 * matrices are built once here, never per frame or per crab; `TYPE_INDEX`/`CRAB_TYPES` give the max
 * hp for the frame's packed type index without inverting the map every draw.
 */
const DAMAGE_BRIGHTNESS = 0.7;
function brightnessMatrix(factor: number): number[] {
  return [factor, 0, 0, 0, 0, 0, factor, 0, 0, 0, 0, 0, factor, 0, 0, 0, 0, 0, 1, 0];
}
/** Index 0 = one lost hit point (x0.7), index 1 = two lost (x0.49) — the most any kind (elder) has. */
const DAMAGE_FILTERS = [DAMAGE_BRIGHTNESS, DAMAGE_BRIGHTNESS ** 2].map((factor) => Skia.ColorFilter.MakeMatrix(brightnessMatrix(factor)));
/** `TYPE_INDEX[type]` -> `CRAB_TYPES[type].hp`, built once so the crab loop never inverts the map. */
const MAX_HP_BY_TYPE_INDEX: number[] = [];
for (const type of Object.keys(CRAB_TYPES) as CrabType[]) MAX_HP_BY_TYPE_INDEX[TYPE_INDEX[type]] = CRAB_TYPES[type].hp;

/**
 * A damaged crab also gets a short white crack across its shell's upper half (spec §1 last bullet):
 * two or three straight segments, about 40% of the sprite's width, in unit coordinates (fraction of
 * `sprite.w`/`sprite.h`, origin at the sprite's own top-left) so every pattern scales with the crab's
 * on-screen size. Which pattern a crab shows is picked from its slot index in `f.crabs` (same trick
 * as the ICE_FREEZE variant below) so it never flickers frame to frame, and costs only a couple of
 * `drawLine` calls with one shared paint colour/width — no per-crab allocation. The crab loop saves
 * the paint's colour and stroke width before the loop and hands them back after each crack, so the
 * shared paint leaves the loop exactly as it entered it.
 */
const CRACK_COLOR = Skia.Color('#FFFFFF');
/** 1.5 dp, in the milli-unit terms this file already uses for on-screen sizes (14 milli-units/dp, see `SHOT_LOOK`). */
const CRACK_STROKE_W = 21;
const CRACK_PATTERNS: readonly (readonly [number, number])[][] = [
  [[0.30, 0.18], [0.70, 0.30], [0.46, 0.48]],
  [[0.68, 0.16], [0.32, 0.30], [0.56, 0.46]],
  [[0.32, 0.46], [0.48, 0.18], [0.66, 0.36], [0.44, 0.48]],
];

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

/**
 * `stops` as a closed loop of `perSegment` evenly interpolated `#RRGGBB` colours between each pair of
 * neighbours (the last stop blends back into the first), built once on the JS thread.
 */
function colorLoop(stops: readonly string[], perSegment: number): string[] {
  const rgb = stops.map((hex) => {
    const v = Number.parseInt(hex.slice(1, 7), 16);
    return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff] as const;
  });
  const out: string[] = [];
  for (let i = 0; i < rgb.length; i++) {
    const a = rgb[i]!;
    const b = rgb[(i + 1) % rgb.length]!;
    for (let s = 0; s < perSegment; s++) {
      const t = s / perSegment;
      const ch = [0, 1, 2].map((c) => Math.round(a[c]! + (b[c]! - a[c]!) * t).toString(16).padStart(2, '0'));
      out.push(`#${ch.join('')}`);
    }
  }
  return out;
}

/**
 * INVINCIBILITY indication (owner ruling 2026-09-13): Octopi itself flashes through the Solana
 * signature gradient. Its silhouette is drawn again over the sprite in one colour of the gradient
 * loop (`SrcIn` keeps the sprite's own alpha, so every skin and both poses work), the colour stepping
 * every `INVINCIBLE_STEP_TICKS` and the overlay pulsing between `INVINCIBLE_ALPHA_MIN` and
 * `INVINCIBLE_ALPHA_MAX` once per `INVINCIBLE_PULSE_TICKS`. One colour filter per step of the loop is
 * built here, never per frame; the rising sparks take the same colour.
 */
const INVINCIBLE_LOOP = colorLoop(SIGNATURE_GRADIENT.colors, 4);
const INVINCIBLE_COLORS = INVINCIBLE_LOOP.map((hex) => Skia.Color(hex));
const INVINCIBLE_FILTERS = INVINCIBLE_LOOP.map((hex) => Skia.ColorFilter.MakeBlend(Skia.Color(hex), BlendMode.SrcIn));
const INVINCIBLE_STEP_TICKS = 2;
const INVINCIBLE_PULSE_TICKS = 20;
const INVINCIBLE_ALPHA_MIN = 0.25;
const INVINCIBLE_ALPHA_MAX = 0.8;
const INVINCIBLE_SPARK_COUNT = 4;
const INVINCIBLE_SPARK_RISE_TICKS = 18;
/** How far a spark rises over its lifetime, and its size range, both in dp (unscaled). */
const INVINCIBLE_SPARK_RISE = 24;
const INVINCIBLE_SPARK_MIN_R = 2;
const INVINCIBLE_SPARK_MAX_R = 4;

/**
 * Where and when WAVE_BLAST fired: the tick of its `boost_pickup` event and Octopi's position then,
 * in milli-units. `GameScreen` records it; `drawFrame` animates the shock rings from it.
 */
export interface WaveBlast {
  tick: number;
  x: number;
  y: number;
}

/**
 * WAVE_BLAST (legacy `boost-effects.js` `createWaveBlastEffect`): three shock rings expand from where
 * Octopi picked the boost up, each radius growing linearly to `reach` x the field's longer side over
 * `life` ticks while fading out (alpha = 1 - progress), with a soft glow (legacy `shadowBlur`); the
 * rings are `BLAST_STROKE_W * intensity` wide and each gets an inner ring at 0.8 of its radius. Legacy
 * lives 0.5 / 0.4 / 0.3 s are 30 / 24 / 18 ticks; its 10 / 20 ms stagger rounds to one tick. The glow
 * mask filters are built here once.
 */
const BLAST_RINGS = [
  { color: Skia.Color('#0088ff'), life: 30, delay: 0, reach: 1, intensity: 1 },
  { color: Skia.Color('#00aaff'), life: 24, delay: 1, reach: 0.7, intensity: 0.6 },
  { color: Skia.Color('#66ccff'), life: 18, delay: 1, reach: 0.5, intensity: 0.3 },
].map((ring) => ({ ...ring, glow: Skia.MaskFilter.MakeBlur(BlurStyle.Normal, Math.max(2, 8 * ring.intensity), true) }));
const BLAST_STROKE_W = 8;
const BLAST_INNER_W = 4;
/** The inner ring only shows once the ring has opened this far (dp), as in the legacy. */
const BLAST_INNER_FROM = 20;

/**
 * Legacy black-hole look (spec M8): base/pulse glow radius in units; `pulse = 0.5 + 0.5*sin(tick/4)`.
 * Half the legacy size (1470 / 550) since 2026-09-16 - the owner found the full one too big on the
 * phone; the well's pull radius in the core is unchanged.
 */
const WELL_GLOW_BASE = 735;
const WELL_GLOW_PULSE = 275;
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

/**
 * `heavy`'s diameter, in milli-units: the red crab's own shot, `ENEMY_SHOT.radius * 1.6 = 154` in
 * the core (`core/src/sim/collide.ts:shotRadius`) — this is that radius doubled. The `fast` kind
 * (swift's own shot) went with core v8, so its bar look is gone too.
 */
const HEAVY_DIAMETER = 308;

/** A unit box centred on the origin, reused (via `canvas.scale`) for the zigzag diamond — never reallocated per shot. */
const UNIT_SQUARE = { x: -0.5, y: -0.5, width: 1, height: 1 };
/** A narrow unit rect trailing above the origin, reused for the meteor's motion trail. */
const METEOR_TRAIL_UNIT = { x: -0.15, y: -2.4, width: 0.3, height: 2 };

/** Reused for every axis-aligned shot/UI shape whose size or position varies frame to frame (the
 * field's side edges, a player shot's glow and core, the boss shield ellipse): each draw call
 * consumes it synchronously, so one shared instance is safe across sequential uses within the same
 * frame — no per-shot alloc. */
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
  blast: WaveBlast | null,
  solidField: boolean,
) {
  'worklet';
  const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, w, h));
  const k = l.scale;
  const px = (mu: number) => l.offsetX + mu * k;
  const py = (mu: number) => l.offsetY + mu * k;
  paint.setStyle(FILL);
  paint.setColorFilter(null);
  paint.setAlphaf(1);

  // Solid dark playfield (spec M4), unless a themed world (a campaign reef) shows through behind the run.
  if (solidField) {
    paint.setColor(FIELD_BG_COLOR);
    canvas.drawRect(fieldRect, paint);
  }

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

  // Crabs: the sprite for the crab's kind already encodes its colour/type (TYPE_COLOUR); no tint,
  // except a damaged crab (hp below its kind's max), drawn darker with a crack across its shell.
  // A crack borrows the shared paint for a stroke; these are the values it has to hand back.
  const crabPaintColor = paint.getColor();
  const crabPaintStrokeWidth = paint.getStrokeWidth();
  for (let i = 0; i < f.crabs.length; i += CRAB_STRIDE) {
    const cx = px(f.crabs[i]!);
    const cy = py(f.crabs[i + 1]!);
    const kind = f.crabs[i + 2]!;
    const typeIndex = f.crabs[i + 3]!;
    const hp = f.crabs[i + 4]!;
    // f.crabs[i + 5] is `flags` (1 shield up, 2 heralded, 4 revived, 8 raging); not drawn yet, a
    // later task's effects.
    const sprite = sprites.crabs[kind];
    if (sprite === undefined) continue;
    const lost = (MAX_HP_BY_TYPE_INDEX[typeIndex] ?? hp) - hp;
    const damageFilter = lost > 0 ? DAMAGE_FILTERS[Math.min(lost, DAMAGE_FILTERS.length) - 1]! : null;
    if (damageFilter !== null) paint.setColorFilter(damageFilter);
    drawSpriteAt(canvas, paint, sprite, cx - sprite.w / 2, cy - sprite.h / 2);
    if (damageFilter !== null) {
      paint.setColorFilter(null);
      const left = cx - sprite.w / 2;
      const top = cy - sprite.h / 2;
      const pattern = CRACK_PATTERNS[Math.floor(i / CRAB_STRIDE) % CRACK_PATTERNS.length]!;
      paint.setStyle(STROKE);
      paint.setStrokeWidth(CRACK_STROKE_W * k);
      paint.setColor(CRACK_COLOR);
      for (let s = 1; s < pattern.length; s++) {
        const [x0, y0] = pattern[s - 1]!;
        const [x1, y1] = pattern[s]!;
        canvas.drawLine(left + x0 * sprite.w, top + y0 * sprite.h, left + x1 * sprite.w, top + y1 * sprite.h, paint);
      }
      paint.setStyle(FILL);
      paint.setStrokeWidth(crabPaintStrokeWidth);
      paint.setColor(crabPaintColor);
    }
    if (iceFreeze) {
      const variant = (Math.floor(i / CRAB_STRIDE) + kind) % 3;
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

  // Enemy shots: crab glow unchanged; heavy and boss kinds get their own shape and colour.
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
        // The red `heavy` crab's own shot (core v8): wider than a plain crab shot, no glow.
        paint.setColor(HEAVY_COLOR);
        canvas.drawCircle(x, y, (HEAVY_DIAMETER / 2) * k, paint);
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
  // Both poses come from `prepareOctopi` already in the run's look (the skin or the campaign octopi's
  // tint, baked into their snapshots); only a pose whose snapshot failed carries the tint's prebuilt
  // colour filter, which its full-size fallback draw applies here.
  const sx = px(f.octopi.x);
  const sy = py(f.octopi.y);
  const octopiSprite = f.octopi.invuln > 0 ? sprites.octopi.hit : sprites.octopi.front;
  if (octopiSprite.filter !== null) paint.setColorFilter(octopiSprite.filter);
  drawSpriteAt(canvas, paint, octopiSprite, sx - octopiSprite.w / 2, sy - octopiSprite.h / 2);
  if (octopiSprite.filter !== null) paint.setColorFilter(null);

  // INVINCIBILITY: Octopi's silhouette again, in the current colour of the Solana gradient loop.
  let invincible = false;
  for (let i = 0; i < f.boosts.length; i += 2) {
    if (f.boosts[i] === BOOST_INDEX.INVINCIBILITY) {
      invincible = true;
      break;
    }
  }
  const invincibleStep = Math.floor(f.tick / INVINCIBLE_STEP_TICKS) % INVINCIBLE_FILTERS.length;
  const invinciblePulse = 0.5 + 0.5 * Math.sin((f.tick / INVINCIBLE_PULSE_TICKS) * 2 * Math.PI);
  if (invincible) {
    paint.setColorFilter(INVINCIBLE_FILTERS[invincibleStep]!);
    paint.setAlphaf(INVINCIBLE_ALPHA_MIN + (INVINCIBLE_ALPHA_MAX - INVINCIBLE_ALPHA_MIN) * invinciblePulse);
    drawSpriteAt(canvas, paint, octopiSprite, sx - octopiSprite.w / 2, sy - octopiSprite.h / 2);
    paint.setColorFilter(null);
    paint.setAlphaf(1);
  }
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

  // INVINCIBILITY: sparks rising off Octopi in the same gradient colour as its flash.
  if (invincible) {
    const color = INVINCIBLE_COLORS[invincibleStep]!;
    for (let i = 0; i < INVINCIBLE_SPARK_COUNT; i++) {
      const rndX = ((f.tick * 37 + i * 101) % 97) / 97;
      const rndPhase = ((f.tick * 53 + i * 131) % 89) / 89;
      const phase = (f.tick + Math.floor(rndPhase * INVINCIBLE_SPARK_RISE_TICKS)) % INVINCIBLE_SPARK_RISE_TICKS;
      const t = phase / INVINCIBLE_SPARK_RISE_TICKS;
      const dotX = sx + (rndX - 0.5) * octopiSprite.w;
      const dotY = sy - octopiSprite.h / 2 - t * INVINCIBLE_SPARK_RISE;
      const dotR = INVINCIBLE_SPARK_MIN_R + rndX * (INVINCIBLE_SPARK_MAX_R - INVINCIBLE_SPARK_MIN_R);
      paint.setColor(color);
      paint.setAlphaf((0.5 + 0.3 * invinciblePulse) * (1 - t));
      canvas.drawCircle(dotX, dotY, dotR, paint);
    }
    paint.setAlphaf(1);
  }

  // WAVE_BLAST: the shock rings, kept inside the field.
  if (blast !== null) {
    const bx = px(blast.x);
    const by = py(blast.y);
    const maxR = Math.max(fieldRect.width, fieldRect.height);
    canvas.save();
    canvas.clipRect(fieldRect, ClipOp.Intersect, true);
    paint.setStyle(STROKE);
    for (let i = 0; i < BLAST_RINGS.length; i++) {
      const ring = BLAST_RINGS[i]!;
      const age = f.tick - blast.tick - ring.delay;
      if (age < 0 || age >= ring.life) continue;
      const progress = age / ring.life;
      const r = progress * ring.reach * maxR;
      const alpha = 1 - progress;
      const width = Math.max(1, BLAST_STROKE_W * ring.intensity);
      paint.setColor(ring.color);
      paint.setMaskFilter(ring.glow);
      paint.setStrokeWidth(width * 2);
      paint.setAlphaf(alpha * ring.intensity * 0.6);
      canvas.drawCircle(bx, by, r, paint);
      paint.setMaskFilter(null);
      paint.setStrokeWidth(width);
      paint.setAlphaf(alpha);
      canvas.drawCircle(bx, by, r, paint);
      if (r > BLAST_INNER_FROM) {
        paint.setStrokeWidth(Math.max(1, BLAST_INNER_W * ring.intensity));
        paint.setAlphaf(alpha * ring.intensity * 0.5);
        canvas.drawCircle(bx, by, r * 0.8, paint);
      }
    }
    paint.setStyle(FILL);
    paint.setAlphaf(1);
    canvas.restore();
  }

  // Void's temporal freeze: a violet tint over the whole field, on top of everything else.
  if (f.boss !== null && f.boss.freeze > 0) {
    paint.setColor(FREEZE_OVERLAY);
    canvas.drawRect(fieldRect, paint);
  }

  return recorder.finishRecordingAsPicture();
}
