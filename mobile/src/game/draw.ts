import { BlendMode, BlurStyle, ClipOp, FilterMode, MipmapMode, PaintStyle, Skia, TileMode } from '@shopify/react-native-skia';
import {
  AIM_STRIDE, BOOSTS, BOOST_INDEX, BOSS, BOSS_SHOT, BUBBLE_RADIUS, CHARGE_RADIUS, CRAB_STRIDE, CRAB_TYPES,
  DROP, ENEMY_SHOT, FIELD_W, FIREWALL_SLOTS, KIND_INDEX, LANE_COUNT, LANE_STRIDE, OBSTACLE_STRIDE,
  RARITY_ORDER, OCTOPI, TYPE_INDEX,
  type BoostType, type CrabType, type Frame, type Layout,
} from '@sea-invaders/core';
import { BOSS_HEX, BOSS_RGB } from './bossPalette';
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

/** Boss palette by kind 1..10 (spec §4.2 / §5.2), from the shared table (`bossPalette.ts`, ruling R44). */
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

// ---------------------------------------------------------------------------------------------
// Reefs 6-10 (spec §7/§8, task 12): the veteran crab flags, the new arena/lane/aim arrays, the new
// boss flags and the new enemy shot kinds 14-21. Every colour/shader/path below is built once here,
// at module scope, never per frame or per crab (ruling R49) — the worklet only ever reads them.
// ---------------------------------------------------------------------------------------------

/** Warden's rune shield (frame flag bit 0): a stroked arc around the crab, gapped rather than a full ring. */
const WARDEN_SHIELD_COLOR = Skia.Color('rgba(80,220,255,0.85)');
/** dp (unscaled) — a HUD-scale stroke, not a milli-unit one, so it is never multiplied by `k`. */
const WARDEN_SHIELD_STROKE_W = 3;
/** Herald's aura (frame flag bit 1): a thin pulsing ring, plus a faint link line to the nearest herald. */
const HERALD_RING_COLOR = Skia.Color('rgba(255,221,120,0.8)');
/** dp (unscaled), same reasoning as `WARDEN_SHIELD_STROKE_W`. */
const HERALD_RING_STROKE_W = 2;
const HERALD_LINK_STROKE_W = 2;
const HERALD_LINK_ALPHA = 0.32;
/** Patriarch's rally mark (frame flag bit 2): a small gold ring over a just-revived crab. */
const RALLY_MARK_COLOR = Skia.Color('rgba(255,210,60,0.9)');
/** dp (unscaled), same reasoning as `WARDEN_SHIELD_STROKE_W`. */
const RALLY_MARK_STROKE_W = 2;
/** Formation rage (frame flag bit 3): a red tint pulse over a raging crab. */
const CRAB_RAGE_TINT_COLOR = Skia.Color('#FF3333');

/**
 * How many heralds `drawFrame` tracks for the aura's link line, a fixed scratch buffer (never
 * reallocated) filled by one pre-pass over `f.crabs` before the main crab loop below. A formation
 * fields far fewer heralds than this in real play; a fight with more simply skips the link for the
 * ones past the cap and still draws the ring alone, which the spec explicitly allows ("if cheap").
 */
const MAX_HERALDS_TRACKED = 16;
const HERALD_SCRATCH_X: number[] = new Array(MAX_HERALDS_TRACKED).fill(0);
const HERALD_SCRATCH_Y: number[] = new Array(MAX_HERALDS_TRACKED).fill(0);

/** Frost Castellan's crystals (`frame.obstacles`, `OBSTACLE_INDEX.crystal`): a faceted diamond in the reef's cold tint. */
const CRYSTAL_COLOR = Skia.Color('rgba(160,220,255,0.85)');
/** A unit diamond (top/right/bottom/left points), reused via `canvas.scale` for every crystal — never rebuilt per frame. */
const CRYSTAL_UNIT_PATH = Skia.Path.Polygon(
  [
    { x: 0, y: -0.5 },
    { x: 0.5, y: 0 },
    { x: 0, y: 0.5 },
    { x: -0.5, y: 0 },
  ],
  true,
);
/**
 * Crack lines drawn across a crystal as it takes hits, scaling with `12 - hp` (ruling R45's own
 * literal — a crystal's full 12 hp comes from `castellan.ts`'s own `CRYSTAL_HP`, not exported, so the
 * ruling's number is used verbatim rather than re-derived). Centred unit coordinates, transformed the
 * same way the crab damage cracks are (absolute `ox + x*ow`), not inside the diamond's own
 * `canvas.scale`, so the stroke width stays a constant dp regardless of the crystal's own box size.
 */
