import { OctopiThumb } from '../game/OctopiArt';
import { BASE_LOOK, CHAMPION_LOOK, SKIN_LOOK, type Look } from '../game/looks';
import { VARIANT_OCTOPI, skinOfItem, variantOfItem } from '../loadout/items';
import { ITEM_TINT } from './tints';

interface ItemArtProps {
  /** Catalogue item id; null (the base Octopi) or an id with no look (a future item) shows Octopi's own colours. */
  itemId: number | null;
  /** Thumb side in dp: 56 for a champion row, 64 for a skin card. */
  size: number;
}

/** The look catalogue item `itemId` sells (design doc §1, §2): a champion's own art, a skin's look, else the base Octopi. */
function lookOfItem(itemId: number | null): Look {
  if (itemId === null) return BASE_LOOK;
  const variant = variantOfItem(itemId);
  if (variant !== null) return CHAMPION_LOOK[VARIANT_OCTOPI[variant]] ?? BASE_LOOK;
  const skin = skinOfItem(itemId);
  if (skin !== null) return SKIN_LOOK[skin] ?? BASE_LOOK;
  return BASE_LOOK;
}

/** A catalogue item's thumb: the look it sells (`OctopiThumb`) over a soft glow of the item's `ITEM_TINT`. */
export function ItemArt({ itemId, size }: ItemArtProps) {
  const accent = itemId === null ? undefined : ITEM_TINT[itemId];
  return <OctopiThumb look={lookOfItem(itemId)} accent={accent ?? '#FFFFFF'} size={size} />;
}
