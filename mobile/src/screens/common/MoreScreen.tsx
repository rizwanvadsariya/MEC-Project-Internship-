import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/useAuth';
import ListRow from '../../components/common/ListRow';
import { colors, spacing } from '../../theme';

/** Role-aware overflow menu: everything that doesn't fit on the bottom tab
 *  bar, plus language switching and logout (previously buried in a long
 *  scrolling button list on RoleHomeScreen). */
export default function MoreScreen() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const navigation = useNavigation<{ navigate: (screen: string) => void }>();

  if (!user) return null;

  const isRd = user.role === 'REGIONAL_DIRECTOR';
  const isDg = user.role === 'DIRECTOR_GENERAL';
  const isMeo = user.role === 'MEO';
  const isDivisionLead = isRd || isDg;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {isDivisionLead ? (
        <ListRow icon="stats-chart-outline" label={t('roleHome.buttons.kpiDashboard')} onPress={() => navigation.navigate('KpiDashboard')} />
      ) : null}
      <ListRow icon="map-outline" label={t('roleHome.buttons.gisMap')} onPress={() => navigation.navigate('GisMap')} />
      {isRd || isMeo ? (
        <ListRow icon="calendar-outline" label={t('roleHome.buttons.visitCalendar')} onPress={() => navigation.navigate('VisitCalendar')} />
      ) : null}
      {isDivisionLead ? (
        <ListRow icon="bar-chart-outline" label={t('roleHome.buttons.analytics')} onPress={() => navigation.navigate('Analytics')} />
      ) : null}
      {isDivisionLead ? (
        <ListRow icon="document-text-outline" label={t('roleHome.buttons.auditTrail')} onPress={() => navigation.navigate('AuditTrail')} />
      ) : null}
      {isDivisionLead ? (
        <ListRow icon="git-compare-outline" label={t('roleHome.buttons.reconciliation')} onPress={() => navigation.navigate('ProgressReconciliation')} />
      ) : null}
      {isDivisionLead ? (
        <ListRow icon="warning-outline" label={t('roleHome.buttons.anomalies')} onPress={() => navigation.navigate('Anomalies')} />
      ) : null}
      {isRd ? (
        <ListRow icon="person-add-outline" label={t('navigation.createTeamMember')} onPress={() => navigation.navigate('CreateTeamMember')} />
      ) : null}
      {isDg ? (
        <ListRow icon="git-branch-outline" label={t('roleHome.buttons.rdAssignments')} onPress={() => navigation.navigate('RdDivisionAssignments')} />
      ) : null}
      <ListRow icon="notifications-outline" label={t('roleHome.buttons.notifications')} onPress={() => navigation.navigate('Notifications')} />
      <ListRow icon="language-outline" label={t('roleHome.buttons.language')} onPress={() => navigation.navigate('Language')} />
      <ListRow icon="shield-checkmark-outline" label={t('roleHome.buttons.security')} onPress={() => navigation.navigate('Security')} />
      <ListRow icon="log-out-outline" label={t('roleHome.buttons.logOut')} onPress={signOut} tone="danger" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: spacing.lg, backgroundColor: colors.background },
});