const CRYSTAL_CRACK_LINES: readonly (readonly [number, number, number, number])[] = [
  [0, -0.4, 0, 0.42],
  [-0.38, 0, 0.38, 0],
  [0, 0, 0.32, -0.3],
  [0, 0, -0.3, 0.32],
  [0, 0, 0.3, 0.3],
  [0, 0, -0.32, -0.3],
];
/** A crystal at full 12 hp shows no cracks; every 2 hp lost reveals one more of the six lines above. */
const CRYSTAL_FULL_HP = 12;
/**
 * Shatter's own warning (ruling R61, fix round 1): every crystal in `frame.obstacles` pulses this
 * tint for `CRYSTAL_SHATTER_WARN_TICKS` ticks after a `crystal_shatter` event — the Frost Castellan's
 * own warning length (`SHATTER_WARNING`, `core/src/sim/bosses/castellan.ts`, not exported, so the
 * ruling's own number is used verbatim, the same "literal over a private core constant" call already
 * made for `CRYSTAL_FULL_HP` above) — faster than the lane warning's own pulse, so the two read as
 * different urgencies. The one-shot flash the app drew before this fix round is folded into this
 * window's own start rather than kept separately (see the fix-round report for why).
 */
const CRYSTAL_SHATTER_WARN_TICKS = 120;
const CRYSTAL_SHATTER_PULSE_PERIOD = 10;
const CRYSTAL_WARN_COLOR = Skia.Color('rgba(255,140,140,0.6)');

/** Storm Tyrant's lanes (`frame.lanes`): the field split into `LANE_COUNT` equal vertical strips. */
const LANE_WIDTH = FIELD_W / LANE_COUNT;
const LANE_WARNING_COLOR = Skia.Color('#FF6666');
/** The strike itself (`lane_strike`, one-shot): a brighter flash over the same width. */
const LANE_STRIKE_COLOR = Skia.Color('#FFEE99');
const LANE_STRIKE_LIFETIME = 12;

/** Abyssal Huntsman's sight line (`frame.aim`): a thin line past the far point to the field edge. */
const AIM_LINE_COLOR = Skia.Color('#FF5C5C');
const AIM_LINE_STROKE_W = 2;
/** How far past the far point the line is drawn — the field's own clip cuts it off cleanly. */
const AIM_EXTEND = 4;
/** The line fades in over its last `AIM_FADE_TICKS` ticks rather than snapping off at 0. */
const AIM_FADE_TICKS = 12;

/** Verdant Templar's firewall gap marker (`boss_windup`, one-shot, kind 6 only): two bright bars. */
const FIREWALL_GAP_COLOR = Skia.Color('#8CFFC2');
const FIREWALL_GAP_LIFETIME = 45;
const FIREWALL_GAP_BAR_W = 24;

/** Verdant Templar's shell (`shieldUp`): a filled dome over the boss, distinct from the `shieldHp` oval. */
const BOSS_DOME_COLOR = Skia.Color('rgba(120,255,180,0.5)');
const BOSS_DOME_STROKE = 4;
/** Gold Corsair's Spikes (`reflecting`): a jagged saw-tooth outline around the boss box. */
const SPIKE_FLASH_COLOR = Skia.Color('rgba(255,214,102,0.9)');
const SPIKE_FLASH_STROKE = 3;
const SPIKE_POINTS = 14;
/**
 * Spikes' own wind-up telegraph (ruling R62, fix round 1): the same saw-tooth outline as `reflecting`
 * above, but flickering — visible on alternate `CORSAIR_FLICKER_BEAT_TICKS`-tick beats — for the 45
 * ticks between the `boss_windup` event and `boss_reflect` turning `reflecting` on for real.
 */
const CORSAIR_FLICKER_BEAT_TICKS = 3;
/** Unit-radius (1) saw-tooth points, built once — the geometry both spike blocks below share. */
const SAWTOOTH_UNIT_POINTS: readonly { x: number; y: number }[] = Array.from({ length: SPIKE_POINTS * 2 }, (_, i) => {
  const deg = (i * 180) / SPIKE_POINTS;
  const r = i % 2 === 0 ? 0.5 : 0.36;
  const rad = (deg * Math.PI) / 180;
  return { x: r * Math.cos(rad), y: r * Math.sin(rad) };
});
/**
 * Scratch path reused every frame for the saw-tooth outline (never reallocated — `rewind()` clears it
 * without releasing storage, the same discipline `SCRATCH_RECT` above already follows). Both spike
 * blocks rebuild it from `SAWTOOTH_UNIT_POINTS` in absolute screen coordinates via `drawSpikeFlash`
 * below, so `SPIKE_FLASH_STROKE` stays a constant dp width regardless of the boss's own box size,
 * instead of being stretched by a `canvas.scale` the way a unit path was stroked before this fix (the
 * rule `CRYSTAL_CRACK_LINES` above already follows for its own unit diamond's cracks).
 */
const SPIKE_FLASH_PATH = Skia.Path.Make();
/** Draws the saw-tooth outline centred at `(cx, cy)` with half-extents `(rx, ry)` (screen dp), shared
 * by `reflecting` and its ruling-R62 wind-up flicker so the fix lives in one place. */
