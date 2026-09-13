import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Txt } from './Txt';
import { COLORS, RADIUS, SIZE } from './tokens';

export type PillKind = 'primary' | 'secondary' | 'glass';

interface PillButtonProps {
  label: string;
  onPress?: () => void;
  kind?: PillKind;
  height?: number;
  disabled?: boolean;
  /**
   * Sizes the label to fill the pill's inner width on one line: a short label grows and a long one
   * shrinks, so it always takes the same room (e.g. `Campaign · 9/30` and `Campaign · 100/100`).
   */
  fitLabel?: boolean;
}

/** Horizontal padding inside every pill. */
const PADDING_X = 24;
/** The button font size (tokens `TYPE.button`) the label is measured at before it is fitted. */
const FIT_BASE_SIZE = 16;
/** Bounds for a fitted label: never unreadably small, never taller than the pill allows. */
const FIT_MIN_SIZE = 10;
const FIT_MAX_HEIGHT_SHARE = 0.46;
/** Glyph widths do not scale perfectly linearly with the size; this keeps a fitted label off the edge. */
const FIT_SLACK = 0.96;

/** A full pill. Pills shorter than 48 dp get a hit slop, so the touch target stays 48 dp. */
export function PillButton({ label, onPress, kind = 'primary', height, disabled = false, fitLabel = false }: PillButtonProps) {
  const h = height ?? (kind === 'primary' ? SIZE.primaryButton : SIZE.secondaryButton);
  const slop = Math.max(0, (SIZE.minTap - h) / 2);
  const tone = kind === 'primary' ? 'onPrimary' : 'primary';

  // Fitting needs two widths: the room inside the pill, and the label's natural width at the base
  // size (from an invisible copy laid out without a width limit). The font scales by their ratio.
  const [room, setRoom] = useState(0);
  const [natural, setNatural] = useState(0);
  const fittedSize = fitLabel && room > 0 && natural > 0
    ? Math.min(Math.max((FIT_BASE_SIZE * room * FIT_SLACK) / natural, FIT_MIN_SIZE), h * FIT_MAX_HEIGHT_SHARE)
    : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={slop}
      onLayout={fitLabel ? (e) => setRoom(e.nativeEvent.layout.width - 2 * PADDING_X) : undefined}
      style={({ pressed }) => [styles.base, KIND[kind], { height: h }, pressed && styles.pressed, disabled && styles.disabled]}
    >
      {fitLabel && (
        // Never a touch target: this wide box would otherwise cover the neighbouring button.
        <View pointerEvents="none" style={styles.measure} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Txt variant="button" numberOfLines={1} onTextLayout={(e) => setNatural(e.nativeEvent.lines[0]?.width ?? 0)}>
            {label}
          </Txt>
        </View>
      )}
      <Txt variant="button" tone={tone} numberOfLines={1} style={fittedSize !== null ? { fontSize: fittedSize } : undefined}>
        {label}
      </Txt>
    </Pressable>
  );
}

const KIND = StyleSheet.create({
  primary: { backgroundColor: COLORS.primary },
  secondary: { backgroundColor: COLORS.secondary },
  glass: { backgroundColor: COLORS.hudGlass, borderWidth: 1, borderColor: COLORS.glassBorder },
});

const styles = StyleSheet.create({
  base: { borderRadius: RADIUS.pill, paddingHorizontal: PADDING_X, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.4 },
  // Out of flow and invisible; wide enough that the label never wraps while it is measured.
  measure: { position: 'absolute', left: 0, top: 0, width: 2000, opacity: 0 },
});
