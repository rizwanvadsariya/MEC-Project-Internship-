/**
 * Branches on auth state, then on role -> the matching role navigator
 * (Memory.md "role-based routing stub" — the whole point of Phase 0 Step 5).
 */
import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { useAuth } from '../auth/useAuth';
import AuthNavigator from './AuthNavigator';
import RegionalDirectorNavigator from './RegionalDirectorNavigator';
import DirectorGeneralNavigator from './DirectorGeneralNavigator';
import MeoNavigator from './MeoNavigator';
import SupportUserNavigator from './SupportUserNavigator';

export default function RootNavigator() {
  const { isLoading, isAuthenticated, role } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <AuthNavigator />;
  }

  switch (role) {
    case 'REGIONAL_DIRECTOR':
      return <RegionalDirectorNavigator />;
    case 'DIRECTOR_GENERAL':
      return <DirectorGeneralNavigator />;
    case 'MEO':
      return <MeoNavigator />;
    case 'SUPPORT_USER':
      return <SupportUserNavigator />;
    default:
      return (
        <View style={styles.splash}>
          <Text style={styles.unknown}>Unknown role: {String(role)}</Text>
        </View>
      );
  }
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b1220' },
  unknown: { color: '#f87171' },
});
