/**
 * Root component: SafeAreaProvider -> LanguageProvider -> AuthProvider ->
 * NavigationContainer(RootNavigator). Phase 1 adds QueryClientProvider /
 * ThemeProvider around this same tree (src/appState/queryClient.ts, src/theme are
 * already stubbed/built). LanguageProvider is mounted outermost (Step 22):
 * language preference is app-wide and independent of auth state — it must be
 * ready before AuthProvider/LoginScreen render so the login screen itself can
 * already be translated, and it doesn't depend on anything AuthProvider
 * provides (no API calls, no token).
 *
 * NavigationContainer is keyed on `isRTL`: switching to/from a RTL language
 * calls I18nManager.forceRTL, which only affects *newly created* native
 * views — already-mounted ones keep their old layout direction until
 * something remounts them. Changing `key` forces React to tear down and
 * recreate the whole navigation tree on a language switch, so the new
 * direction applies immediately without needing a full app restart.
 */
import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { LanguageProvider } from './src/i18n/LanguageProvider';
import { useLanguage } from './src/i18n/useLanguage';
import { AuthProvider } from './src/auth/AuthProvider';
import RootNavigator from './src/navigation/RootNavigator';
import { navigationTheme } from './src/theme';

function AppShell() {
  const { isRTL } = useLanguage();
  return (
    <AuthProvider>
      <StatusBar barStyle="dark-content" />
      <NavigationContainer key={isRTL ? 'rtl' : 'ltr'} theme={navigationTheme}>
        <RootNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <AppShell />
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
