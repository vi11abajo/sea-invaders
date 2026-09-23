import { LEVELS_PER_REEF, VARIANT_INDEX, awardLevelOf, type Award, type OctopiVariant } from '@sea-invaders/core';
import { BOSS_NAMES } from '../game/bossNames';
import { SEEKER_SKIN_CODE, SKIN_ITEM_IDS, VARIANT_ITEM_IDS, VARIANT_OCTOPI, type SkinIndex, type VariantIndex } from './items';

/** A set of loadout selectors: champion variant indexes and skin codes, ascending. */
export interface Selectors {
  readonly variants: readonly VariantIndex[];
  readonly skins: readonly SkinIndex[];
}

/** No selectors at all: nothing earned. */
export const NO_SELECTORS: Selectors = { variants: [], skins: [] };

/** What a campaign progress has earned, in the core's own shape (`earnedAwards`). */
export interface EarnedAwards {
  readonly variants: readonly OctopiVariant[];
  readonly skins: readonly number[];
}

/**
 * Every selector this player may equip right now (champions and skins design doc §3): 0 always; a
 * sold one when the wallet owns its item; an award when the campaign has earned it (awards are
 * derived, never stored); the Seeker look with a verified Seeker link. The same three rules the
 * backend applies to `PUT /api/profile/loadout`, so a tile the app offers is one the backend takes.
 * An award only counts for a selector no shop item sells, so an earned code can never stand in for
 * an item the wallet does not own.
 */
export function allowedSelectors(owned: readonly number[], earned: EarnedAwards, seekerLinked: boolean): Selectors {
  const earnedVariants = new Set(earned.variants.map((v) => VARIANT_INDEX[v]));
  const earnedSkins = new Set(earned.skins);
  const variants: VariantIndex[] = [];
  VARIANT_ITEM_IDS.forEach((itemId, v) => {
    if (v === 0 || (itemId !== null ? owned.includes(itemId) : earnedVariants.has(v))) variants.push(v);
  });
  const skins: SkinIndex[] = [];
  SKIN_ITEM_IDS.forEach((itemId, code) => {
    if (code === 0) skins.push(code);
    else if (itemId !== null) {
      if (owned.includes(itemId)) skins.push(code);
    } else if (code === SEEKER_SKIN_CODE ? seekerLinked : earnedSkins.has(code)) skins.push(code);
  });
  return { variants, skins };
}

/**
 * `local` (derived from this phone's campaign progress) widened by what the backend derived from the
 * wallet's stored progress (`LoadoutInfo.earned`, selector values). Signed in, the backend is the
 * one that validates a choice, so a look it already counts as earned stays on while this phone's
 * copy of the campaign has not caught up yet (a fresh install before the first sync).
 */
export function withServedAwards(local: EarnedAwards, served: Selectors): EarnedAwards {
  if (served.variants.length === 0 && served.skins.length === 0) return local;
  const variants = new Set(local.variants);
  for (const v of served.variants) {
    const octopi = VARIANT_OCTOPI[v];
    if (octopi !== undefined) variants.add(octopi);
  }
  return { variants: [...variants], skins: [...new Set([...local.skins, ...served.skins])] };
}

/** `activeVariant` when this player may wear it, else the base Octopi: what is really on (a demo campaign reset un-earns). */
export function wornVariant(allowed: Selectors, activeVariant: VariantIndex): VariantIndex {
  return allowed.variants.includes(activeVariant) ? activeVariant : 0;
}

/** `activeSkin` when this player may wear it, else Octopi's own colours. */
export function wornSkin(allowed: Selectors, activeSkin: SkinIndex): SkinIndex {
  return allowed.skins.includes(activeSkin) ? activeSkin : 0;
}

/**
 * The boss whose defeat earns `award` (design doc §2/§3): boss N guards the last level of reef N,
 * so the award level's reef names it. Null when no level awards it (a sold or free selector).
 */
export function awardBoss(award: Award): string | null {
  const level = awardLevelOf(award);
  if (level === null) return null;
  return BOSS_NAMES[Math.ceil(level / LEVELS_PER_REEF) - 1] ?? null;
}

/** The boss whose defeat earns champion `v`; null for a sold champion and the base Octopi. */
export function variantBoss(v: VariantIndex): string | null {
  const octopi = VARIANT_OCTOPI[v];
  return octopi === undefined ? null : awardBoss({ kind: 'variant', variant: octopi });
}

/** The boss whose defeat earns look `code`; null for a sold look, the Seeker look and code 0. */
export function skinBoss(code: SkinIndex): string | null {
  return awardBoss({ kind: 'skin', skin: code });
}

/**
 * Where a locked champion is had (design doc §5): "In the Shop" for a sold one, "Beat <boss>" for
 * an award; null for the base Octopi, which is never locked.
 */
export function variantHint(v: VariantIndex): string | null {
  if (VARIANT_ITEM_IDS[v] != null) return 'In the Shop';
  const boss = variantBoss(v);
  return boss === null ? null : `Beat ${boss}`;
}

/** Where a locked look is had (design doc §5): "In the Shop", "Beat <boss>" or "Verify Seeker"; null for code 0. */
export function skinHint(code: SkinIndex): string | null {
  if (SKIN_ITEM_IDS[code] != null) return 'In the Shop';
  if (code === SEEKER_SKIN_CODE) return 'Verify Seeker';
  const boss = skinBoss(code);
  return boss === null ? null : `Beat ${boss}`;
}

/**
 * The look/ability rule, said where champions and skins are chosen (owner, 2026-09-23; design doc
 * §5): under the Champions section of the Shop and the Champions group of the Profile.
 */
export const WEAR_RULE = "A skin changes only the look. A champion's ability works under any skin.";
