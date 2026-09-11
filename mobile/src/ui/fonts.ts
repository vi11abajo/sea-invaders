import { GeistMono_500Medium } from '@expo-google-fonts/geist-mono/500Medium';
import { InstrumentSans_400Regular } from '@expo-google-fonts/instrument-sans/400Regular';
import { InstrumentSans_500Medium } from '@expo-google-fonts/instrument-sans/500Medium';
import { InstrumentSans_600SemiBold } from '@expo-google-fonts/instrument-sans/600SemiBold';
import { useFonts } from 'expo-font';
import { FONTS } from './tokens';

/** Loads the UI and number fonts. Returns true once they are ready, or once loading failed (system font fallback). */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    [FONTS.regular]: InstrumentSans_400Regular,
    [FONTS.medium]: InstrumentSans_500Medium,
    [FONTS.semibold]: InstrumentSans_600SemiBold,
    [FONTS.mono]: GeistMono_500Medium,
  });
  return loaded || error != null;
}
