import type { OctopiVariant } from '@sea-invaders/core';
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, type WithSpringConfig } from 'react-native-reanimated';
import { OctopiThumb } from '../game/OctopiArt';
import { BASE_LOOK, CHAMPION_LOOK } from '../game/looks';
import { ABILITY } from '../loadout/abilities';
import { variantHint } from '../loadout/allowed';
import { VARIANT_NAMES, VARIANT_OCTOPI, type VariantIndex } from '../loadout/items';
import { ACCENT_BY_VARIANT } from '../shop/tints';
import { Txt } from '../ui/Txt';
import { COLORS, FONTS, RADIUS } from '../ui/tokens';

/** Level start picker sizes, in dp: tiles 8 apart, a 34 dp thumb in each. */
const ART = 34;
const TILE_GAP = 8;
/**
 * Up to this many tiles share the row equally; more slide sideways in a
 * scroll, `TILE_WIDTH` each — there are nine champion tiles in total, more than fit in one row.
 */
const ROW_FIT = 4;
const TILE_WIDTH = 72;
/** The Level start sheet's side padding: the scroll runs out to the sheet's edges, its first tile still in line with the copy above. */
const SHEET_PAD = 16;
/** Room kept above and below the scrolled tiles, so a swelling tile (`SWELL_Y`) is never clipped by the scroll's bounds. */
const SWELL_ROOM = 6;
/**
 * A press that travelled farther than this sideways (dp) was a swipe, not a tap (a quick flick
 * starting on a locked tile used to register as its press and open the Shop).
 * The row's scroll also keeps taps muted from the drag's start until this long after it settles.
 */
const PRESS_SLOP = 12;
const DRAG_SETTLE_MS = 150;
/** A tile: `rgba(0,0,0,.25)` with a `rgba(236,228,253,.14)` border; the selected one white-bordered over `.14` white. */
const TILE_BG = 'rgba(0,0,0,0.25)';
const TILE_BORDER = 'rgba(236,228,253,0.14)';
const SELECTED_BG = 'rgba(255,255,255,0.14)';
const SELECTED_BORDER = '#FFFFFF';
/**
 * The line under the name, at 55 % white: the ability on a tile this player may wear, the hint
 * (`variantHint`: "In the Shop" / "Beat <boss>") on a locked one, in the same slot and size so the
 * tile keeps its height. Up to three lines at 72 dp, so no ability or hint is cut short.
 */
const PERK_COLOR = 'rgba(255,255,255,0.55)';
const PERK_LINES = 3;
/** A champion this player may not wear yet is drawn at 40 %. */
const LOCKED_OPACITY = 0.4;
const PRESSED_OPACITY = 0.8;

/**
 * Jelly Radio (React Bits): the picked tile swells wide, then tall, on two springs; its neighbours
 * are nudged outward with a stagger that travels by distance. Adapted for equal tiles: the push is a
 * steady `translateX` (kept inside the row's own 8 dp gap, so no overlap), not the reference's real
 * flex-basis reflow, which equal tiles can't do without a resize per keystroke — the springs and
 * stagger timing are otherwise the same idea.
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

interface VariantPickerProps {
  /** The worn variant: the loadout's `activeVariant` while it is still allowed, else 0. */
  selected: VariantIndex;
  /** The variants this player may wear (`allowedSelectors`): owned, earned, and always the base Octopi. */
  allowed: readonly VariantIndex[];
  /** An allowed tile other than the selected one was tapped. */
  onPick: (variant: VariantIndex) => void;
  /** A tile this player may not wear yet was tapped. */
  onLocked: (variant: VariantIndex) => void;
}

/**
 * The champion picker of the Level start sheet: the base Octopi and
 * every champion, in `VARIANT_INDEX` order, each in its own art over its name and ability. Owned
 * and earned ones can be picked; the rest are dimmed, show where they are had in place of the
 * ability, and say it again on a tap (the Shop, the Connect sheet or a toast).
 */
export function VariantPicker({ selected, allowed, onPick, onLocked }: VariantPickerProps) {
  const count = VARIANT_OCTOPI.length;
  const scroll = useRef<ScrollView>(null);
  const placed = useRef(false);
  // While the row is being dragged (and a moment after), a tile's release is not a tap.
  const dragging = useRef(false);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStart = () => {
    dragging.current = true;
    if (settle.current !== null) clearTimeout(settle.current);
  };
  const dragEnd = () => {
    if (settle.current !== null) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      dragging.current = false;
      settle.current = null;
    }, DRAG_SETTLE_MS);
  };
  useEffect(() => () => {
    if (settle.current !== null) clearTimeout(settle.current);
  }, []);

  // The first time the scroll is laid out, the picked tile is brought to the middle, so a champion
  // far down the row is not hidden past the sheet's edge when the screen opens.
  const place = (e: LayoutChangeEvent) => {
    if (placed.current) return;
    placed.current = true;
    const viewport = e.nativeEvent.layout.width;
    const content = 2 * SHEET_PAD + count * TILE_WIDTH + (count - 1) * TILE_GAP;
    const centre = SHEET_PAD + selected * (TILE_WIDTH + TILE_GAP) + TILE_WIDTH / 2;
    const x = Math.min(Math.max(0, centre - viewport / 2), Math.max(0, content - viewport));
    if (x > 0) scroll.current?.scrollTo({ x, animated: false });
  };

  const tiles = VARIANT_OCTOPI.map((octopi, index) => {
    const locked = !allowed.includes(index);
    return (
      <JellyTile
        key={octopi}
        octopi={octopi}
        index={index}
        count={count}
        selected={selected}
        locked={locked}
        onPress={() => {
          if (dragging.current) return;
          if (locked) onLocked(index);
          else if (index !== selected) onPick(index);
        }}
      />
    );
  });

  if (count <= ROW_FIT) return <View style={styles.row}>{tiles}</View>;
  return (
    <ScrollView
      ref={scroll}
      horizontal
      showsHorizontalScrollIndicator={false}
      onLayout={place}
      onScrollBeginDrag={dragStart}
      onScrollEndDrag={dragEnd}
      onMomentumScrollEnd={dragEnd}
      style={styles.scroll}
      contentContainerStyle={styles.scrollRow}
    >
      {tiles}
    </ScrollView>
  );
}

