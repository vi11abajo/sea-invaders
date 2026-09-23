import type { OctopiVariant } from '@sea-invaders/core';

/**
 * The catalogue's identity on the app side (design doc §1 and §3): item names and the loadout
 * selectors the backend stores. Prices and ownership always come from the chain through the backend.
 */

/** Item names by catalogue id; the same static table the backend serves with the Shop (`services/shop.js`). */
export const ITEM_NAMES: Readonly<Record<number, string>> = {
  0: 'Harpoon',
  1: 'Anchor',
  2: 'Trident',
  3: 'Lime',
  4: 'Lilac',
  5: 'Ember',
  6: 'Abyss',
  // Shop art skins (design doc §1, §4): items 7-18, Octopi drawn in the owner's own art rather than a tint.
  7: 'Bear',
  8: 'Bunny',
  9: 'Pengu',
  10: 'Sponge',
  11: 'Tiger',
  12: 'Wizard',
  13: 'Grim',
  14: 'King',
  15: 'Matrix',
  16: 'Reaper',
  17: 'Sharingan',
  18: 'Outlaw',
};

/** The name of the base octopi, which every player has without buying anything. */
export const BASE_OCTOPI_NAME = 'Octopi';

/**
 * `activeSkin`: the loadout selector the backend stores, the app equips and every ranked run
 * snapshots into `ranked_runs.skin` (design doc §2). 0 = Octopi's own colours, 1..4 = the legacy
 * tints, 5..16 = the Shop's art skins, 17..24 = the reef trophies, 25 = the Seeker skin. Bounded by
 * `SKIN_ITEM_IDS.length`; the full set's names, kinds and looks live in `game/skinCatalog.ts`.
 */
export type SkinIndex = number;
/** `activeVariant`: 0 = the base Octopi, 1..3 = Harpoon, Anchor, Trident. */
export type VariantIndex = 0 | 1 | 2 | 3;

/**
 * Catalogue item id of each skin selector (design doc §2): 1..4 = the legacy tints (items 3..6),
 * 5..16 = the Shop's art skins (items 7..18). Null for the base colours (0) and for the reef
 * trophies and the Seeker skin (17..25) — those are earned or linked, never bought, so they have no
 * catalogue item. Indexed by code, one entry per `SkinIndex` value (length 26).
 */
export const SKIN_ITEM_IDS: readonly (number | null)[] = [
  null, // 0: base Octopi
  3, 4, 5, 6, // 1-4: legacy tints
  7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, // 5-16: Shop art skins
  null, null, null, null, null, null, null, null, // 17-24: reef trophies
  null, // 25: Seeker skin
];
/** Catalogue item id of each variant selector (variant 1..3 = items 0..2); null for the base Octopi. */
export const VARIANT_ITEM_IDS: readonly [null, number, number, number] = [null, 0, 1, 2];
/** The core's `RunConfig.octopi` for each variant selector: what a campaign run plays with (design doc §4). */
export const VARIANT_OCTOPI: readonly [OctopiVariant, OctopiVariant, OctopiVariant, OctopiVariant] = ['base', 'harpoon', 'anchor', 'trident'];

export function isSkinIndex(value: unknown): value is SkinIndex {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < SKIN_ITEM_IDS.length;
}

export function isVariantIndex(value: unknown): value is VariantIndex {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < VARIANT_ITEM_IDS.length;
}

/** The skin selector that equips catalogue item `itemId` (items 3-18), or null when the item is not a skin. */
export function skinOfItem(itemId: number): SkinIndex | null {
  const index = SKIN_ITEM_IDS.indexOf(itemId);
  return index > 0 && isSkinIndex(index) ? index : null;
}

/** The catalogue item id of the core's variant `octopi`; null for the base Octopi. */
export function itemOfOctopi(octopi: OctopiVariant): number | null {
  const index = VARIANT_OCTOPI.indexOf(octopi);
  return isVariantIndex(index) ? VARIANT_ITEM_IDS[index] : null;
}

/** The variant selector that equips catalogue item `itemId`, or null when the item is not a variant. */
export function variantOfItem(itemId: number): VariantIndex | null {
  const index = VARIANT_ITEM_IDS.indexOf(itemId);
  return index > 0 && isVariantIndex(index) ? index : null;
}
