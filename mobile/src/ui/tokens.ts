import type { TextStyle } from 'react-native';

/** Design tokens of the Sea Invaders redesign. Sizes are in dp. */

/** The official Solana gradient: money, records, wins, progress, the weekly pool, combo >= x4. */
export const SIGNATURE_GRADIENT = {
  colors: ['#9945FF', '#8752F3', '#5497D5', '#43B4CA', '#28E0B9', '#19FB9B'],
  positions: [0.08, 0.3, 0.5, 0.6, 0.72, 0.97],
} as const;

export const COLORS = {
  app: '#0C0C0E',
  panel: '#121212',
  sectionTop: '#000000',
  sectionBottom: '#14001D',
  glass: 'rgba(236,228,253,0.12)',
  glassBorder: 'rgba(236,228,253,0.16)',
  hudGlass: 'rgba(18,18,18,0.6)',
  sheet: 'rgba(12,12,14,0.82)',
  modalSheet: '#141318',
  scrim: 'rgba(0,0,0,0.55)',
  toast: '#1B1A22',
  text: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.64)',
  textTertiary: 'rgba(255,255,255,0.48)',
  success: '#19FB9B',
  warning: '#F48252',
  warningBg: 'rgba(244,130,82,0.16)',
  warningBorder: 'rgba(244,130,82,0.38)',
  info: '#28E0B9',
  primary: '#FFFFFF',
  onPrimary: '#000000',
  secondary: 'rgba(255,255,255,0.08)',
  artSlot: 'rgba(255,255,255,0.55)',
} as const;

/** Reef life: crabs, corals, boosts and skins. Never UI chrome. */
export const REEF_LIFE = {
  lime: '#CFF15E',
  mint: '#55E9AB',
  lilac: '#CA9FF5',
  orange: '#F48252',
  yellow: '#FFC526',
} as const;

/** Campaign map colour of reefs 1 to 5. */
export const REEF_PROGRESS = ['#5497D5', '#43B4CA', '#28E0B9', '#8752F3', '#9945FF'] as const;

export type WorldTheme = 'night' | 'day';

/** Top-to-bottom gradient of the world. Night Reef is the default; Day Reef is a cosmetic skin. */
export const WORLD_GRADIENT: Record<WorldTheme, { colors: readonly string[]; positions: readonly number[] }> = {
  night: { colors: ['#14001D', '#0A0A14', '#000000'], positions: [0, 0.55, 1] },
  day: { colors: ['#43B4CA', '#2A8FB0', '#1E5C7A'], positions: [0, 0.45, 1] },
};

export const RADIUS = {
  pill: 99,
  card: 20,
  row: 16,
  hudCard: 14,
  toast: 14,
  tile: 12,
  modal: 24,
  sheet: 32,
} as const;

export const SIZE = {
  minTap: 48,
  primaryButton: 56,
  homeDailyButton: 64,
  secondaryButton: 48,
  compactPill: 40,
  featureIcon: 52,
  avatar: 28,
} as const;

/** Font family names. useAppFonts registers the files under exactly these names. */
export const FONTS = {
  regular: 'InstrumentSans_400Regular',
  medium: 'InstrumentSans_500Medium',
  semibold: 'InstrumentSans_600SemiBold',
  mono: 'GeistMono_500Medium',
} as const;

/** Type scale. Letter spacing is in dp: -3% of 17 is -0.51. */
export const TYPE = {
  screenTitle: { fontFamily: FONTS.medium, fontSize: 17, letterSpacing: -0.51 },
  sheetTitle: { fontFamily: FONTS.medium, fontSize: 26, letterSpacing: -0.78 },
  headline: { fontFamily: FONTS.medium, fontSize: 22, letterSpacing: -0.66 },
  heroNumber: { fontFamily: FONTS.mono, fontSize: 30 },
  resultScore: { fontFamily: FONTS.mono, fontSize: 72, letterSpacing: -3.6 },
  button: { fontFamily: FONTS.medium, fontSize: 16 },
  body: { fontFamily: FONTS.regular, fontSize: 13 },
  secondary: { fontFamily: FONTS.regular, fontSize: 12 },
  label: { fontFamily: FONTS.medium, fontSize: 11, letterSpacing: 0.55, textTransform: 'uppercase' },
  mono: { fontFamily: FONTS.mono, fontSize: 13 },
  monoSmall: { fontFamily: FONTS.mono, fontSize: 11 },
} as const satisfies Record<string, TextStyle>;

export const MOTION = {
  riseMs: 350,
  riseOffset: 14,
  driftMs: 3400,
  driftOffset: 12,
  swayMs: 2700,
  swayOffset: 15,
  raysMs: 4500,
  raysMin: 0.3,
  raysMax: 0.7,
  tickerMs: 22000,
  toastInMs: 250,
  toastHoldMs: 2600,
  spinnerMs: 1000,
} as const;
