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

/** A full pill. Pills shorter than 48 dp get a hit slop, so the touch target stays 48 dp. */
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
      <Txt variant="button" tone={kind === 'primary' ? 'onPrimary' : 'primary'} numberOfLines={1}>
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
