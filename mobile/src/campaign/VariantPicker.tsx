import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, type WithSpringConfig } from 'react-native-reanimated';
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

/**
 * Jelly Radio (React Bits): the picked tile swells wide, then tall, on two springs; its neighbours
 * are nudged outward with a stagger that travels by distance. Adapted for four equal `flex: 1`
 * tiles: the push is a steady `translateX` (kept inside the row's own 8 dp gap, so no overlap),
 * not the reference's real flex-basis reflow, which flex-equal tiles can't do without a resize
 * per keystroke — the springs and stagger timing are otherwise the same idea.
 */
const WIDE_SPRING: WithSpringConfig = { stiffness: 520, damping: 14, mass: 0.7 };
const TALL_SPRING: WithSpringConfig = { stiffness: 420, damping: 12, mass: 0.8 };
const SETTLE_SPRING: WithSpringConfig = { stiffness: 300, damping: 22, mass: 0.9 };
const PUSH_SPRING: WithSpringConfig = { stiffness: 260, damping: 20, mass: 0.8 };
/** Wide-then-tall: the tall spring starts this many ms after the wide one. */
const TALL_DELAY_MS = 70;
/** Neighbour stagger: `distance * this` ms of extra delay before a farther tile's push starts. */
const STAGGER_MS = 40;
/** How far a pushed neighbour travels, dp — kept inside the row's 8 dp gap. */
const PUSH_DP = 5;
const SWELL_X = 1.14;
const SWELL_Y = 1.08;

/** One tile's jelly shared values, swell (`scaleX`/`scaleY`) and neighbour push (`translateX`). */
function useJellyTile() {
  const scaleX = useSharedValue(1);
  const scaleY = useSharedValue(1);
  const translateX = useSharedValue(0);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { scaleX: scaleX.value }, { scaleY: scaleY.value }],
  }));
  return { scaleX, scaleY, translateX, style };
}

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
  // Four fixed tiles: one `useJellyTile()` call site per index (never in a loop), so hook order
  // never varies across renders.
  const tiles = [useJellyTile(), useJellyTile(), useJellyTile(), useJellyTile()];

  useEffect(() => {
    tiles.forEach(({ scaleX, scaleY, translateX }, i) => {
      if (i === selected) {
        translateX.value = withSpring(0, SETTLE_SPRING);
        scaleX.value = withSequence(withSpring(SWELL_X, WIDE_SPRING), withSpring(1, SETTLE_SPRING));
        scaleY.value = withDelay(TALL_DELAY_MS, withSequence(withSpring(SWELL_Y, TALL_SPRING), withSpring(1, SETTLE_SPRING)));
        return;
      }
      const far = Math.abs(i - selected);
      const dir = Math.sign(i - selected);
      translateX.value = withDelay(far * STAGGER_MS, withSpring(dir * PUSH_DP, PUSH_SPRING));
    });
    // `tiles` holds stable shared values (four fixed hook calls); only `selected` should retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  return (
    <View style={styles.row}>
      {SELECTORS.map((variant) => {
        const itemId = VARIANT_ITEM_IDS[variant];
        const name = itemId === null ? BASE_OCTOPI_NAME : (ITEM_NAMES[itemId] ?? `Item ${itemId}`);
        const perk = PERKS[variant];
        const locked = itemId !== null && !owned.includes(itemId);
        const isSelected = variant === selected;
        return (
          <Animated.View key={variant} style={[styles.tileWrap, tiles[variant]!.style]}>
            <Pressable
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
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: TILE_GAP },
  tileWrap: { flex: 1, minWidth: 0 },
  tile: {
    alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 6,
    borderRadius: RADIUS.hudCard, backgroundColor: TILE_BG, borderWidth: 1, borderColor: TILE_BORDER,
  },
  tileSelected: { backgroundColor: SELECTED_BG, borderColor: SELECTED_BORDER },
  name: { fontFamily: FONTS.medium, fontSize: 11, color: COLORS.text, textAlign: 'center' },
  perk: { fontFamily: FONTS.regular, fontSize: 10, color: PERK_COLOR, textAlign: 'center' },
});
