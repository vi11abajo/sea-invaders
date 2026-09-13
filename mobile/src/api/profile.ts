import { apiFetch } from './client';

/** The wallet's inventory and equipped selection (design doc §3, `GET/PUT /api/profile/loadout`). */
export interface LoadoutInfo {
  /** Catalogue item ids the wallet owns, read from the chain. */
  owned: number[];
  /** 0 = Octopi's own colours; 1..4 = the skins Lime, Lilac, Ember, Abyss (item ids 3..6). */
  activeSkin: number;
  /** 0 = the base Octopi; 1..3 = Harpoon, Anchor, Trident (item ids 0..2). */
  activeVariant: number;
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
 * Equips an owned skin and/or variant (0, the base, is always allowed) and answers with the whole
 * loadout. Rejects with `ApiError` 400 for a selector out of range, 409 `not_owned` for an item the
 * wallet does not own.
 */
export function putLoadout(change: LoadoutChange): Promise<LoadoutInfo> {
  return apiFetch<LoadoutInfo>('/api/profile/loadout', { method: 'PUT', auth: true, body: change });
}
