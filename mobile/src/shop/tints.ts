/**
 * Recolours of Octopi for the catalogue items (design doc §1). Until the owner draws their own
 * sprites, every skin and every campaign octopi is the Octopi sprite drawn through a Skia
 * `ColorMatrix` built from its colour here. Keyed by catalogue item id, so the Shop, the Profile
 * inventory and the in-game skins all read the same table.
 */
export const ITEM_TINT: Readonly<Record<number, string>> = {
  // Campaign octopi: the thumb colours of the Shop design (handoff 07).
  0: '#28E0B9', // Harpoon
  1: '#5497D5', // Anchor
  2: '#9945FF', // Trident
  // Skins: the recolours of design doc §1.
  3: '#CFF15E', // Lime
  4: '#CA9FF5', // Lilac
  5: '#F48252', // Ember
  6: '#5B3FA8', // Abyss
};

/**
 * Relative luminance (Rec. 709 weights on the sRGB values) of `octopiFront.png`'s dominant body
 * colour `#1C6DC6` — measured from the asset, 48 % of its opaque pixels. `tintMatrix` scales it to
 * exactly the target colour.
 */
const OCTOPI_BODY_LUMA = 0.385;
const LUMA = [0.2126, 0.7152, 0.0722] as const;

/** `#RRGGBB` as [r, g, b] in 0..1. */
function channels(hex: string): [number, number, number] {
  const v = Number.parseInt(hex.slice(1, 7), 16);
  return [((v >> 16) & 0xff) / 255, ((v >> 8) & 0xff) / 255, (v & 0xff) / 255];
}

/**
 * A 4x5 colour matrix that recolours Octopi to `hex`: each pixel's luminance, scaled so the body
 * colour lands exactly on `hex`. Outlines stay black, shadows and highlights keep their depth as
 * darker and lighter shades of the new colour; alpha is untouched.
 */
export function tintMatrix(hex: string): number[] {
  const [r, g, b] = channels(hex).map((c) => c / OCTOPI_BODY_LUMA);
  return [
    LUMA[0] * r, LUMA[1] * r, LUMA[2] * r, 0, 0,
    LUMA[0] * g, LUMA[1] * g, LUMA[2] * g, 0, 0,
    LUMA[0] * b, LUMA[1] * b, LUMA[2] * b, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

/** `hex` with `alpha` (0..1) as a CSS `rgba()` string. */
export function tintWithAlpha(hex: string, alpha: number): string {
  const [r, g, b] = channels(hex).map((c) => Math.round(c * 255));
  return `rgba(${r},${g},${b},${alpha})`;
}