function drawSpikeFlash(canvas: Canvas, paint: Paint, cx: number, cy: number, rx: number, ry: number) {
  'worklet';
  SPIKE_FLASH_PATH.rewind();
  for (let i = 0; i < SAWTOOTH_UNIT_POINTS.length; i++) {
    const p = SAWTOOTH_UNIT_POINTS[i]!;
    const x = cx + p.x * rx;
    const y = cy + p.y * ry;
    if (i === 0) SPIKE_FLASH_PATH.moveTo(x, y);
    else SPIKE_FLASH_PATH.lineTo(x, y);
  }
  SPIKE_FLASH_PATH.close();
  paint.setStyle(STROKE);
  paint.setStrokeWidth(SPIKE_FLASH_STROKE);
  paint.setColor(SPIKE_FLASH_COLOR);
  canvas.drawPath(SPIKE_FLASH_PATH, paint);
  paint.setStyle(FILL);
}
/** Storm Tyrant's discharge window (`discharged`): a golden crackle tint over the boss sprite. */
const DISCHARGE_FILTER = Skia.ColorFilter.MakeBlend(Skia.Color('#FFD24D'), BlendMode.Modulate);

/** Frost Castellan's cold snap (`frame.chill`): a pale blue tint drawn over Octopi's own silhouette. */
const CHILL_FILTER = Skia.ColorFilter.MakeBlend(Skia.Color('#AEE8FF'), BlendMode.SrcIn);

/** Bubbler's `bubble` shot (kind 14): a translucent circle with a highlight. */
const BUBBLE_COLOR = Skia.Color('#8FE3FF');
/** Bombardier's `charge` shot (kind 15): a steady orange glow plus a small core (no per-bullet age in the frame). */
const CHARGE_GLOW_COLOR = Skia.Color('#FF9142');
/** Verdant Templar's `firewall` shot (kind 16): a short vertical bar. */
const FIREWALL_BAR_COLOR = Skia.Color('rgba(143,255,194,0.85)');
const FIREWALL_BAR_W = 60;
const FIREWALL_BAR_H = 260;
/** Frost Castellan's crystal-burst `shard` (kind 17): a small pale diamond. */
const SHARD_COLOR = Skia.Color('#CFEFFF');
/** Gold Corsair's `axe` (kind 18): a spinning blade, rotated by `f.tick * 12` degrees. */
const AXE_COLOR = Skia.Color('#FFC24D');
const AXE_BLADE_UNIT = { x: -0.18, y: -0.55, width: 0.36, height: 1.1 };
/** Storm Tyrant's `bolt` (kind 19): a jagged forked line. */
const BOLT_COLOR = Skia.Color('#FF5C5C');
const BOLT_STROKE_W = 4;
/** Storm Tyrant's homing `orb` (kind 20): a pulsing sphere, radius driven by `f.tick`. */
const ORB_COLOR = Skia.Color('rgba(255,120,120,0.85)');
/** Abyssal Huntsman's `needle` (kind 21): a thin long line, leaning towards the field centre. */
const NEEDLE_COLOR = Skia.Color('#D9B3FF');
const NEEDLE_STROKE_W = 3;
const NEEDLE_LENGTH = 460;
const NEEDLE_LEAN_MAX = 18;

/** `firewallX` (`core/src/sim/boss.ts`) re-derived here: a worklet cannot call an imported, non-worklet core function, only its own local ones and plain constants. */
function firewallSlotX(slot: number): number {
  'worklet';
  return Math.floor((FIELD_W * (2 * slot + 1)) / (FIREWALL_SLOTS * 2));
}

/** A lane's left edge in world units (mirrors `laneOf`'s own `laneStart`, `core/src/sim/bosses/tyrant.ts`), re-derived for the same reason as `firewallSlotX`. */
function laneLeftX(lane: number): number {
  'worklet';
  return Math.floor((FIELD_W * lane) / LANE_COUNT);
}

/**
 * One-shot visuals (spec §8 / ruling R45), the `WaveBlast` pattern generalised to a capped list: each
 * entry is captured once, in `GameScreen.tsx`'s event loop, from the `GameEvent` that raised it (and,
 * for the handful with no position of their own, from `state` at that same instant — never read back
 * by this file, which only ever sees the entry's own `x`/`y`/`x2`). `drawFrame` draws every entry as a
 * function of `f.tick - entry.tick` and never mutates the list itself.
 */
export type EffectKind =
  | 'crab_shield_break' | 'bubble_pop' | 'charge_burst' | 'crab_rallied' | 'formation_rage'
  | 'crystal_shatter' | 'obstacle_destroyed' | 'boss_windup' | 'boss_reflect'
  | 'lane_strike' | 'boss_clone' | 'cold_snap';

export interface EffectEntry {
  kind: EffectKind;
  tick: number;
  x: number;
  y: number;
  /** `boss_clone` only: the ghost pair's right x (`x` holds the left); `boss_windup` only: the gap slot; `lane_strike` only: the lane index. Unused (0) by every other kind. */
  x2: number;
}

