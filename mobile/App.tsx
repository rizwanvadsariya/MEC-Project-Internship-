/**
 * Root component: SafeAreaProvider -> AuthProvider -> NavigationContainer(RootNavigator).
 * Phase 1 adds QueryClientProvider / I18nProvider / ThemeProvider around this
 * same tree (src/app/queryClient.ts, src/i18n, src/theme are already stubbed).
 */
import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { AuthProvider } from './src/auth/AuthProvider';
import RootNavigator from './src/navigation/RootNavigator';
import { navigationTheme } from './src/theme';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar barStyle="dark-content" />
        <NavigationContainer theme={navigationTheme}>
          <RootNavigator />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
