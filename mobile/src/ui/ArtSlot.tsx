import { StyleSheet, View } from 'react-native';
import { Txt } from './Txt';
import { COLORS } from './tokens';

/** Marks where the owner's art goes, at its final size. Never ship it. */
export function ArtSlot({ size, label }: { size: number; label: string }) {
  return (
    <View style={[styles.slot, { width: size, height: size, borderRadius: size / 2 }]}>
      <Txt variant="monoSmall" tone="secondary" numberOfLines={1}>
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: COLORS.artSlot, alignItems: 'center', justifyContent: 'center' },
});