/** One shared value, capped at 32 entries (ruling R49) — never one shared value per effect. */
export interface Effects {
  entries: EffectEntry[];
}

/** How many rendered ticks an entry of each kind stays on screen before `drawFrame` drops it. */
const EFFECT_LIFETIME: Record<EffectKind, number> = {
  crab_shield_break: 20,
  bubble_pop: 15,
  charge_burst: 20,
  crab_rallied: 30,
  formation_rage: 40,
  crystal_shatter: CRYSTAL_SHATTER_WARN_TICKS,
  obstacle_destroyed: 25,
  boss_windup: FIREWALL_GAP_LIFETIME,
  boss_reflect: 20,
  lane_strike: LANE_STRIKE_LIFETIME,
  boss_clone: 90,
  cold_snap: 25,
};

/** The cap `GameScreen.tsx`'s own `pushEffect` enforces (ruling R49); exported so it is declared once. */
export const EFFECT_CAP = 32;

/**
 * Whether `entry` has outlived its own kind's lifetime as of `tick` (fix round: `pushEffect` uses
 * this to drop expired entries before it ever needs to evict by age, so a burst of one frequent kind
 * — the Templar's/Huntsman's own `boss_block`, which used to flood this same list — can no longer
 * push out an unrelated entry that is still within its own window). `EFFECT_LIFETIME` itself stays
 * module-private; this is the one door `GameScreen.tsx` needs into it.
 */
export function effectExpired(entry: EffectEntry, tick: number): boolean {
  return tick - entry.tick >= EFFECT_LIFETIME[entry.kind];
}

const IMPACT_BURST_COLOR = Skia.Color('#FFFFFF');
const RAGE_WAVE_COLOR = Skia.Color('rgba(255,51,51,0.35)');
const COLD_SNAP_COLOR = Skia.Color('rgba(174,232,255,0.7)');
/** `formation_rage`'s band, in dp (unscaled): its own height, and half that as the offset centring it on `waveY`. */
const RAGE_WAVE_BAND_H = 20;
const RAGE_WAVE_BAND_OFFSET = 10;
/** The small ring burst shared by most one-shot kinds below, in dp (unscaled): its stroke tapers from
 * this width to 0, and its radius grows from `BURST_RING_RADIUS0` by this much, both over the entry's lifetime. */
