import { Pressable, StyleSheet } from 'react-native';
import { Txt } from './Txt';
import { COLORS, RADIUS, SIZE } from './tokens';

export type PillKind = 'primary' | 'secondary' | 'glass';

interface PillButtonProps {
  label: string;
  onPress?: () => void;
  kind?: PillKind;
  height?: number;
  disabled?: boolean;
}

/** Smallest share of the button font a long label may shrink to before it would truncate. */
const MIN_LABEL_SCALE = 0.55;

/**
 * A full pill. Pills shorter than 48 dp get a hit slop, so the touch target stays 48 dp. A label
 * that does not fit on one line shrinks until it does (e.g. `Campaign · 20/30` in a half-width pill).
 */
export function PillButton({ label, onPress, kind = 'primary', height, disabled = false }: PillButtonProps) {
  const h = height ?? (kind === 'primary' ? SIZE.primaryButton : SIZE.secondaryButton);
  const slop = Math.max(0, (SIZE.minTap - h) / 2);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={slop}
      style={({ pressed }) => [styles.base, KIND[kind], { height: h }, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Txt
        variant="button"
        tone={kind === 'primary' ? 'onPrimary' : 'primary'}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={MIN_LABEL_SCALE}
      >
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
  base: { borderRadius: RADIUS.pill, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.4 },
});
