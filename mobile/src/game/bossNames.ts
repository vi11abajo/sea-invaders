import { REEFS } from '@sea-invaders/core';

/** Boss display names (1..10): spec §4.2 (kinds 1-5) and the reefs 6-10 design §5 (kinds 6-10, task
 * 13). Shared by the in-run HUD and the campaign screens so the list is declared exactly once. */
export const BOSS_NAMES = [
  'Emerald Warlord', 'Azure Leviathan', 'Solar Kraken', 'Crimson Behemoth', 'Void Sovereign',
  'Verdant Templar', 'Frost Castellan', 'Gold Corsair', 'Storm Tyrant', 'Abyssal Huntsman',
] as const;

if (BOSS_NAMES.length !== REEFS) {
  throw new Error(`BOSS_NAMES must have ${REEFS} entries, has ${BOSS_NAMES.length}`);
}
