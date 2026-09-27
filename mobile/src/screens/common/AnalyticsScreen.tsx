/**
 * Basic analytics (phases.md Step 23) — progress % by division/department
 * and a status breakdown for teams/visits/issues. RD/DG only, same access
 * scope as the /dashboards/division endpoint this screen reads (no new API
 * client function needed — DivisionDashboard already carries everything).
 *
 * Dependency-free by deliberate choice (Memory.md "Mobile UI theme" — two
 * prior animation/rendering libraries failed without a device to verify
 * them): progress bars are plain Views with a percentage-based width style,
 * the same primitive-only approach VisitCalendarScreen/RoleHomeScreen
 * already use, no chart library.
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/useAuth';
import {
  getDivisionDashboard,
  type DivisionDashboard,
  type DepartmentProgress,
  type TeamStatus,
  type VisitStatus,
  type IssueStatus,
  type IssueSeverity,
} from '../../api/dashboard.api';
import { colors, radius, spacing, typography } from '../../theme';

const TEAM_STATUSES: TeamStatus[] = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'];
const VISIT_STATUSES: VisitStatus[] = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const ISSUE_STATUSES: IssueStatus[] = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED'];
const ISSUE_SEVERITIES: IssueSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export default function AnalyticsScreen() {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const [dashboard, setDashboard] = useState<DivisionDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      setDashboard(await getDivisionDashboard(accessToken));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('analytics.couldNotLoad'));
    } finally {
      setLoading(false);
    }
  }, [accessToken, t]);

  useFocusEffect(
    useCallback(() => {
      const timer = setTimeout(() => { void load(); }, 0);
      return () => clearTimeout(timer);
    }, [load]),
  );

  if (loading && !dashboard) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{t('analytics.title')}</Text>
      <Text style={styles.subtitle}>{dashboard?.division.name ?? ''}</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {dashboard ? (
        <>
          <OverallProgressCard overall={dashboard.overallProgress} />
          <DepartmentProgressList departments={dashboard.progressByDepartment} />
          <StatusBreakdownSection dashboard={dashboard} />
        </>
      ) : null}
    </ScrollView>
  );
}

function formatPct(value: number | null, t: (key: string) => string): string {
  if (value === null) return t('analytics.notYetReported');
  return `${Math.round(value)}%`;
}

function OverallProgressCard({ overall }: { overall: DivisionDashboard['overallProgress'] }) {
  const { t } = useTranslation();
  const widthPct = overall.avgProgressPct ?? 0;
  return (
    <View style={styles.card}>
      <Text style={styles.sectionHeader}>{t('analytics.overallProgress')}</Text>
      <Text style={styles.overallFigure}>{formatPct(overall.avgProgressPct, t)}</Text>
      <ProgressBar percent={widthPct} />
      <Text style={styles.contextText}>
        {t('analytics.schemesReportedContext', { reported: overall.schemesReported, total: overall.schemesTotal })}
      </Text>
    </View>
  );
}

function DepartmentProgressList({ departments }: { departments: DepartmentProgress[] }) {
  const { t } = useTranslation();
  return (
    <View style={styles.card}>
      <Text style={styles.sectionHeader}>{t('analytics.progressByDepartment')}</Text>
      {departments.length === 0 ? (
        <Text style={styles.contextText}>{t('analytics.noDepartments')}</Text>
      ) : (
        departments.map((dept) => (
          <View key={dept.departmentId} style={styles.deptRow}>
            <View style={styles.deptRowHeader}>
              <Text style={styles.deptName}>{dept.departmentName}</Text>
              <Text style={styles.deptPct}>{formatPct(dept.avgProgressPct, t)}</Text>
            </View>
            <ProgressBar percent={dept.avgProgressPct ?? 0} />
            <Text style={styles.contextText}>
              {t('analytics.schemesReportedContext', { reported: dept.schemesReported, total: dept.schemesTotal })}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

function StatusBreakdownSection({ dashboard }: { dashboard: DivisionDashboard }) {
  const { t } = useTranslation();
  return (
    <View style={styles.card}>
      <Text style={styles.sectionHeader}>{t('analytics.statusBreakdown')}</Text>

      <Text style={styles.groupLabel}>{t('analytics.teams')}</Text>
      {TEAM_STATUSES.map((status) => (
        <StatusRow key={status} label={t(`analytics.teamStatus.${status}`)} count={dashboard.teams.byStatus[status]} />
      ))}

      <Text style={styles.groupLabel}>{t('analytics.visits')}</Text>
      {VISIT_STATUSES.map((status) => (
        <StatusRow key={status} label={t(`siteVisits.status.${status}`)} count={dashboard.visits.byStatus[status]} />
      ))}

      <Text style={styles.groupLabel}>{t('analytics.issues')}</Text>
      {ISSUE_STATUSES.map((status) => (
        <StatusRow key={status} label={t(`analytics.issueStatus.${status}`)} count={dashboard.issues.byStatus[status]} />
      ))}

      <Text style={styles.groupLabel}>{t('analytics.issuesBySeverity')}</Text>
      {ISSUE_SEVERITIES.map((severity) => (
        <StatusRow key={severity} label={t(`analytics.issueSeverity.${severity}`)} count={dashboard.issues.bySeverity[severity]} />
      ))}
    </View>
  );
}

function StatusRow({ label, count }: { label: string; count: number }) {
  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={styles.statusCount}>{count}</Text>
    </View>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { width: `${clamped}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: spacing.lg, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  title: { color: colors.textPrimary, fontSize: typography.size.xxl, fontWeight: typography.weight.bold },
  subtitle: { color: colors.textSecondary, fontSize: typography.size.sm, marginTop: spacing.xs, marginBottom: spacing.md },
  error: { color: colors.error, marginBottom: spacing.md, lineHeight: typography.lineHeight.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  sectionHeader: { color: colors.textPrimary, fontSize: typography.size.md, fontWeight: typography.weight.bold, marginBottom: spacing.sm },
  overallFigure: { color: colors.primaryDark, fontSize: typography.size.xxl, fontWeight: typography.weight.bold },
  contextText: { color: colors.textSecondary, fontSize: typography.size.xs, marginTop: spacing.xs },
  barTrack: { height: 10, borderRadius: radius.pill, backgroundColor: colors.border, marginTop: spacing.sm, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.primary },
  deptRow: { marginBottom: spacing.md },
  deptRowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  deptName: { color: colors.textPrimary, fontSize: typography.size.sm, fontWeight: typography.weight.medium, flex: 1, marginRight: spacing.sm },
  deptPct: { color: colors.primaryDark, fontSize: typography.size.sm, fontWeight: typography.weight.bold },
  groupLabel: { color: colors.primaryDark, fontSize: typography.size.xs, fontWeight: typography.weight.bold, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.md, marginBottom: spacing.xs },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs / 2 },
  statusLabel: { color: colors.textSecondary, fontSize: typography.size.sm },
  statusCount: { color: colors.textPrimary, fontSize: typography.size.sm, fontWeight: typography.weight.medium },
});
