/**
 * Phase 0 "role-based routing stub" — proves the RootNavigator -> role
 * navigator branch works and shows the resolved profile. Phase 1 replaces
 * this per role with the real dashboard/scheme-browser/etc. screens already
 * stubbed under src/screens/{regionalDirector,directorGeneral,meo,supportUser}.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useAuth } from '../../auth/useAuth';

const ROLE_LABELS: Record<string, string> = {
  REGIONAL_DIRECTOR: 'Regional Director',
  DIRECTOR_GENERAL: 'Director General',
  MEO: 'Lead MEO',
  SUPPORT_USER: 'Support User',
};

export default function RoleHomeScreen() {
  const { user, signOut } = useAuth();
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
  container: { flex: 1, padding: 24, backgroundColor: '#0b1220' },
  welcome: { color: '#94a3b8', fontSize: 14, marginTop: 12 },
  name: { color: '#fff', fontSize: 26, fontWeight: '700', marginBottom: 20 },
  card: { backgroundColor: '#111827', borderRadius: 12, padding: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  rowLabel: { color: '#94a3b8', fontSize: 13 },
  rowValue: { color: '#fff', fontSize: 13, fontWeight: '600' },
  note: { color: '#64748b', fontSize: 12, marginTop: 20, lineHeight: 18 },
  logout: { marginTop: 'auto', backgroundColor: '#1f2937', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  logoutText: { color: '#f87171', fontWeight: '600' },
});
