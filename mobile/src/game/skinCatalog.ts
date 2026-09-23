import { BASE_OCTOPI_NAME, ITEM_NAMES, SKIN_ITEM_IDS } from '../loadout/items';
import { ITEM_TINT } from '../shop/tints';

/**
 * The skin-code space (design doc 2026-09-23 §1, §2): every value `activeSkin` can hold, 0..25.
 * `SKIN_CODES` is each code's identity (name, kind, catalogue item id, trophy level); `SKIN_LOOK`
 * (below) is how it looks. Both are indexed by code and are the single source either table draws
 * from — `game/skins.ts` reads them to decide what a run, Home's hero, the result screen and the
 * leaderboards draw for the equipped skin (Task 3 wires that read; today `skins.ts` still only
 * knows the four legacy tints).
 */

/** How a skin is had (design doc §1, §3). */
export type SkinKind = 'base' | 'tint' | 'shop' | 'trophy' | 'seeker';

/** The campaign level whose boss awards a reef-trophy pair (design doc §1, §3). */
export type TrophyLevel = 18 | 30 | 48 | 60;

export interface SkinCodeInfo {
  readonly code: number;
  readonly name: string;
  readonly kind: SkinKind;
  /** Catalogue item id for a bought skin (tint 1-4 -> items 3-6, shop 5-16 -> items 7-18); null for the base, the reef trophies and the Seeker skin — none of those are bought. */
  readonly itemId: number | null;
  /** Set only for a reef trophy (codes 17-24); null otherwise. */
  readonly trophyLevel: TrophyLevel | null;
}

/** A bought skin's name and item id come straight from the catalogue (`loadout/items.ts`), so the two tables can never disagree. */
function catalogueSkin(code: number, kind: 'tint' | 'shop'): SkinCodeInfo {
  const itemId = SKIN_ITEM_IDS[code] ?? null;
  const name = itemId === null ? `Skin ${code}` : (ITEM_NAMES[itemId] ?? `Item ${itemId}`);
  return { code, name, kind, itemId, trophyLevel: null };
}

function trophySkin(code: number, name: string, trophyLevel: TrophyLevel): SkinCodeInfo {
  return { code, name, kind: 'trophy', itemId: null, trophyLevel };
}

/** Every skin code, in order, 0..25 (design doc §1, §2): `activeSkin`'s whole value space. */
export const SKIN_CODES: readonly SkinCodeInfo[] = [
  { code: 0, name: BASE_OCTOPI_NAME, kind: 'base', itemId: null, trophyLevel: null },
  // 1-4: the legacy tints, catalogue items 3-6 (unchanged).
  catalogueSkin(1, 'tint'),
  catalogueSkin(2, 'tint'),
  catalogueSkin(3, 'tint'),
  catalogueSkin(4, 'tint'),
  // 5-16: the Shop's art skins, catalogue items 7-18, in the design doc's table order.
  catalogueSkin(5, 'shop'),
  catalogueSkin(6, 'shop'),
  catalogueSkin(7, 'shop'),
  catalogueSkin(8, 'shop'),
  catalogueSkin(9, 'shop'),
  catalogueSkin(10, 'shop'),
  catalogueSkin(11, 'shop'),
  catalogueSkin(12, 'shop'),
  catalogueSkin(13, 'shop'),
  catalogueSkin(14, 'shop'),
  catalogueSkin(15, 'shop'),
  catalogueSkin(16, 'shop'),
  // 17-24: the reef trophies, two per boss (design doc §1, §3).
  trophySkin(17, 'Azul', 18),
  trophySkin(18, 'Coraluna', 18),
  trophySkin(19, 'Noob', 30),
  trophySkin(20, 'Hex', 30),
  trophySkin(21, 'Kakashi', 48),
  trophySkin(22, 'Krang', 48),
  trophySkin(23, 'Shoupe', 60),
  trophySkin(24, 'Poseidon', 60),
  // 25: every wallet with a verified Seeker link.
  { code: 25, name: 'Seeker', kind: 'seeker', itemId: null, trophyLevel: null },
];

/** `SKIN_CODES[code]`'s `kind`, or null for a code outside 0..25. */
export function skinKind(code: number): SkinKind | null {
  return SKIN_CODES[code]?.kind ?? null;
}

/** `SKIN_CODES[code]`'s shown name, or null for a code outside 0..25. */
export function skinName(code: number): string | null {
  return SKIN_CODES[code]?.name ?? null;
}

/** `SKIN_CODES[code]`'s catalogue item id, or null for a code outside 0..25 or one with no item (base, trophies, Seeker). */
export function skinItemId(code: number): number | null {
  return SKIN_CODES[code]?.itemId ?? null;
}

/** The two trophy codes a boss awards, by the campaign level it sits on (design doc §1, §3). */
export const TROPHY_CODES_BY_LEVEL: Record<TrophyLevel, [number, number]> = {
  18: [17, 18],
  30: [19, 20],
  48: [21, 22],
  60: [23, 24],
};

