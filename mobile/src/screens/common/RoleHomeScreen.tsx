/**
 * Phase 0 "role-based routing stub" — proves the RootNavigator -> role
 * navigator branch works and shows the resolved profile. Phase 1 replaces
 * this per role with the real dashboard/scheme-browser/etc. screens already
 * stubbed under src/screens/{regionalDirector,directorGeneral,meo,supportUser}.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../auth/useAuth';
import { colors, radius, spacing, typography } from '../../theme';

const ROLE_LABELS: Record<string, string> = {
  REGIONAL_DIRECTOR: 'Regional Director',
  DIRECTOR_GENERAL: 'Director General',
  MEO: 'Lead MEO',
  SUPPORT_USER: 'Support User',
};

export default function RoleHomeScreen() {
  const { user, signOut } = useAuth();
  const navigation = useNavigation<{ navigate: (screen: string) => void }>();
  if (!user) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.welcome}>Welcome,</Text>
      <Text style={styles.name}>{user.fullName}</Text>
      <View style={styles.card}>
        <Row label="Role" value={ROLE_LABELS[user.role] ?? user.role} />
        <Row label="Email" value={user.email} />
        <Row label="Division ID" value={user.divisionId != null ? String(user.divisionId) : '—'} />
        <Row label="Department ID" value={user.departmentId != null ? String(user.departmentId) : '—'} />
      </View>
      <Text style={styles.note}>
        This is the Phase 0 role-routing stub — {ROLE_LABELS[user.role] ?? user.role} features land in Phase 1.
      </Text>
      <Pressable style={styles.securityButton} onPress={() => navigation.navigate('Security')}>
        <Text style={styles.securityButtonText}>Security settings</Text>
      </Pressable>
      <Pressable style={styles.logout} onPress={signOut}>
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, backgroundColor: colors.background },
  welcome: { color: colors.textSecondary, fontSize: typography.size.sm, marginTop: spacing.sm },
  name: {
    color: colors.textPrimary,
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
  rowLabel: { color: colors.textSecondary, fontSize: typography.size.sm },
  rowValue: { color: colors.textPrimary, fontSize: typography.size.sm, fontWeight: typography.weight.medium },
  note: { color: colors.textSecondary, fontSize: typography.size.xs, marginTop: spacing.lg, lineHeight: typography.lineHeight.md },
  securityButton: {
    marginTop: spacing.md,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
    paddingVertical: spacing.md - 4,
    alignItems: 'center',
  },
  securityButtonText: { color: colors.primaryDark, fontWeight: typography.weight.medium },
  logout: {
    marginTop: 'auto',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    paddingVertical: spacing.md - 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.error,
  },
  logoutText: { color: colors.error, fontWeight: typography.weight.medium },
});
