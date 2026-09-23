import { SKIN_COUNT, VARIANT_BY_INDEX, VARIANT_INDEX, VARIANT_ITEM_IDS, VARIANT_NAMES, type OctopiVariant } from '@sea-invaders/core';

/**
 * The catalogue's identity on the app side: a thin re-export of the core's `catalogue.ts`, where
 * the names, the selector ↔ item tables and the awards are written once for the backend and the app
 * alike (champions and skins design doc §3). Prices and ownership always come from the chain
 * through the backend (§4), never from here.
 */
export {
  ABILITY_NAMES, ITEM_NAMES, SEEKER_SKIN_CODE, SKIN_COUNT, SKIN_ITEM_IDS, SKIN_NAMES, VARIANT_ITEM_IDS, VARIANT_NAMES,
  skinOfItem, variantOfItem,
} from '@sea-invaders/core';

/**
 * `activeSkin`: the loadout selector the backend stores, the app equips and every ranked run
 * snapshots into `ranked_runs.skin` (design doc §2/§3). 0 = Octopi's own colours, 1..4 = the legacy
 * tints, 5..12 = the sold looks, 13..16 = the boss awards, 17 = the Seeker look; `SKIN_COUNT` codes
 * in all. How each one looks is `game/looks.ts`'s `SKIN_LOOK`.
 */
export type SkinIndex = number;
/**
 * `activeVariant`: the core's `VARIANT_INDEX` (design doc §3) — 0 the base Octopi, 1..3 Azul,
 * Krang, Poseidon, 4..6 Noob, Coraluna, Shoupe, 7..8 Hex, Kakashi.
 */
export type VariantIndex = number;

/** The name of the base Octopi, which every player has without buying anything. */
export const BASE_OCTOPI_NAME = VARIANT_NAMES.base;

/** The core's `RunConfig.octopi` for each variant selector: what a campaign run plays with (design doc §3). */
export const VARIANT_OCTOPI: readonly OctopiVariant[] = VARIANT_BY_INDEX;

export function isSkinIndex(value: unknown): value is SkinIndex {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < SKIN_COUNT;
}

export function isVariantIndex(value: unknown): value is VariantIndex {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < VARIANT_ITEM_IDS.length;
}

/** The catalogue item id of the core's variant `octopi`; null for the base Octopi and the awarded champions (Hex, Kakashi). */
export function itemOfOctopi(octopi: OctopiVariant): number | null {
  return VARIANT_ITEM_IDS[VARIANT_INDEX[octopi]] ?? null;
}
