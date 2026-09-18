import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { hapticTap } from '../audio/haptics';
import { playSfx } from '../audio/sfx';
import { SkrIcon } from './SkrIcon';
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
  /** An SKR amount shown after the label with the token mark (`Buy ticket — [S] 10`; a bare `[S] 25` when the label is empty). */
  skr?: string;
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
export function PillButton({ label, onPress, kind = 'primary', height, disabled = false, fitLabel = false, skr }: PillButtonProps) {
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

  // A pill has no notion of "back" beyond its own label — "Back to level"/"Back to map" are the
  // only ones in the app today (verified against every `PillButton` call site) — so the label text
  // is the one signal available to tell those apart from an ordinary tap.
  const onPressWithSound = () => {
    playSfx(label.trim().toLowerCase().startsWith('back') ? 'ui_back' : 'ui_tap');
    // Table D: "any pill / button" is Selection, the lightest tick the phone has - every PillButton
    // press, back-labelled ones included (unlike the sound, which picks between two ids by label).
    hapticTap();
    onPress?.();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPressWithSound}
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
      <View style={styles.row}>
        {label !== '' && (
          <Txt variant="button" tone={tone} numberOfLines={1} style={fittedSize !== null ? { fontSize: fittedSize } : undefined}>
            {label}
          </Txt>
        )}
        {skr !== undefined && (
          <>
            <SkrIcon size={(fittedSize ?? FIT_BASE_SIZE) * 0.85} color={kind === 'primary' ? COLORS.onPrimary : COLORS.text} />
            <Txt variant="button" tone={tone} numberOfLines={1} style={[styles.skrGap, fittedSize !== null ? { fontSize: fittedSize } : undefined]}>
              {skr}
            </Txt>
          </>
        )}
      </View>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // The mark already sits 6 dp after the label; the number hugs the mark a little closer.
  skrGap: { marginLeft: -2 },
});
