/**
 * Design tokens: colors, spacing, typography — single source of truth per
 * ui-implementation.md §1. No screen should hardcode a color/space/font
 * value directly; import from here instead.
 */
import type { Theme as NavigationTheme } from '@react-navigation/native';

export const colors = {
  primary: '#4CAF50',
  primaryLight: '#A5D6A7',
  primaryDark: '#2E7D32',
  background: '#F8F9FA',
  surface: '#E9ECEF',
  border: '#DEE2E6',
  textPrimary: '#212529',
  textSecondary: '#495057',
  error: '#DC3545',
  warning: '#FFC107',
  success: '#198754',
  white: '#FFFFFF',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 0,
  md: 0,
  lg: 0,
  pill: 999,
} as const;

export const typography = {
  size: {
    xs: 12,
    sm: 13,
    md: 15,
    lg: 18,
    xl: 22,
    xxl: 28,
  },
  weight: {
    regular: '400' as const,
    medium: '600' as const,
    bold: '700' as const,
  },
  lineHeight: {
    sm: 18,
    md: 22,
    lg: 28,
  },
} as const;

/** React Navigation theme — keeps header/background/border colors identical
 *  across every navigator instead of each one picking its own. */
export const navigationTheme: NavigationTheme = {
  dark: false,
  colors: {
    primary: colors.primary,
    background: colors.background,
    card: colors.primaryDark,
    text: colors.textPrimary,
    border: colors.border,
    notification: colors.warning,
  },
  fonts: {
    regular: { fontFamily: 'System', fontWeight: typography.weight.regular },
    medium: { fontFamily: 'System', fontWeight: typography.weight.medium },
    bold: { fontFamily: 'System', fontWeight: typography.weight.bold },
    heavy: { fontFamily: 'System', fontWeight: typography.weight.bold },
  },
};

/** One shared slide config for every stack navigator (ui-implementation.md
 *  §3 — "configured once, globally... not per-screen"). Spread this into
 *  each Stack.Navigator's screenOptions. */
export const stackScreenOptions = {
  animation: 'slide_from_right' as const,
  headerStyle: { backgroundColor: colors.primaryDark },
  headerTintColor: colors.white,
  headerTitleStyle: { fontWeight: typography.weight.medium, fontSize: typography.size.lg },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.background },
};