const BURST_RING_STROKE_W0 = 3;
const BURST_RING_RADIUS0 = 18;
const BURST_RING_RADIUS_GROWTH = 30;

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
  effects: Effects,
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

  // Shatter's own warning (ruling R61, fix round 1): the latest `crystal_shatter` entry's tick, if
  // any is still within its own 120-tick window — read once, applied to every crystal below.
  let shatterTick = -1;
  for (const entry of effects.entries) {
    if (entry.kind === 'crystal_shatter' && entry.tick > shatterTick) shatterTick = entry.tick;
  }
  const shatterAge = shatterTick >= 0 ? f.tick - shatterTick : -1;
  const shatterWarning = shatterAge >= 0 && shatterAge < CRYSTAL_SHATTER_WARN_TICKS;

  // Frost Castellan's crystals (`frame.obstacles`, spec §7/§8): a faceted diamond in a cold tint,
  // terrain drawn early so crabs, shots and the boss all render over it. Cracks scale with the
  // literal `12 - hp` (ruling R45), never a decoded core constant (see `CRYSTAL_FULL_HP`'s own doc).
  for (let i = 0; i < f.obstacles.length; i += OBSTACLE_STRIDE) {
    const ox = px(f.obstacles[i]!);
    const oy = py(f.obstacles[i + 1]!);
    const ow = f.obstacles[i + 2]! * k;
    const oh = f.obstacles[i + 3]! * k;
    const ohp = f.obstacles[i + 4]!;
    // f.obstacles[i + 5] is `kindIndex`; `OBSTACLE_INDEX` has only `crystal` (0) today.
    paint.setColor(CRYSTAL_COLOR);
    canvas.save();
    canvas.translate(ox, oy);
    canvas.scale(ow, oh);
    canvas.drawPath(CRYSTAL_UNIT_PATH, paint);
    canvas.restore();
    const crackCount = Math.min(CRYSTAL_CRACK_LINES.length, Math.max(0, Math.floor((CRYSTAL_FULL_HP - ohp) / 2)));
    if (crackCount > 0) {
      paint.setStyle(STROKE);
      paint.setStrokeWidth(CRACK_STROKE_W * k);
      paint.setColor(CRACK_COLOR);
      for (let c = 0; c < crackCount; c++) {
        const [x0, y0, x1, y1] = CRYSTAL_CRACK_LINES[c]!;
        canvas.drawLine(ox + x0 * ow, oy + y0 * oh, ox + x1 * ow, oy + y1 * oh, paint);
      }
      paint.setStyle(FILL);
    }
    if (shatterWarning) {
      // Every crystal on the field pulses, not only the ones standing when the warning fired — the
      // window is boss-wide (ruling R61), and a crystal raised mid-window shatters with the rest.
      const pulse = 0.5 + 0.5 * Math.sin((shatterAge * 2 * Math.PI) / CRYSTAL_SHATTER_PULSE_PERIOD);
      paint.setColor(CRYSTAL_WARN_COLOR);
      paint.setAlphaf(0.25 + 0.4 * pulse);
      canvas.save();
      canvas.translate(ox, oy);
      canvas.scale(ow, oh);
      canvas.drawPath(CRYSTAL_UNIT_PATH, paint);
      canvas.restore();
      paint.setAlphaf(1);
    }
  }

  // Heralds tracked for the aura's link line below (ruling R45: "a faint link line to the nearest
  // herald ... if cheap"): one bounded pre-pass over `f.crabs`, no allocation (`HERALD_SCRATCH_*`
  // are module-scope arrays reused every frame), so the main crab loop can find the nearest one by a
  // cheap linear scan instead of re-walking `f.crabs` itself.
  let heraldCount = 0;
  for (let i = 0; i < f.crabs.length && heraldCount < MAX_HERALDS_TRACKED; i += CRAB_STRIDE) {
    if (f.crabs[i + 3] === TYPE_INDEX.herald) {
      HERALD_SCRATCH_X[heraldCount] = f.crabs[i]!;
      HERALD_SCRATCH_Y[heraldCount] = f.crabs[i + 1]!;
      heraldCount += 1;
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
    const flags = f.crabs[i + 5]!;
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
    // Reefs 6-10 crab flags (spec §7, ruling R45): bit 0 the warden's shield, bit 1 the herald's
    // aura, bit 2 a patriarch's rally mark, bit 3 the formation's rage — every one of them cheap
    // (an int test and a shape or two), so every crab pays for the check even outside a veteran wave.
    if ((flags & 1) !== 0) {
      const r = sprite.w * 0.6;
      paint.setStyle(STROKE);
      paint.setStrokeWidth(WARDEN_SHIELD_STROKE_W);
      paint.setColor(WARDEN_SHIELD_COLOR);
      canvas.drawArc(scratch(cx - r, cy - r, r * 2, r * 2), -110, 220, false, paint);
      paint.setStyle(FILL);
    }
    if ((flags & 2) !== 0) {
      const ringR = sprite.w * 0.56 + 3 * Math.sin(f.tick / 6);
      paint.setStyle(STROKE);
      paint.setStrokeWidth(HERALD_RING_STROKE_W);
      paint.setColor(HERALD_RING_COLOR);
      canvas.drawCircle(cx, cy, ringR, paint);
      if (heraldCount > 0) {
        let nearest = -1;
        let nearestD = Infinity;
        for (let hIdx = 0; hIdx < heraldCount; hIdx++) {
          const dx = HERALD_SCRATCH_X[hIdx]! - f.crabs[i]!;
          const dy = HERALD_SCRATCH_Y[hIdx]! - f.crabs[i + 1]!;
          const d = dx * dx + dy * dy;
          if (d < nearestD) {
            nearestD = d;
            nearest = hIdx;
          }
        }
        if (nearest >= 0) {
          paint.setStrokeWidth(HERALD_LINK_STROKE_W);
          paint.setAlphaf(HERALD_LINK_ALPHA);
          canvas.drawLine(cx, cy, px(HERALD_SCRATCH_X[nearest]!), py(HERALD_SCRATCH_Y[nearest]!), paint);
          paint.setAlphaf(1);
        }
      }
      paint.setStyle(FILL);
    }
    if ((flags & 4) !== 0) {
      const rallyR = sprite.w * 0.5;
      paint.setStyle(STROKE);
      paint.setStrokeWidth(RALLY_MARK_STROKE_W);
      paint.setColor(RALLY_MARK_COLOR);
      canvas.drawCircle(cx, cy, rallyR, paint);
      paint.setStyle(FILL);
    }
    if ((flags & 8) !== 0) {
      const pulse = 0.5 + 0.5 * Math.sin(f.tick / 5);
      paint.setColor(CRAB_RAGE_TINT_COLOR);
      paint.setAlphaf(0.15 + 0.15 * pulse);
      canvas.drawCircle(cx, cy, sprite.w * 0.55, paint);
      paint.setAlphaf(1);
    }
  }
  if (iceFreeze) {
    paint.setColor(ICE_FOG_COLOR);
    canvas.drawRect(fieldRect, paint);
  }

  // Storm Tyrant's lanes (`frame.lanes`, spec §7/§8): a translucent warning band over each, pulsing
  // faster as `ticksLeft` falls.
  for (let i = 0; i < f.lanes.length; i += LANE_STRIDE) {
    const lane = f.lanes[i]!;
    const ticksLeft = f.lanes[i + 1]!;
    const laneX = px(laneLeftX(lane));
    const laneW = LANE_WIDTH * k;
    const pulse = 0.5 + 0.5 * Math.sin(f.tick * (0.15 + 3 / (ticksLeft + 4)));
    paint.setColor(LANE_WARNING_COLOR);
    paint.setAlphaf(0.1 + 0.2 * pulse);
    canvas.drawRect(scratch(laneX, fieldRect.y, laneW, fieldRect.height), paint);
    paint.setAlphaf(1);
  }

  // Abyssal Huntsman's sight line (`frame.aim`, spec §7/§8): a thin line from the near point past the
  // far one to the field edge, fading with ticksLeft. Ruling R65: a decoy's line draws identically to
  // the real one — the ghost boss's own 45% alpha (`draw.ts`'s boss block below) is the only tell, so
  // the player can't read the bluff for free off the line itself. `decoy` is still read out of the
  // frame (unused below) so the renderer could tell them apart again later without a frame change.
  if (f.aim.length > 0) {
    canvas.save();
    canvas.clipRect(fieldRect, ClipOp.Intersect, true);
    paint.setColor(AIM_LINE_COLOR);
    paint.setStrokeWidth(AIM_LINE_STROKE_W);
    for (let i = 0; i < f.aim.length; i += AIM_STRIDE) {
      const ax0 = px(f.aim[i]!);
      const ay0 = py(f.aim[i + 1]!);
      const ax1 = px(f.aim[i + 2]!);
      const ay1 = py(f.aim[i + 3]!);
      // f.aim[i + 4] is `decoy` — read for the frame's own shape, not used for alpha (ruling R65).
      const ticksLeft = f.aim[i + 5]!;
      const fade = Math.min(1, ticksLeft / AIM_FADE_TICKS);
      const farX = ax1 + (ax1 - ax0) * AIM_EXTEND;
      const farY = ay1 + (ay1 - ay0) * AIM_EXTEND;
      paint.setAlphaf(0.55 * fade);
      canvas.drawLine(ax0, ay0, farX, farY, paint);
    }
    paint.setAlphaf(1);
    canvas.restore();
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
      // The reefs 6-10 shot kinds (spec §5.1/§5.2, ruling R45): `Frame.enemyShots` carries only
      // x/y/kindIndex (no velocity or per-bullet age), so a look that would need either — the
      // bubbler's own drift, the charge's brightening over time — is kept to what the frame gives.
      case KIND_INDEX.bubble: {
        const br = BUBBLE_RADIUS * k;
        paint.setColor(BUBBLE_COLOR);
        paint.setAlphaf(0.35);
        canvas.drawCircle(x, y, br, paint);
        paint.setAlphaf(0.75);
        canvas.drawCircle(x - br * 0.3, y - br * 0.3, br * 0.22, paint);
        paint.setAlphaf(1);
        break;
      }
      case KIND_INDEX.charge: {
        const cr = CHARGE_RADIUS * k;
        paint.setColor(CHARGE_GLOW_COLOR);
        paint.setAlphaf(0.3);
        canvas.drawCircle(x, y, cr * 1.7, paint);
        paint.setAlphaf(1);
        canvas.drawCircle(x, y, cr * 0.5, paint);
        break;
      }
      case KIND_INDEX.firewall: {
        const fw = FIREWALL_BAR_W * k;
        const fh = FIREWALL_BAR_H * k;
        paint.setColor(FIREWALL_BAR_COLOR);
        canvas.drawRect(scratch(x - fw / 2, y - fh / 2, fw, fh), paint);
        break;
      }
      case KIND_INDEX.shard: {
        paint.setColor(SHARD_COLOR);
        canvas.save();
        canvas.translate(x, y);
        canvas.rotate(45, 0, 0);
        canvas.scale(baseR * 0.8, baseR * 0.8);
        canvas.drawRect(UNIT_SQUARE, paint);
        canvas.restore();
        break;
      }
      case KIND_INDEX.axe: {
        paint.setColor(AXE_COLOR);
        canvas.save();
        canvas.translate(x, y);
        canvas.rotate((f.tick * 12) % 360, 0, 0);
        canvas.scale(baseR * 1.3, baseR * 1.3);
        canvas.drawRect(AXE_BLADE_UNIT, paint);
        canvas.restore();
        break;
      }
      case KIND_INDEX.bolt: {
        paint.setColor(BOLT_COLOR);
        paint.setStrokeWidth(BOLT_STROKE_W);
        const s = baseR * 1.4;
        canvas.drawLine(x - s * 0.3, y - s, x + s * 0.1, y - s * 0.2, paint);
        canvas.drawLine(x + s * 0.1, y - s * 0.2, x - s * 0.15, y + s * 0.2, paint);
        canvas.drawLine(x - s * 0.15, y + s * 0.2, x + s * 0.3, y + s, paint);
        break;
      }
      case KIND_INDEX.orb: {
        const pulse = 0.5 + 0.5 * Math.sin(f.tick / 6);
        const orbR = baseR * (1 + 0.4 * pulse);
        paint.setColor(ORB_COLOR);
        paint.setAlphaf(0.45);
        canvas.drawCircle(x, y, orbR * 1.3, paint);
        paint.setAlphaf(1);
        canvas.drawCircle(x, y, orbR * 0.7, paint);
        break;
      }
      case KIND_INDEX.needle: {
        // No velocity in the frame: drawn vertical, leaning towards the field centre (ruling R45).
        const lean = ((FIELD_W / 2 - f.enemyShots[i]!) / (FIELD_W / 2)) * NEEDLE_LEAN_MAX;
        paint.setColor(NEEDLE_COLOR);
        paint.setStrokeWidth(NEEDLE_STROKE_W);
        canvas.save();
        canvas.translate(x, y);
        canvas.rotate(lean, 0, 0);
        canvas.drawLine(0, (-NEEDLE_LENGTH * k) / 2, 0, (NEEDLE_LENGTH * k) / 2, paint);
        canvas.restore();
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
      // Void/Huntsman decoy ghosts (`boss_clone`, ruling R47): the current boss frame at 45% alpha at
      // the last captured pair's x's, `boss.y`. Only the most recent pair draws — a fresh `boss_clone`
      // supersedes an older one even if it is still within its own 90-tick lifetime.
      let cloneEntry: EffectEntry | null = null;
      for (const entry of effects.entries) {
        if (entry.kind !== 'boss_clone') continue;
        if (cloneEntry === null || entry.tick > cloneEntry.tick) cloneEntry = entry;
      }
      if (cloneEntry !== null && f.tick - cloneEntry.tick < EFFECT_LIFETIME.boss_clone) {
        paint.setAlphaf(0.45);
        drawSpriteAt(canvas, paint, sprite, px(cloneEntry.x) - sprite.w / 2, by - sprite.h / 2);
        drawSpriteAt(canvas, paint, sprite, px(cloneEntry.x2) - sprite.w / 2, by - sprite.h / 2);
        paint.setAlphaf(1);
      }
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
      if (b.discharged === 1) {
        // Storm Tyrant's discharge window: a golden crackle tint pulsing over the sprite.
        paint.setColorFilter(DISCHARGE_FILTER);
        paint.setAlphaf(0.5 + 0.3 * Math.sin(f.tick / 4));
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
    if (b.shieldUp === 1) {
      // Verdant Templar's shell (`shieldUp`): a filled dome plus a rim, distinct from `shieldHp`'s
      // own full oval (Azure's water shield, the Huntsman's defence mirror).
      const dw = b.w * k * 1.15;
      const dh = b.h * k * 0.95;
      paint.setColor(BOSS_DOME_COLOR);
      canvas.drawArc(scratch(bx - dw / 2, by - dh / 2, dw, dh), 180, 180, true, paint);
      paint.setStyle(STROKE);
      paint.setStrokeWidth(BOSS_DOME_STROKE);
      canvas.drawArc(scratch(bx - dw / 2, by - dh / 2, dw, dh), 180, 180, false, paint);
      paint.setStyle(FILL);
    }
    if (b.reflecting === 1) {
      // Gold Corsair's Spikes: a jagged saw-tooth outline around the boss box, stroked in absolute dp
      // (`drawSpikeFlash`) rather than inside a `canvas.scale`, which would stretch the stroke width
      // by the boss's own box size.
      drawSpikeFlash(canvas, paint, bx, by, b.w * k * 1.05, b.h * k * 1.05);
    }
    if (b.kind === 8) {
      // Gold Corsair's Spikes telegraph (`boss_windup`, ruling R62, fix round 1): the same saw-tooth
      // as `reflecting` above, flickering for the 45 ticks before `boss_reflect` turns it on for
      // real. Only the most recent `boss_windup` entry matters, the same "latest wins" rule the
      // ghosts (`boss_clone`) already use above.
      let windupTick = -1;
      for (const entry of effects.entries) {
        if (entry.kind === 'boss_windup' && entry.tick > windupTick) windupTick = entry.tick;
      }
      const windupAge = windupTick >= 0 ? f.tick - windupTick : -1;
      if (windupAge >= 0 && windupAge < EFFECT_LIFETIME.boss_windup && Math.floor(windupAge / CORSAIR_FLICKER_BEAT_TICKS) % 2 === 0) {
        drawSpikeFlash(canvas, paint, bx, by, b.w * k * 1.05, b.h * k * 1.05);
      }
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

  // Frost Castellan's cold snap (`frame.chill`): a pale blue tint over Octopi's own silhouette.
  if (f.chill > 0) {
    paint.setColorFilter(CHILL_FILTER);
    paint.setAlphaf(0.4);
    drawSpriteAt(canvas, paint, octopiSprite, sx - octopiSprite.w / 2, sy - octopiSprite.h / 2);
    paint.setColorFilter(null);
    paint.setAlphaf(1);
  }

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

  // One-shot effects (spec §8, ruling R45): captured tick/position from `GameScreen.tsx`'s event
  // loop, drawn purely as a function of `f.tick - entry.tick`, dropped past their own lifetime.
  // `boss_clone`'s ghosts are drawn inline with the boss above (they need its current sprite/y).
  for (const entry of effects.entries) {
    // Drawn inline elsewhere, with data this loop doesn't have: `boss_clone`'s ghosts need the boss's
    // current sprite/y (in the boss block above); Gold Corsair's own `boss_windup` flicker (kind 8,
    // ruling R62) needs the boss's box too, so it is drawn there alongside `reflecting`, not here.
    // `crystal_shatter` (ruling R61) no longer draws a one-shot burst at all — it only ever drives the
    // continuous per-crystal warning tint above, computed once before the crystal loop.
    if (entry.kind === 'boss_clone' || entry.kind === 'crystal_shatter') continue;
    if (entry.kind === 'boss_windup' && f.boss?.kind === 8) continue;
    const age = f.tick - entry.tick;
    const lifetime = EFFECT_LIFETIME[entry.kind];
    if (age < 0 || age >= lifetime) continue;
    const progress = age / lifetime;
    if (entry.kind === 'formation_rage') {
      // A red wave crossing the field top to bottom — not tied to any one crab's position.
      const waveY = fieldRect.y + progress * fieldRect.height;
      paint.setColor(RAGE_WAVE_COLOR);
      paint.setAlphaf((1 - progress) * 0.8);
      canvas.drawRect(scratch(fieldRect.x, waveY - RAGE_WAVE_BAND_OFFSET, fieldRect.width, RAGE_WAVE_BAND_H), paint);
      paint.setAlphaf(1);
      continue;
    }
    if (entry.kind === 'boss_windup') {
      // Verdant Templar only — Gold Corsair's own `boss_windup` (kind 8) was already skipped above,
      // drawn instead in the boss block below. The firewall's own two-slot doorway, telegraphed for
      // the wind-up; `entry.x` holds the gap slot, not a position.
      const gapSlot = entry.x;
      const barW = Math.max(2, FIREWALL_GAP_BAR_W * k * 0.25);
      const leftX = px(firewallSlotX(gapSlot));
      const rightX = px(firewallSlotX(gapSlot + 1));
      paint.setColor(FIREWALL_GAP_COLOR);
      paint.setAlphaf(Math.max(0.15, (1 - progress) * (0.5 + 0.4 * Math.sin(age * 0.6))));
      canvas.drawRect(scratch(leftX - barW / 2, fieldRect.y, barW, fieldRect.height), paint);
      canvas.drawRect(scratch(rightX - barW / 2, fieldRect.y, barW, fieldRect.height), paint);
      paint.setAlphaf(1);
      continue;
    }
    if (entry.kind === 'lane_strike') {
      // `entry.x` holds the lane index (`GameScreen.tsx` diffs `state.lanes` to find it), not a position.
      const laneX = px(laneLeftX(entry.x));
      const laneW = LANE_WIDTH * k;
      paint.setColor(LANE_STRIKE_COLOR);
      paint.setAlphaf((1 - progress) * 0.85);
      canvas.drawRect(scratch(laneX, fieldRect.y, laneW, fieldRect.height), paint);
      paint.setAlphaf(1);
      continue;
    }
    // Every other kind: a small ring burst at its captured (x, y), colour by kind, expanding/fading.
    const ex = px(entry.x);
    const ey = py(entry.y);
    let color = IMPACT_BURST_COLOR;
    if (entry.kind === 'charge_burst') color = CHARGE_GLOW_COLOR;
    else if (entry.kind === 'obstacle_destroyed') color = CRYSTAL_COLOR;
    else if (entry.kind === 'bubble_pop') color = BUBBLE_COLOR;
    else if (entry.kind === 'crab_rallied') color = RALLY_MARK_COLOR;
    else if (entry.kind === 'crab_shield_break') color = WARDEN_SHIELD_COLOR;
    else if (entry.kind === 'cold_snap') color = COLD_SNAP_COLOR;
    paint.setStyle(STROKE);
    paint.setStrokeWidth(Math.max(1, BURST_RING_STROKE_W0 * (1 - progress)));
    paint.setColor(color);
    paint.setAlphaf(1 - progress);
    canvas.drawCircle(ex, ey, BURST_RING_RADIUS0 + progress * BURST_RING_RADIUS_GROWTH, paint);
    paint.setStyle(FILL);
    paint.setAlphaf(1);
  }

  // Void's temporal freeze: a violet tint over the whole field, on top of everything else.
  if (f.boss !== null && f.boss.freeze > 0) {
    paint.setColor(FREEZE_OVERLAY);
    canvas.drawRect(fieldRect, paint);
  }

  return recorder.finishRecordingAsPicture();
}
