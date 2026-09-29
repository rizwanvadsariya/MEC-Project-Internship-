/**
 * Root component: SafeAreaProvider -> LanguageProvider -> AuthProvider ->
 * NavigationContainer(RootNavigator). Phase 1 adds QueryClientProvider /
 * ThemeProvider around this same tree (src/appState/queryClient.ts, src/theme are
 * already stubbed/built). LanguageProvider is mounted outermost (Step 22):
 * language preference is app-wide and independent of auth state — it must be
 * ready before AuthProvider/LoginScreen render so the login screen itself can
 * already be translated, and it doesn't depend on anything AuthProvider
 * provides (no API calls, no token).
 */
import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { LanguageProvider } from './src/i18n/LanguageProvider';
import { AuthProvider } from './src/auth/AuthProvider';
import RootNavigator from './src/navigation/RootNavigator';
import { navigationTheme } from './src/theme';

export default function App() {
  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <AuthProvider>
          <StatusBar barStyle="dark-content" />
          <NavigationContainer theme={navigationTheme}>
            <RootNavigator />
          </NavigationContainer>
        </AuthProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
