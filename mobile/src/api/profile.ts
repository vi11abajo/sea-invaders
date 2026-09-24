import { apiFetch } from './client';

/** The wallet's inventory and equipped selection (`GET/PUT /api/profile/loadout`). */
export interface LoadoutInfo {
  /** Catalogue item ids the wallet owns, read from the chain. */
  owned: number[];
  /** The skin code: 0 = Octopi's own colours, 1..17 as `SKIN_NAMES`; 0 when the stored one is no longer allowed. */
  activeSkin: number;
  /** The `VARIANT_INDEX`: 0 = the base Octopi, 1..8 the champions; 0 when the stored one is no longer allowed. */
  activeVariant: number;
  /**
   * What the wallet's campaign progress has earned: variant indexes (7 Hex,
   * 8 Kakashi) and skin codes (13..16). Missing from an older API's answer.
   */
  earned?: { variants: number[]; skins: number[] };
  /** True when the wallet has a verified Seeker link, so it may wear the Seeker skin (17). Missing from an older API's answer. */
  seekerSkin?: boolean;
}

/** A loadout update: either selector alone, or both. */
export interface LoadoutChange {
  activeSkin?: number;
  activeVariant?: number;
}

/** The caller's owned items and equipped skin and variant. */
export function getLoadout(): Promise<LoadoutInfo> {
  return apiFetch<LoadoutInfo>('/api/profile/loadout', { auth: true });
}

/**
 * Equips a skin and/or variant the wallet owns, has earned or is linked for (0, the base, is always
 * allowed) and answers with the whole loadout. Rejects with `ApiError` 400 for a selector out of
 * range, 409 `not_owned` for one the wallet may not wear.
 */
export function putLoadout(change: LoadoutChange): Promise<LoadoutInfo> {
  return apiFetch<LoadoutInfo>('/api/profile/loadout', { method: 'PUT', auth: true, body: change });
}
