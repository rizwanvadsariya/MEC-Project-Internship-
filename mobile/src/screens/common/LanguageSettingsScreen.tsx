/**
 * Language switcher (phases.md Step 22) — 3 selectable options, each shown in
 * its own script (English / اردو / سنڌي). Not role-restricted (unlike
 * Comments/Calendar, which Steps 20-21 deliberately scoped to specific
 * roles) — mounted in all 4 role navigators, reachable from every role via a
 * "Language" button on RoleHomeScreen next to "Security settings".
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import LanguagePickerOptions from '../../i18n/LanguagePickerOptions';
import { colors, spacing, typography } from '../../theme';

export default function LanguageSettingsScreen() {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('languageSettings.title')}</Text>
      <Text style={styles.subtitle}>{t('languageSettings.subtitle')}</Text>
      <LanguagePickerOptions />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  title: { color: colors.textPrimary, fontSize: typography.size.xl, fontWeight: typography.weight.bold, marginBottom: spacing.xs },
  subtitle: { color: colors.textSecondary, fontSize: typography.size.sm, lineHeight: typography.lineHeight.md, marginBottom: spacing.lg },
});
