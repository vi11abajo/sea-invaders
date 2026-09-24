import { ABILITY_NAMES, type OctopiVariant } from '@sea-invaders/core';

/** A champion's ability as the app shows it: the core's label and one short line of app copy. */
export interface Ability {
  /** The ability's name (core `ABILITY_NAMES`); null for the base Octopi, which has none. */
  readonly label: string | null;
  /** What it does, in a few words: the Level start tile's line and the Shop and Profile rows' perk. */
  readonly short: string;
}

/**
 * Every variant's ability. A champion keeps its ability under
 * any skin, so this is read by variant, never by look.
 */
export const ABILITY: Readonly<Record<OctopiVariant, Ability>> = {
  base: { label: ABILITY_NAMES.base, short: 'balanced' },
  harpoon: { label: ABILITY_NAMES.harpoon, short: 'Fire rate +33 %' },
  anchor: { label: ABILITY_NAMES.anchor, short: '+1 life' },
  trident: { label: ABILITY_NAMES.trident, short: 'Piercing shots' },
  noob: { label: ABILITY_NAMES.noob, short: '3 s of grace after a hit' },
  coraluna: { label: ABILITY_NAMES.coraluna, short: 'Every 30 kills sweep the bottom row' },
  shoupe: { label: ABILITY_NAMES.shoupe, short: 'Fires faster the fewer lives are left' },
  hex: { label: ABILITY_NAMES.hex, short: 'Enemy shots 30 % slower' },
  kakashi: { label: ABILITY_NAMES.kakashi, short: 'Boosts last a third longer' },
};
