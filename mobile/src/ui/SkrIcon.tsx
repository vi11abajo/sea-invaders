import { Image, StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { COLORS } from './tokens';
import { Txt } from './Txt';

/** The SKR token mark from the Solana Mobile press kit (white on transparent; tinted at draw time). */
const MARK = require('../../assets/skr.png');

interface SkrIconProps {
  /** Edge of the square mark, dp; pick about 0.9 of the neighbouring text's font size. */
  size?: number;
  /** Tint, normally the colour of the text next to it. */
  color?: string;
}

/** The SKR token mark, so an amount reads as SKR without the word. */
export function SkrIcon({ size = 14, color = COLORS.text }: SkrIconProps) {
  return <Image source={MARK} accessibilityLabel="SKR" style={{ width: size, height: size, tintColor: color }} />;
}

interface SkrAmountProps extends SkrIconProps {
  /** The amount, already formatted (`formatSkr` / `formatInt`); may carry a suffix like `in 0:42`. */
  value: string;
  /** The caller's text style for the number - font, size and colour; the mark takes `color` separately. */
  textStyle?: StyleProp<TextStyle>;
  /** The row's own style, e.g. to right-align it. */
  style?: StyleProp<ViewStyle>;
  gap?: number;
}

/** An SKR amount: the token mark, then the number in the caller's text style. */
export function SkrAmount({ value, textStyle, style, size, color, gap = 5 }: SkrAmountProps) {
  return (
    <View style={[styles.row, { gap }, style]}>
      <SkrIcon size={size} color={color} />
      <Txt style={textStyle} numberOfLines={1}>{value}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
