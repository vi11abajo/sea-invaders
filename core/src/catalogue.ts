import { extendProgress, type CampaignProgress } from './campaign/progress';
import { VARIANT_INDEX, type OctopiVariant } from './types';

/**
 * The champions and skins catalogue: the names, the selector ↔
 * shop-item tables and the campaign awards, written once here and imported by both the backend and
 * the app. Pure data and pure functions — nothing here reaches into the simulation, and no price
 * lives here (prices are on chain only).
 */

/** The shown name of each variant: the base Octopi, then each champion as drawn. */
export const VARIANT_NAMES: Readonly<Record<OctopiVariant, string>> = Object.freeze({
  base: 'Octopi', harpoon: 'Azul', anchor: 'Krang', trident: 'Poseidon',
  noob: 'Noob', coraluna: 'Coraluna', shoupe: 'Shoupe', hex: 'Hex', kakashi: 'Kakashi',
});

/** The label of each champion's ability; the base Octopi has none. */
export const ABILITY_NAMES: Readonly<Record<OctopiVariant, string | null>> = Object.freeze({
  base: null, harpoon: 'Harpoon', anchor: 'Anchor', trident: 'Trident',
  noob: 'Thick skin', coraluna: 'Surge', shoupe: 'Last stand', hex: 'Hex', kakashi: 'Copy',
});

/**
 * The shown name of each skin, indexed by its code: 0 the Octopi's own colours, 1..4 the
 * legacy tints, 5..12 the sold looks, 13..16 the boss awards, 17 the Seeker owners' look.
 */
export const SKIN_NAMES: readonly string[] = Object.freeze([
  'Octopi', 'Lime', 'Lilac', 'Ember', 'Abyss',
  'Bear', 'Bunny', 'Sponge', 'Tiger', 'Grim', 'King', 'Matrix', 'Sharingan',
  'Pengu', 'Reaper', 'Wizard', 'Outlaw',
  'Seeker',
]);

/** How many skin codes exist (0..`SKIN_COUNT - 1`). */
export const SKIN_COUNT = 18;

/** The skin code every wallet with a verified Seeker link may wear. */
export const SEEKER_SKIN_CODE = 17;

/**
 * The shop item behind each variant, indexed by `VARIANT_INDEX`: harpoon/anchor/trident
 * are items 0..2, noob/coraluna/shoupe items 15..17; base is free and hex/kakashi are awarded, so
 * those three have none.
 */
export const VARIANT_ITEM_IDS: readonly (number | null)[] = Object.freeze([null, 0, 1, 2, 15, 16, 17, null, null]);

/**
 * The shop item behind each skin, indexed by skin code: the tints 1..4 are items 3..6 and
 * the sold looks 5..12 items 7..14; code 0 is free, 13..16 are awarded and 17 is the Seeker look,
 * so those have none.
 */
export const SKIN_ITEM_IDS: readonly (number | null)[] = Object.freeze([
  null, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, null, null, null, null, null,
]);

/**
 * Each variant in `VARIANT_INDEX` order. A private copy of `replay`'s `VARIANT_BY_INDEX` on purpose:
 * `replay` imports the simulation (`game`, `step`, `levels`), and this module reaches no further than
 * `types` and `campaign/progress`. The `ITEM_NAMES` test pins the order this gives.
 */
const VARIANTS_IN_ORDER: readonly OctopiVariant[] = (Object.keys(VARIANT_INDEX) as OctopiVariant[])
  .sort((a, b) => VARIANT_INDEX[a] - VARIANT_INDEX[b]);

/** The name of every catalogue item, derived from the two item tables and the two name lists above. */
export const ITEM_NAMES: Readonly<Record<number, string>> = Object.freeze(buildItemNames());

function buildItemNames(): Record<number, string> {
  const names: Record<number, string> = {};
  VARIANT_ITEM_IDS.forEach((id, index) => {
    if (id !== null) names[id] = VARIANT_NAMES[VARIANTS_IN_ORDER[index]!];
  });
  SKIN_ITEM_IDS.forEach((id, code) => {
    if (id !== null) names[id] = SKIN_NAMES[code]!;
  });
  return names;
}

/**
 * Whether `itemId` can name a catalogue item at all. The plain-JS backend can pass anything, and a
 * `null` would otherwise find the leading `null` of the item tables above and read as base / no skin.
 */
function isItemId(itemId: unknown): itemId is number {
  return Number.isInteger(itemId) && (itemId as number) >= 0;
}

/** The `VARIANT_INDEX` value `itemId` sells, or null when it is not a champion item (or not an item id). */
export function variantOfItem(itemId: number): number | null {
  if (!isItemId(itemId)) return null;
  const index = VARIANT_ITEM_IDS.indexOf(itemId);
  return index < 0 ? null : index;
}

/** The skin code `itemId` sells, or null when it is not a skin item (or not an item id). */
export function skinOfItem(itemId: number): number | null {
  if (!isItemId(itemId)) return null;
  const code = SKIN_ITEM_IDS.indexOf(itemId);
  return code < 0 ? null : code;
}

/** What clearing an award level earns: a champion or a look. */
export type Award = { kind: 'variant'; variant: OctopiVariant } | { kind: 'skin'; skin: number };

/**
 * The campaign awards by level id: a look for each of bosses 2, 4, 6 and 8 (levels 12,
 * 24, 36, 48) and a champion for bosses 5 and 10 (levels 30 and 60). Awards are derived from the
 * cleared levels, never stored. Every entry is frozen too, not only the table, so the plain-JS
 * backend cannot rewrite an award in place either.
 */
export const AWARDS: Readonly<Record<number, Award>> = Object.freeze({
  12: Object.freeze<Award>({ kind: 'skin', skin: 13 }),
  24: Object.freeze<Award>({ kind: 'skin', skin: 14 }),
  30: Object.freeze<Award>({ kind: 'variant', variant: 'hex' }),
  36: Object.freeze<Award>({ kind: 'skin', skin: 15 }),
  48: Object.freeze<Award>({ kind: 'skin', skin: 16 }),
  60: Object.freeze<Award>({ kind: 'variant', variant: 'kakashi' }),
});

/** The award level ids in ascending order, so every list derived from them comes out in campaign order. */
const AWARD_LEVELS: readonly number[] = Object.keys(AWARDS).map(Number).sort((a, b) => a - b);

/**
 * Everything `p` has earned: the award of every award level it has cleared, in campaign
 * order. A record of the first campaign is grown by `extendProgress` first, so it earns only what
 * its thirty levels hold; nothing that is not a cleared award level ever appears.
 */
export function earnedAwards(p: CampaignProgress): { variants: OctopiVariant[]; skins: number[] } {
  const cleared = extendProgress(p).cleared;
  const variants: OctopiVariant[] = [];
  const skins: number[] = [];
  for (const level of AWARD_LEVELS) {
    if (cleared[level - 1] !== true) continue;
    const a = AWARDS[level]!;
    if (a.kind === 'variant') variants.push(a.variant);
    else skins.push(a.skin);
  }
  return { variants, skins };
}

/** The level id whose clearing earns `a`, or null when no level awards it (a sold or free one). */
export function awardLevelOf(a: Award): number | null {
  for (const level of AWARD_LEVELS) {
    const b = AWARDS[level]!;
    if (a.kind === 'variant' ? b.kind === 'variant' && b.variant === a.variant : b.kind === 'skin' && b.skin === a.skin) {
      return level;
    }
  }
  return null;
}