interface JellyTileProps {
  octopi: OctopiVariant;
  /** This tile's place in the row, which is its `VARIANT_INDEX`: the tiles follow that order. */
  index: number;
  /** How many tiles the row holds: up to `ROW_FIT` they share it, more take `TILE_WIDTH` each. */
  count: number;
  /** The selected tile's place. */
  selected: number;
  locked: boolean;
  onPress: () => void;
}

/**
 * One tile with its own jelly shared values, swell (`scaleX`/`scaleY`) and neighbour push
 * (`translateX`): one component per tile, so the hooks are never called in a loop and their order
 * never varies, however many champions the row holds.
 */
function JellyTile({ octopi, index, count, selected, locked, onPress }: JellyTileProps) {
  const scaleX = useSharedValue(1);
  const scaleY = useSharedValue(1);
  const translateX = useSharedValue(0);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { scaleX: scaleX.value }, { scaleY: scaleY.value }],
  }));

  useEffect(() => {
    if (index === selected) {
      translateX.value = withSpring(0, SETTLE_SPRING);
      scaleX.value = withSequence(withSpring(SWELL_X, WIDE_SPRING), withSpring(1, SETTLE_SPRING));
      scaleY.value = withDelay(TALL_DELAY_MS, withSequence(withSpring(SWELL_Y, TALL_SPRING), withSpring(1, SETTLE_SPRING)));
      return;
    }
    const far = Math.abs(index - selected);
    const dir = Math.sign(index - selected);
    translateX.value = withDelay(far * STAGGER_MS, withSpring(dir * PUSH_DP, PUSH_SPRING));
  }, [index, selected, scaleX, scaleY, translateX]);

  // Where the touch came down: a release farther than `PRESS_SLOP` sideways was a swipe.
  const downX = useRef<number | null>(null);
  const pressIn = (e: GestureResponderEvent) => {
    downX.current = typeof e.nativeEvent.pageX === 'number' ? e.nativeEvent.pageX : null;
  };
  const press = (e: GestureResponderEvent) => {
    const x = e.nativeEvent.pageX;
    if (downX.current !== null && typeof x === 'number' && Math.abs(x - downX.current) > PRESS_SLOP) return;
    onPress();
  };

  const name = VARIANT_NAMES[octopi];
  const { short } = ABILITY[octopi];
  const hint = locked ? variantHint(index) : null;
  const label = [name, short, ...(locked ? ['locked'] : []), ...(hint === null ? [] : [hint])].join(', ');
  const isSelected = index === selected;
  return (
    <Animated.View style={[count <= ROW_FIT ? styles.tileShared : styles.tileFixed, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: isSelected }}
        onPressIn={pressIn}
        onPress={press}
        style={({ pressed }) => [
          styles.tile,
          isSelected && styles.tileSelected,
          { opacity: (locked ? LOCKED_OPACITY : 1) * (pressed ? PRESSED_OPACITY : 1) },
        ]}
      >
        <OctopiThumb look={CHAMPION_LOOK[octopi] ?? BASE_LOOK} accent={ACCENT_BY_VARIANT[octopi]} size={ART} />
        <Txt style={styles.name} numberOfLines={1}>{name}</Txt>
        <Txt style={styles.perk} numberOfLines={PERK_LINES}>{hint ?? short}</Txt>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: TILE_GAP },
  scroll: { flexGrow: 0, marginHorizontal: -SHEET_PAD, marginVertical: -SWELL_ROOM },
  scrollRow: { gap: TILE_GAP, paddingHorizontal: SHEET_PAD, paddingVertical: SWELL_ROOM },
  tileShared: { flex: 1, minWidth: 0 },
  tileFixed: { width: TILE_WIDTH },
  tile: {
    flexGrow: 1, alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 6,
    borderRadius: RADIUS.hudCard, backgroundColor: TILE_BG, borderWidth: 1, borderColor: TILE_BORDER,
  },
  tileSelected: { backgroundColor: SELECTED_BG, borderColor: SELECTED_BORDER },
  name: { fontFamily: FONTS.medium, fontSize: 11, color: COLORS.text, textAlign: 'center' },
  perk: { fontFamily: FONTS.regular, fontSize: 10, color: PERK_COLOR, textAlign: 'center' },
});
