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
};

/** The name of the base octopi, which every player has without buying anything. */
export const BASE_OCTOPI_NAME = 'Octopi';

/** `activeSkin`: 0 = Octopi's own colours, 1..4 = Lime, Lilac, Ember, Abyss. */
export type SkinIndex = 0 | 1 | 2 | 3 | 4;
/** `activeVariant`: 0 = the base Octopi, 1..3 = Harpoon, Anchor, Trident. */
export type VariantIndex = 0 | 1 | 2 | 3;

/** Catalogue item id of each skin selector (skin 1..4 = items 3..6); null for the base colours. */
export const SKIN_ITEM_IDS: readonly [null, number, number, number, number] = [null, 3, 4, 5, 6];
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

/** The skin selector that equips catalogue item `itemId`, or null when the item is not a skin. */
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
