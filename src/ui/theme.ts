import { Platform, useColorScheme } from 'react-native';

/**
 * Design tokens. The palette follows the dark, high-contrast look of desktop VCE
 * players, with a light variant so the app respects the system setting.
 */

export interface Theme {
  dark: boolean;
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  primary: string;
  primaryText: string;
  success: string;
  successBg: string;
  danger: string;
  dangerBg: string;
  warning: string;
  warningBg: string;
  info: string;
  markBg: string;
}

const dark: Theme = {
  dark: true,
  bg: '#0B1220',
  surface: '#151E30',
  surfaceAlt: '#1D2839',
  border: '#2A374C',
  text: '#EEF2F8',
  textMuted: '#9BA9BF',
  textFaint: '#6B7A91',
  primary: '#3B82F6',
  primaryText: '#FFFFFF',
  success: '#34D399',
  successBg: '#0F3A2E',
  danger: '#F87171',
  dangerBg: '#3F1A1D',
  warning: '#FBBF24',
  warningBg: '#3A2E10',
  info: '#60A5FA',
  markBg: '#3A2E10',
};

const light: Theme = {
  dark: false,
  bg: '#F4F6FA',
  surface: '#FFFFFF',
  surfaceAlt: '#EDF1F7',
  border: '#D7DEE9',
  text: '#101828',
  textMuted: '#54637A',
  textFaint: '#8494A9',
  primary: '#2563EB',
  primaryText: '#FFFFFF',
  success: '#047857',
  successBg: '#D5F5E6',
  danger: '#B91C1C',
  dangerBg: '#FDE2E2',
  warning: '#B45309',
  warningBg: '#FDF0D5',
  info: '#1D4ED8',
  markBg: '#FDF0D5',
};

export function useTheme(): Theme {
  return useColorScheme() === 'light' ? light : dark;
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 22,
  xxl: 30,
} as const;

/** Monospace family for code and CLI output inside a question stem. */
export const monoFont = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});
