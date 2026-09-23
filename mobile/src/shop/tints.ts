import type { OctopiVariant } from '@sea-invaders/core';
import { SKIN_ITEM_IDS } from '../loadout/items';
import { COLORS } from '../ui/tokens';

/**
 * Colours for the catalogue items, keyed by catalogue item id so the Shop and the Profile read the
 * same table (champions and skins design doc §1, §2, §5). Only the legacy tints (items 3-6) are
 * ever a recolour: `tintMatrix` turns their entry into the Skia `ColorMatrix` that repaints the base
 * Octopi (`game/looks.ts`'s tint looks). Every other entry is a glow accent only — the Shop card's
 * and the Profile tile's `RadialGradient` behind the thumb (`OctopiThumb`) — because the champions
 * (items 0-2, 15-17) and the drawn skins (items 7-14) show their own Front/Ooff pairs, never
 * recoloured.
 */
export const ITEM_TINT: Readonly<Record<number, string>> = {
  // Champions Azul, Krang, Poseidon: the thumb colours of the Shop design (handoff 07), kept as the
  // Shop rows' glow now that each champion has its own drawn art (design doc §1).
  0: '#28E0B9', // Azul
  1: '#5497D5', // Krang
  2: '#9945FF', // Poseidon
  // The legacy tints, the only recolours (design doc §2, unchanged).
  3: '#CFF15E', // Lime
  4: '#CA9FF5', // Lilac
  5: '#F48252', // Ember
  6: '#5B3FA8', // Abyss
  // The sold drawn skins (design doc §2): the glow accent only — never a recolour. Each is the
  // dominant colour of the skin's own `-front.png` opaque pixels (outline black/white excluded),
  // measured from `mobile/assets/sprites/octopi/`.
  7: '#845642', // Bear — brown, 45% of opaque pixels
  8: '#97A7AF', // Bunny — grey, 29%
  9: '#F0CC55', // Sponge — yellow, 66%
  10: '#FD9217', // Tiger — orange, 11%
  11: '#001630', // Grim — navy, 28%
  12: '#225691', // King — blue, 29%
  13: '#0097AF', // Matrix — green-cyan, its brightest chromatic accent (the sprite is 73% near-black)
  14: '#2B3144', // Sharingan — navy, 13%
  // The sold champions (design doc §1): each sprite's dominant bright chromatic colour
  // (saturation ≥ 0.35, value ≥ 0.45), measured from its `-front.png`.
  15: '#B9BDD3', // Noob — an achromatic sprite: a pale slate chosen for the glow
  16: '#42DCF5', // Coraluna — cyan
  17: '#2250AF', // Shoupe — blue
};

/**
 * The glow accent of the looks no catalogue item carries (design doc §2): the boss awards 13-16,
 * measured like the champions above, and the Seeker look 17, which takes the SEEKER badge's own
 * colour. Keyed by skin code, not item id.
 */
export const ACCENT_BY_SKIN: Readonly<Record<number, string>> = {
  13: '#283690', // Pengu — blue-black
  14: '#831113', // Reaper — dark red
  15: '#F9C720', // Wizard — gold
  16: '#17B1DE', // Outlaw — cyan
  // The green end of the SEEKER badge's gradient (`ui/SeekerBadge.tsx`), the tokens' `success`:
  // the sprite itself is black and white.
  17: COLORS.success, // Seeker
};

/**
 * Each variant's accent (design doc §1, §5): the HUD badge's fill (`AZUL`) and the champion thumbs'
 * glow. Azul, Krang and Poseidon take their own art's dominant colour, not `ITEM_TINT[0..2]`: those
 * were picked for the recolour the champions no longer wear, while the badge sits over the drawn
 * champion in the run. The base Octopi has no badge; white is its neutral glow.
 */
export const ACCENT_BY_VARIANT: Readonly<Record<OctopiVariant, string>> = {
  base: '#FFFFFF',
  harpoon: '#199DDB', // Azul — blue
  anchor: '#F595A1', // Krang — pink
  trident: '#9A8658', // Poseidon — bronze
  noob: ITEM_TINT[15]!,
  coraluna: ITEM_TINT[16]!,
  shoupe: ITEM_TINT[17]!,
  hex: '#FCD904', // Hex — yellow
  kakashi: '#D1D3D8', // Kakashi — silver
};

/** The glow accent of skin `skin` (its item's `ITEM_TINT`, else `ACCENT_BY_SKIN`); null for Octopi's own colours (0) and an unknown code. */
export function accentOfSkin(skin: number): string | null {
  const itemId = SKIN_ITEM_IDS[skin];
  if (itemId !== null && itemId !== undefined) return ITEM_TINT[itemId] ?? null;
  return ACCENT_BY_SKIN[skin] ?? null;
}

/**
 * The accent of the look Octopi wears with `skin` over `octopi` — the same precedence as
 * `game/looks.ts`'s `octopiLook`: the skin wins, else the champion, else the base Octopi's white.
 */
export function accentOfLook(skin: number, octopi: OctopiVariant): string {
  return accentOfSkin(skin) ?? ACCENT_BY_VARIANT[octopi];
}

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
