import { Skia, type SkColorFilter } from '@shopify/react-native-skia';
import type { OctopiVariant } from '@sea-invaders/core';
import { createContext, useContext } from 'react';
import { ITEM_NAMES, SKIN_ITEM_IDS, itemOfOctopi, type SkinIndex } from '../loadout/items';
import { ITEM_TINT, tintMatrix } from '../shop/tints';

/**
 * Octopi's skins (design doc §1, §5): cosmetic recolours of the Octopi sprites through a Skia
 * `ColorMatrix`, never new art. Each skin's colour is read from the Shop's tint table
 * (`shop/tints.ts`, the single source of recolours) by the skin's catalogue item id, so the Shop
 * swatch, the Profile tile and the Octopi on Home, in a run and on the result screen all match.
 */

/** Each skin's colour by selector (0..4); null = Octopi's own colours. */
export const SKIN_TINTS: readonly (string | null)[] = SKIN_ITEM_IDS.map((id) => (id === null ? null : (ITEM_TINT[id] ?? null)));

/**
 * The colour Octopi is drawn in, null for its own colours: the one rule every Octopi on screen
 * follows (owner ruling 2026-09-14). The equipped skin wins, being the cosmetic choice; without one,
 * a campaign octopi shows in its Shop colour (`ITEM_TINT`, the tint of its Shop and Profile thumbs);
 * otherwise Octopi keeps its own colours. Daily runs and practice from Home play the base Octopi, so
 * they show the skin or Octopi's own colours.
 */
export function octopiTint(skin: SkinIndex, octopi: OctopiVariant): string | null {
  const skinTint = SKIN_TINTS[skin] ?? null;
  if (skinTint !== null) return skinTint;
  const itemId = itemOfOctopi(octopi);
  return itemId === null ? null : (ITEM_TINT[itemId] ?? null);
}

const TINT_FILTERS = new Map<string, SkColorFilter>();

/**
 * The Skia colour filter that recolours Octopi to `tint` (`tintMatrix`), built once per colour and
 * reused: the in-game poses and the UI snapshots are pre-tinted through it. Null for Octopi's own colours.
 */
export function tintFilter(tint: string | null): SkColorFilter | null {
  if (tint === null) return null;
  let filter = TINT_FILTERS.get(tint);
  if (filter === undefined) {
    filter = Skia.ColorFilter.MakeMatrix(tintMatrix(tint));
    TINT_FILTERS.set(tint, filter);
  }
  return filter;
}

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

/**
 * The octopi variant of the run on screen. `GameScreen` provides its run's (the base Octopi for daily
 * runs and practice), so the result pose it shows takes the run's look; outside a run it is the base.
 */
export const RunOctopiContext = createContext<OctopiVariant>('base');

/** The colour this Octopi is drawn in (`octopiTint`): the active skin, else `octopi` (by default the run's variant). */
export function useOctopiTint(octopi?: OctopiVariant): string | null {
  const skin = useActiveSkin();
  const fromRun = useContext(RunOctopiContext);
  return octopiTint(skin, octopi ?? fromRun);
}
