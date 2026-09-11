import { Text, type TextProps } from 'react-native';
import { COLORS, TYPE } from './tokens';

export type TxtVariant = keyof typeof TYPE;
export type TxtTone = 'primary' | 'secondary' | 'tertiary' | 'success' | 'warning' | 'info' | 'onPrimary';

const TONE: Record<TxtTone, string> = {
  primary: COLORS.text,
  secondary: COLORS.textSecondary,
  tertiary: COLORS.textTertiary,
  success: COLORS.success,
  warning: COLORS.warning,
  info: COLORS.info,
  onPrimary: COLORS.onPrimary,
};

interface TxtProps extends TextProps {
  variant?: TxtVariant;
  tone?: TxtTone;
}

/** Text in the design system's type scale. */
export function Txt({ variant = 'body', tone = 'primary', style, ...rest }: TxtProps) {
  return <Text {...rest} style={[TYPE[variant], { color: TONE[tone] }, style]} />;
}
