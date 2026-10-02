import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/useAuth';
import { assignRdDivisions, getDivisionAssignments, type DivisionAssignmentData } from '../../api/auth.api';
import { colors, radius, spacing, typography } from '../../theme';

export default function RdDivisionAssignmentScreen() {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const [data, setData] = useState<DivisionAssignmentData | null>(null);
  const [selectedRd, setSelectedRd] = useState<string | null>(null);
  const [selectedDivisions, setSelectedDivisions] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const result = await getDivisionAssignments(accessToken);
      setData(result);
      setError('');
      if (!selectedRd && result.directors[0]) {
        setSelectedRd(result.directors[0].id);
        setSelectedDivisions(result.directors[0].divisionIds);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('rdAssignments.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [accessToken, selectedRd, t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const selectRd = (id: string) => {
    const director = data?.directors.find((item) => item.id === id);
    setSelectedRd(id);
    setSelectedDivisions(director?.divisionIds ?? []);
    setMessage('');
  };

  const toggleDivision = (id: number) => {
    setSelectedDivisions((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
    setMessage('');
  };

  const save = async () => {
    if (!accessToken || !selectedRd || selectedDivisions.length === 0) return;
    setSaving(true);
    try {
      await assignRdDivisions(accessToken, selectedRd, selectedDivisions);
      setMessage(t('rdAssignments.saved'));
      setError('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('rdAssignments.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) return <View style={styles.centered}><ActivityIndicator color={colors.primary} /></View>;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{t('rdAssignments.title')}</Text>
      <Text style={styles.subtitle}>{t('rdAssignments.subtitle')}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.label}>{t('rdAssignments.selectRd')}</Text>
      {data?.directors.map((director) => (
        <Pressable key={director.id} onPress={() => selectRd(director.id)} style={[styles.row, selectedRd === director.id && styles.selectedRow]}>
          <View><Text style={styles.rowTitle}>{director.fullName}</Text><Text style={styles.rowMeta}>{director.email}</Text></View>
          <Text style={styles.check}>{selectedRd === director.id ? '✓' : ''}</Text>
        </Pressable>
      ))}
      <Text style={styles.label}>{t('rdAssignments.selectDivisions')}</Text>
      {data?.divisions.map((division) => (
        <Pressable key={division.id} onPress={() => toggleDivision(division.id)} style={styles.row}>
          <View><Text style={styles.rowTitle}>{division.name}</Text><Text style={styles.rowMeta}>{t('rdAssignments.divisionNumber', { id: division.id })}</Text></View>
          <Text style={[styles.checkbox, selectedDivisions.includes(division.id) && styles.checkboxSelected]}>{selectedDivisions.includes(division.id) ? '✓' : ''}</Text>
        </Pressable>
      ))}
      {message ? <Text style={styles.success}>{message}</Text> : null}
      <Pressable onPress={() => void save()} disabled={saving || !selectedRd || selectedDivisions.length === 0} style={[styles.button, (saving || !selectedRd || selectedDivisions.length === 0) && styles.disabled]}>
        {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>{t('rdAssignments.save')}</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: spacing.lg, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  title: { color: colors.textPrimary, fontSize: typography.size.xxl, fontWeight: typography.weight.bold },
  subtitle: { color: colors.textSecondary, fontSize: typography.size.sm, marginTop: spacing.xs, marginBottom: spacing.lg },
  label: { color: colors.primaryDark, fontSize: typography.size.sm, fontWeight: typography.weight.bold, marginTop: spacing.md, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  selectedRow: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  rowTitle: { color: colors.textPrimary, fontSize: typography.size.md, fontWeight: typography.weight.medium },
  rowMeta: { color: colors.textSecondary, fontSize: typography.size.xs, marginTop: spacing.xs },
  check: { color: colors.primary, fontSize: typography.size.xl },
  checkbox: { width: 26, height: 26, textAlign: 'center', color: colors.white, backgroundColor: colors.border, fontSize: typography.size.lg },
  checkboxSelected: { backgroundColor: colors.primary },
  error: { color: colors.error, marginBottom: spacing.sm },
  success: { color: colors.success, marginVertical: spacing.md },
  button: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: spacing.md, marginTop: spacing.lg },
  disabled: { opacity: 0.5 },
  buttonText: { color: colors.white, fontSize: typography.size.md, fontWeight: typography.weight.bold },
});