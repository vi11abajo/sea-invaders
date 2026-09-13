import { Skia, type SkColorFilter } from '@shopify/react-native-skia';
import { createContext, useContext } from 'react';
import { ITEM_NAMES, SKIN_ITEM_IDS, type SkinIndex } from '../loadout/items';
import { ITEM_TINT, tintMatrix } from '../shop/tints';

/**
 * Octopi's skins (design doc §1, §5): cosmetic recolours of the Octopi sprites through a Skia
 * `ColorMatrix`, never new art. Each skin's colour is read from the Shop's tint table
 * (`shop/tints.ts`, the single source of recolours) by the skin's catalogue item id, so the Shop
 * swatch, the Profile tile and the Octopi on Home, in a run and on the result screen all match.
 */

/** Each skin's colour by selector (0..4); null = Octopi's own colours. */
export const SKIN_TINTS: readonly (string | null)[] = SKIN_ITEM_IDS.map((id) => (id === null ? null : (ITEM_TINT[id] ?? null)));

/** Each skin's 4x5 colour matrix (`tintMatrix`) by selector; null for the base colours. */
export const SKIN_MATRICES: readonly (number[] | null)[] = SKIN_TINTS.map((hex) => (hex === null ? null : tintMatrix(hex)));

/** The same matrices as Skia colour filters, built once at load: the in-game sprites are pre-tinted through them. */
export const SKIN_FILTERS: readonly (SkColorFilter | null)[] = SKIN_MATRICES.map((m) => (m === null ? null : Skia.ColorFilter.MakeMatrix(m)));

/** "Lime" for skin 1; null for the base colours. */
export function skinName(skin: SkinIndex): string | null {
  const id = SKIN_ITEM_IDS[skin];
  return id === null ? null : (ITEM_NAMES[id] ?? null);
}

/**
 * The player's active skin. The app shell provides it from the loadout (`useLoadout`); outside a
 * provider (the design gallery) it is the base colours.
 */
export const SkinContext = createContext<SkinIndex>(0);

/** The active skin selector, for every place that draws Octopi. */
export function useActiveSkin(): SkinIndex {
  return useContext(SkinContext);
}
