import { StyleSheet, View, type ViewProps } from 'react-native';
import { COLORS, RADIUS } from './tokens';

interface GlassProps extends ViewProps {
  tone?: 'glass' | 'hud' | 'panel';
  radius?: number;
}

/** Translucent surface with a thin light border. The design's background blur is not applied. */
export function Glass({ tone = 'glass', radius = RADIUS.card, style, ...rest }: GlassProps) {
  return <View {...rest} style={[styles.base, TONE[tone], { borderRadius: radius }, style]} />;
}

const TONE = StyleSheet.create({
  glass: { backgroundColor: COLORS.glass },
  hud: { backgroundColor: COLORS.hudGlass },
  panel: { backgroundColor: COLORS.panel },
});

const styles = StyleSheet.create({
  base: { borderWidth: 1, borderColor: COLORS.glassBorder, overflow: 'hidden' },
});
