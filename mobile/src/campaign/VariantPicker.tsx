import { Pressable, StyleSheet, View } from 'react-native';
import { BASE_OCTOPI_NAME, ITEM_NAMES, VARIANT_ITEM_IDS, type VariantIndex } from '../loadout/items';
import { ItemArt } from '../shop/ItemArt';
import { Txt } from '../ui/Txt';
import { COLORS, FONTS, RADIUS } from '../ui/tokens';

/** Handoff 06 (Level start) picker sizes, in dp: four tiles in a row, 8 apart, a 34 dp thumb in each. */
const ART = 34;
const TILE_GAP = 8;
/** A tile: `rgba(0,0,0,.25)` with a `rgba(236,228,253,.14)` border; the selected one white-bordered over `.14` white. */
const TILE_BG = 'rgba(0,0,0,0.25)';
const TILE_BORDER = 'rgba(236,228,253,0.14)';
const SELECTED_BG = 'rgba(255,255,255,0.14)';
const SELECTED_BORDER = '#FFFFFF';
/** The perk line under the name, at 55 % white. */
const PERK_COLOR = 'rgba(255,255,255,0.55)';
/** A variant the wallet does not own is drawn at 40 %. */
const LOCKED_OPACITY = 0.4;
const PRESSED_OPACITY = 0.8;

/** What each tile says under its name (handoff 06), by variant selector: the base Octopi, Harpoon, Anchor, Trident. */
const PERKS: readonly [string, string, string, string] = ['balanced', 'fire rate', '+1 life', 'piercing'];
const SELECTORS: readonly VariantIndex[] = [0, 1, 2, 3];

interface VariantPickerProps {
  /** The equipped variant: the loadout's `activeVariant`. */
  selected: VariantIndex;
  /** Catalogue item ids the wallet owns; empty when signed out, so only the base Octopi is open. */
  owned: readonly number[];
  /** An owned tile other than the selected one was tapped. */
  onPick: (variant: VariantIndex) => void;
  /** A tile the wallet does not own was tapped. */
  onLocked: () => void;
}

/**
 * The octopi picker of the Level start sheet (handoff 06): the base Octopi and the three campaign
 * octopi, each as its Shop thumb (Octopi recoloured to the item's tint) over its name and perk.
 */
export function VariantPicker({ selected, owned, onPick, onLocked }: VariantPickerProps) {
  return (
    <View style={styles.row}>
      {SELECTORS.map((variant) => {
        const itemId = VARIANT_ITEM_IDS[variant];
        const name = itemId === null ? BASE_OCTOPI_NAME : (ITEM_NAMES[itemId] ?? `Item ${itemId}`);
        const perk = PERKS[variant];
        const locked = itemId !== null && !owned.includes(itemId);
        const isSelected = variant === selected;
        return (
          <Pressable
            key={variant}
            accessibilityRole="button"
            accessibilityLabel={`${name}, ${perk}${locked ? ', locked' : ''}`}
            accessibilityState={{ selected: isSelected }}
            onPress={() => {
              if (locked) onLocked();
              else if (!isSelected) onPick(variant);
            }}
            style={({ pressed }) => [
              styles.tile,
              isSelected && styles.tileSelected,
              { opacity: (locked ? LOCKED_OPACITY : 1) * (pressed ? PRESSED_OPACITY : 1) },
            ]}
          >
            <ItemArt itemId={itemId} size={ART} />
            <Txt style={styles.name} numberOfLines={1}>{name}</Txt>
            <Txt style={styles.perk} numberOfLines={1}>{perk}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: TILE_GAP },
  tile: {
    flex: 1, minWidth: 0, alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 6,
    borderRadius: RADIUS.hudCard, backgroundColor: TILE_BG, borderWidth: 1, borderColor: TILE_BORDER,
  },
  tileSelected: { backgroundColor: SELECTED_BG, borderColor: SELECTED_BORDER },
  name: { fontFamily: FONTS.medium, fontSize: 11, color: COLORS.text, textAlign: 'center' },
  perk: { fontFamily: FONTS.regular, fontSize: 10, color: PERK_COLOR, textAlign: 'center' },
});
