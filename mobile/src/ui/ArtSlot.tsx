import { StyleSheet, View } from 'react-native';
import { Txt } from './Txt';
import { COLORS } from './tokens';

interface ArtSlotProps {
  size: number;
  label?: string;
  color?: string;
}

/** Marks where the owner's art goes, at its final size. Never ship it. */
export function ArtSlot({ size, label, color = COLORS.artSlot }: ArtSlotProps) {
  return (
    <View style={[styles.slot, { width: size, height: size, borderRadius: size / 2, borderColor: color }]}>
      {label !== undefined && (
        <Txt variant="monoSmall" tone="secondary" numberOfLines={1}>
          {label}
        </Txt>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
});
