import { REEFS } from '@sea-invaders/core';

/** Boss display names (1..10), shared by the in-run HUD and the campaign screens so the list is declared exactly once. */
export const BOSS_NAMES = [
  'Emerald Warlord', 'Azure Leviathan', 'Solar Kraken', 'Crimson Behemoth', 'Void Sovereign',
  'Verdant Templar', 'Frost Castellan', 'Gold Corsair', 'Storm Tyrant', 'Abyssal Huntsman',
] as const;

if (BOSS_NAMES.length !== REEFS) {
  throw new Error(`BOSS_NAMES must have ${REEFS} entries, has ${BOSS_NAMES.length}`);
}