/** The Seeker skin's code (design doc §1, §2): every wallet with a verified Seeker link. */
export const SEEKER_SKIN_CODE = 25;

/**
 * How a skin code looks (design doc §2, §5, §6): a legacy tint's colour (`shop/tints.ts`'s
 * `ITEM_TINT`, the same recolour the Shop and Profile use), or an art skin's own Front/Ooff pair —
 * static `require`s so Metro can find and bundle every one of the 21 pairs
 * (`mobile/assets/sprites/octopi/`, `tools/octopi-sprites.py`'s output). No entry for code 0: the
 * base Octopi keeps its own colours, drawn untinted (`skins.ts`'s existing null-tint path).
 */
export type SkinLook = { kind: 'tint'; tint: string } | { kind: 'art'; front: number; ooff: number };

export const SKIN_LOOK: Readonly<Record<number, SkinLook>> = {
  // 1-4: the legacy tints keep their `ITEM_TINT` colours (items 3-6).
  1: { kind: 'tint', tint: ITEM_TINT[3]! },
  2: { kind: 'tint', tint: ITEM_TINT[4]! },
  3: { kind: 'tint', tint: ITEM_TINT[5]! },
  4: { kind: 'tint', tint: ITEM_TINT[6]! },
  // 5-16: the Shop's art skins.
  5: { kind: 'art', front: require('../../assets/sprites/octopi/bear-front.png'), ooff: require('../../assets/sprites/octopi/bear-ooff.png') },
  6: { kind: 'art', front: require('../../assets/sprites/octopi/bunny-front.png'), ooff: require('../../assets/sprites/octopi/bunny-ooff.png') },
  7: { kind: 'art', front: require('../../assets/sprites/octopi/pengu-front.png'), ooff: require('../../assets/sprites/octopi/pengu-ooff.png') },
  8: { kind: 'art', front: require('../../assets/sprites/octopi/sponge-front.png'), ooff: require('../../assets/sprites/octopi/sponge-ooff.png') },
  9: { kind: 'art', front: require('../../assets/sprites/octopi/tiger-front.png'), ooff: require('../../assets/sprites/octopi/tiger-ooff.png') },
  10: { kind: 'art', front: require('../../assets/sprites/octopi/wizard-front.png'), ooff: require('../../assets/sprites/octopi/wizard-ooff.png') },
  11: { kind: 'art', front: require('../../assets/sprites/octopi/grim-front.png'), ooff: require('../../assets/sprites/octopi/grim-ooff.png') },
  12: { kind: 'art', front: require('../../assets/sprites/octopi/king-front.png'), ooff: require('../../assets/sprites/octopi/king-ooff.png') },
  13: { kind: 'art', front: require('../../assets/sprites/octopi/matrix-front.png'), ooff: require('../../assets/sprites/octopi/matrix-ooff.png') },
  14: { kind: 'art', front: require('../../assets/sprites/octopi/reaper-front.png'), ooff: require('../../assets/sprites/octopi/reaper-ooff.png') },
  15: { kind: 'art', front: require('../../assets/sprites/octopi/sharingan-front.png'), ooff: require('../../assets/sprites/octopi/sharingan-ooff.png') },
  16: { kind: 'art', front: require('../../assets/sprites/octopi/outlaw-front.png'), ooff: require('../../assets/sprites/octopi/outlaw-ooff.png') },
  // 17-24: the reef trophies.
  17: { kind: 'art', front: require('../../assets/sprites/octopi/azul-front.png'), ooff: require('../../assets/sprites/octopi/azul-ooff.png') },
  18: { kind: 'art', front: require('../../assets/sprites/octopi/coraluna-front.png'), ooff: require('../../assets/sprites/octopi/coraluna-ooff.png') },
  19: { kind: 'art', front: require('../../assets/sprites/octopi/noob-front.png'), ooff: require('../../assets/sprites/octopi/noob-ooff.png') },
  20: { kind: 'art', front: require('../../assets/sprites/octopi/hex-front.png'), ooff: require('../../assets/sprites/octopi/hex-ooff.png') },
  21: { kind: 'art', front: require('../../assets/sprites/octopi/kakashi-front.png'), ooff: require('../../assets/sprites/octopi/kakashi-ooff.png') },
  22: { kind: 'art', front: require('../../assets/sprites/octopi/krang-front.png'), ooff: require('../../assets/sprites/octopi/krang-ooff.png') },
  23: { kind: 'art', front: require('../../assets/sprites/octopi/shoupe-front.png'), ooff: require('../../assets/sprites/octopi/shoupe-ooff.png') },
  24: { kind: 'art', front: require('../../assets/sprites/octopi/poseidon-front.png'), ooff: require('../../assets/sprites/octopi/poseidon-ooff.png') },
  // 25: the Seeker skin.
  25: { kind: 'art', front: require('../../assets/sprites/octopi/seeker-front.png'), ooff: require('../../assets/sprites/octopi/seeker-ooff.png') },
};
