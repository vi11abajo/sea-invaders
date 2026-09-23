import { Skia, type SkColorFilter } from '@shopify/react-native-skia';
import type { OctopiVariant } from '@sea-invaders/core';
import { createContext, useContext } from 'react';
import { SKIN_NAMES, VARIANT_NAMES, type SkinIndex } from '../loadout/items';
import { tintMatrix } from '../shop/tints';
import { octopiLook, type Look } from './looks';

/**
 * Octopi's looks on screen (champions and skins design doc §2, §5): which look the player wears
 * (`useOctopiLook`, the one rule of `looks.ts`'s `octopiLook`) and the recolour a tint look is drawn
 * through (`tintFilter`). A drawn look needs no filter: its own pair is drawn as is.
 */

const TINT_FILTERS = new Map<string, SkColorFilter>();

/**
 * The Skia colour filter that recolours the base Octopi to `tint` (`tintMatrix`), built once per
 * colour and reused: the in-game poses and the UI snapshots are pre-tinted through it. Null for
 * Octopi's own colours.
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

/** "Lime" for skin 1, "Pengu" for skin 13; null for Octopi's own colours (0) and an unknown code. */
export function skinName(skin: SkinIndex): string | null {
  return skin === 0 ? null : (SKIN_NAMES[skin] ?? null);
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
 * The octopi variant the player has equipped (the loadout's `activeVariant`), which the app shell
 * provides; the base Octopi outside a provider. Home's hero shows it (in its own art unless a skin
 * is equipped); a run uses its own variant through `RunOctopiContext` instead.
 */
export const EquippedOctopiContext = createContext<OctopiVariant>('base');

/** The equipped octopi variant, for Octopi shown outside a run (Home's hero). */
export function useEquippedOctopi(): OctopiVariant {
  return useContext(EquippedOctopiContext);
}

/** "Poseidon" for the trident variant (the champion's shown name, design doc §1); null for the base Octopi. */
export function variantName(octopi: OctopiVariant): string | null {
  return octopi === 'base' ? null : VARIANT_NAMES[octopi];
}

/**
 * The octopi variant of the run on screen. `GameScreen` provides its run's (the base Octopi for daily
 * runs and practice), so the result pose it shows takes the run's look; outside a run it is the base.
 */
export const RunOctopiContext = createContext<OctopiVariant>('base');

/** The look this Octopi wears (`octopiLook`): the active skin over `octopi`, by default the run's variant. */
export function useOctopiLook(octopi?: OctopiVariant): Look {
  const skin = useActiveSkin();
  const fromRun = useContext(RunOctopiContext);
  return octopiLook(skin, octopi ?? fromRun);
}
