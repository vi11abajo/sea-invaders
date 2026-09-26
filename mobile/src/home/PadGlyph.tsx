import { Canvas, FillType, Path, Skia, type SkPath } from '@shopify/react-native-skia';
import { StyleSheet } from 'react-native';
import { COLORS, SIZE } from '../ui/tokens';

export type PadGlyphKind = 'triangle' | 'circle' | 'bars' | 'square';

/** Proportions of the round button (D) a game pad's face buttons use: a stroke of ~10 % of D,
 * outer corners rounded by about a third of the stroke, inner corners sharp. */
const D = SIZE.featureIcon;
const STROKE = 0.097 * D;
const CORNER = 0.35 * STROKE;
/** The canvas the glyph is drawn in; the triangle, the widest glyph, needs about 40 dp of it. */
const BOX = 46;
const C = BOX / 2;

/** An equilateral triangle, apex up, with its centroid at (C, cy). */
function triangle(cy: number, inradius: number) {
  const r = 2 * inradius;
  return [-90, 30, 150].map((deg) => {
    const a = (deg * Math.PI) / 180;
    return { x: C + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
}

function trianglePath(): SkPath {
  // The rounded apex sits CORNER lower than a sharp one would, so the sharp outline is that much taller.
  const inradius = (0.625 * D + CORNER) / 3;
  const cy = C + 0.005 * D;
  const [a, b, c] = triangle(cy, inradius);
  const p = Skia.Path.Make();
  p.moveTo((c!.x + a!.x) / 2, (c!.y + a!.y) / 2);
  p.arcToTangent(a!.x, a!.y, b!.x, b!.y, CORNER);
  p.arcToTangent(b!.x, b!.y, c!.x, c!.y, CORNER);
  p.arcToTangent(c!.x, c!.y, a!.x, a!.y, CORNER);
  p.close();
  p.addPoly(triangle(cy, inradius - STROKE), true);
  return p.setFillType(FillType.EvenOdd);
}

function circlePath(): SkPath {
  const r = 0.68 * D / 2;
  return Skia.Path.Make().addCircle(C, C, r).addCircle(C, C, r - STROKE).setFillType(FillType.EvenOdd);
}

function squarePath(): SkPath {
  const half = 0.583 * D / 2;
  return Skia.Path.Make()
    .addRRect(Skia.RRectXY(Skia.XYWHRect(C - half, C - half, 2 * half, 2 * half), CORNER, CORNER))
    .addRect(Skia.XYWHRect(C - half + STROKE, C - half + STROKE, 2 * (half - STROKE), 2 * (half - STROKE)))
    .setFillType(FillType.EvenOdd);
}

function barsPath(): SkPath {
  const half = 0.55 * D / 2;
  const p = Skia.Path.Make();
  for (const k of [-1, 0, 1]) {
    p.addRRect(Skia.RRectXY(Skia.XYWHRect(C - half, C + 2 * STROKE * k - STROKE / 2, 2 * half, STROKE), CORNER, CORNER));
  }
  return p;
}

const PATHS: Record<PadGlyphKind, SkPath> = {
  triangle: trianglePath(),
  circle: circlePath(),
  bars: barsPath(),
  square: squarePath(),
};

/** A game-pad style glyph for Home's round buttons: a hollow white outline, or three bars. */
export function PadGlyph({ kind }: { kind: PadGlyphKind }) {
  return (
    <Canvas style={styles.box}>
      <Path path={PATHS[kind]} color={COLORS.text} />
    </Canvas>
  );
}

const styles = StyleSheet.create({
  box: { width: BOX, height: BOX },
});
