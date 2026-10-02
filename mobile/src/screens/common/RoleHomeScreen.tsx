import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useAuth } from '../../auth/useAuth';
import {
  getDivisionDashboard,
  getMemberDashboard,
  type DivisionDashboard,
  type MemberDashboard,
  type RecentVisit,
  type RecentIssue,
} from '../../api/dashboard.api';
import { colors, radius, spacing, typography } from '../../theme';

const DIVISION_SCOPED_ROLES = new Set(['REGIONAL_DIRECTOR', 'DIRECTOR_GENERAL']);
const MEMBER_SCOPED_ROLES = new Set(['MEO', 'SUPPORT_USER']);

type Metric = {
  label: string;
  value: string;
  tone: 'primary' | 'warning' | 'success' | 'neutral';
};

type DashboardConfig = {
  eyebrow: string;
  title: string;
  description: string;
  metrics: Metric[];
  emptyTitle: string;
  emptyMessage: string;
  nextWorkspace: string;
  nextRoute: string;
};

function rdDashboard(dashboard: DivisionDashboard | null, t: TFunction): DashboardConfig {
  const teams = dashboard?.teams.byStatus;
  const visits = dashboard?.visits.byStatus;
  return {
    eyebrow: t('roleHome.eyebrow.rd'),
    title: t('roleHome.title.rd'),
    description: t('roleHome.description.rd'),
    metrics: [
      { label: t('roleHome.metrics.activeTeams'), value: String(teams?.APPROVED ?? 0), tone: 'primary' },
      { label: t('roleHome.metrics.awaitingApproval'), value: String(teams?.PENDING_APPROVAL ?? 0), tone: 'warning' },
      { label: t('roleHome.metrics.upcomingVisits'), value: String(visits?.SCHEDULED ?? 0), tone: 'success' },
    ],
    emptyTitle: dashboard && dashboard.teams.total > 0 ? t('roleHome.empty.rd.titleActive') : t('roleHome.empty.rd.titleNone'),
    emptyMessage: dashboard && dashboard.teams.total > 0
      ? t('roleHome.empty.rd.messageActive', { count: dashboard.teams.total, division: dashboard.division.name })
      : t('roleHome.empty.rd.messageNone'),
    nextWorkspace: t('roleHome.nextWorkspace.schemes'),
    nextRoute: 'Schemes',
  };
}

function dgDashboard(dashboard: DivisionDashboard | null, t: TFunction): DashboardConfig {
  const teams = dashboard?.teams.byStatus;
  const visits = dashboard?.visits.byStatus;
  const activeVisits = (visits?.SCHEDULED ?? 0) + (visits?.IN_PROGRESS ?? 0);
  return {
    eyebrow: t('roleHome.eyebrow.dg'),
    title: t('roleHome.title.dg'),
    description: t('roleHome.description.dg'),
    metrics: [
      { label: t('roleHome.metrics.pendingApprovals'), value: String(teams?.PENDING_APPROVAL ?? 0), tone: 'warning' },
      { label: t('roleHome.metrics.activeVisits'), value: String(activeVisits), tone: 'primary' },
      { label: t('roleHome.metrics.openIssues'), value: String(dashboard?.issues.open ?? 0), tone: 'success' },
    ],
    emptyTitle: teams && teams.PENDING_APPROVAL > 0 ? t('roleHome.empty.dg.titleActive') : t('roleHome.empty.dg.titleNone'),
    emptyMessage: teams && teams.PENDING_APPROVAL > 0
      ? t('roleHome.empty.dg.messageActive', { count: teams.PENDING_APPROVAL, division: dashboard?.division.name })
      : t('roleHome.empty.dg.messageNone'),
    nextWorkspace: t('roleHome.nextWorkspace.approvalQueue'),
    nextRoute: 'ApprovalQueue',
  };
}

function meoDashboard(dashboard: MemberDashboard | null, t: TFunction): DashboardConfig {
  return {
    eyebrow: t('roleHome.eyebrow.meo'),
    title: t('roleHome.title.meo'),
    description: t('roleHome.description.meo'),
    metrics: [
      { label: t('roleHome.metrics.assignedVisits'), value: String(dashboard?.visits.total ?? 0), tone: 'primary' },
      { label: t('roleHome.metrics.formsDue'), value: String(dashboard?.formsDue ?? 0), tone: 'warning' },
      { label: t('roleHome.metrics.issuesReported'), value: String(dashboard?.issues.reportedByMe ?? 0), tone: 'success' },
    ],
    emptyTitle: dashboard && dashboard.visits.total > 0 ? t('roleHome.empty.meo.titleActive') : t('roleHome.empty.meo.titleNone'),
    emptyMessage: dashboard && dashboard.visits.total > 0
      ? t('roleHome.empty.meo.messageActive', { visitCount: dashboard.visits.total, formCount: dashboard.formsDue })
      : t('roleHome.empty.meo.messageNone'),
    nextWorkspace: t('roleHome.nextWorkspace.assignedVisits'),
    nextRoute: 'SiteVisits',
  };
}

function supportDashboard(dashboard: MemberDashboard | null, t: TFunction): DashboardConfig {
  const activeVisits = (dashboard?.visits.byStatus.SCHEDULED ?? 0) + (dashboard?.visits.byStatus.IN_PROGRESS ?? 0);
  const recentUpdates = (dashboard?.recentVisits.length ?? 0) + (dashboard?.recentIssues.length ?? 0);
  return {
    eyebrow: t('roleHome.eyebrow.support'),
    title: t('roleHome.title.support'),
    description: t('roleHome.description.support'),
    metrics: [
      { label: t('roleHome.metrics.schemesMonitored'), value: String(dashboard?.schemesMonitored ?? 0), tone: 'primary' },
      { label: t('roleHome.metrics.activeVisits'), value: String(activeVisits), tone: 'success' },
      { label: t('roleHome.metrics.recentUpdates'), value: String(recentUpdates), tone: 'neutral' },
    ],
    emptyTitle: dashboard && dashboard.schemesMonitored > 0 ? t('roleHome.empty.support.titleActive') : t('roleHome.empty.support.titleNone'),
    emptyMessage: dashboard && dashboard.schemesMonitored > 0
      ? t('roleHome.empty.support.messageActive', { count: dashboard.schemesMonitored })
      : t('roleHome.empty.support.messageNone'),
    nextWorkspace: t('roleHome.nextWorkspace.schemes'),
    nextRoute: 'Schemes',
  };
}

export default function RoleHomeScreen() {
  const { t } = useTranslation();
  const { user, accessToken, signOut } = useAuth();
  const navigation = useNavigation<{ navigate: (screen: string) => void }>();
  const [divisionDashboard, setDivisionDashboard] = useState<DivisionDashboard | null>(null);
  const [memberDashboard, setMemberDashboard] = useState<MemberDashboard | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [dashboardError, setDashboardError] = useState('');

  const isDivisionScoped = !!user && DIVISION_SCOPED_ROLES.has(user.role);
  const isMemberScoped = !!user && MEMBER_SCOPED_ROLES.has(user.role);
  const hasLiveDashboard = isDivisionScoped || isMemberScoped;

  const loadDashboard = useCallback(async () => {
    if (!accessToken || !hasLiveDashboard) return;
    setLoadingDashboard(true);
    try {
      if (isDivisionScoped) {
        setDivisionDashboard(await getDivisionDashboard(accessToken));
      } else {
        setMemberDashboard(await getMemberDashboard(accessToken));
      }
      setDashboardError('');
    } catch (err) {
      setDashboardError(err instanceof Error ? err.message : t('roleHome.errorLoadActivity'));
    } finally {
      setLoadingDashboard(false);
    }
  }, [accessToken, hasLiveDashboard, isDivisionScoped, t]);

  useFocusEffect(
    useCallback(() => {
      const timer = setTimeout(() => { void loadDashboard(); }, 0);
      return () => clearTimeout(timer);
    }, [loadDashboard]),
  );

  if (!user) return null;

  const dashboardConfig = user.role === 'REGIONAL_DIRECTOR'
    ? rdDashboard(divisionDashboard, t)
    : user.role === 'DIRECTOR_GENERAL'
      ? dgDashboard(divisionDashboard, t)
      : user.role === 'MEO'
        ? meoDashboard(memberDashboard, t)
        : supportDashboard(memberDashboard, t);

  const recentVisits = divisionDashboard?.recentVisits ?? memberDashboard?.recentVisits ?? [];
  const recentIssues = divisionDashboard?.recentIssues ?? memberDashboard?.recentIssues ?? [];
  const activityTitle = isDivisionScoped ? t('roleHome.activityTitle.division') : t('roleHome.activityTitle.visits');
  const primaryAction = user.role === 'REGIONAL_DIRECTOR'
    ? { label: t('roleHome.primaryAction.rd'), route: 'Schemes' }
    : user.role === 'DIRECTOR_GENERAL'
      ? { label: t('roleHome.primaryAction.dg'), route: 'ApprovalQueue' }
      : null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.intro}>
        <Text style={styles.eyebrow}>{dashboardConfig.eyebrow}</Text>
        <Text style={styles.welcome}>{t('roleHome.welcomeBack')}</Text>
        <Text style={styles.name}>{user.fullName}</Text>
        <Text style={styles.description}>{dashboardConfig.description}</Text>
      </View>

      <View style={styles.metrics}>
        {dashboardConfig.metrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} loading={hasLiveDashboard && loadingDashboard} />
        ))}
      </View>

      {hasLiveDashboard && dashboardError ? <Text style={styles.error}>{dashboardError}</Text> : null}

      {primaryAction ? (
        <Pressable style={styles.assignTeamButton} onPress={() => navigation.navigate(primaryAction.route)}>
          <Text style={styles.assignTeamIcon}>+</Text>
          <Text style={styles.assignTeamButtonText}>{primaryAction.label}</Text>
        </Pressable>
      ) : null}

      {hasLiveDashboard && (recentVisits.length > 0 || recentIssues.length > 0) ? (
        <ActivityCard
          title={activityTitle}
          recentVisits={recentVisits}
          recentIssues={recentIssues}
          onOpenVisit={() => navigation.navigate('SiteVisits')}
        />
      ) : (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <Text style={styles.emptyIconText}>+</Text>
          </View>
          <Text style={styles.emptyTitle}>{dashboardConfig.emptyTitle}</Text>
          <Text style={styles.emptyMessage}>{dashboardConfig.emptyMessage}</Text>
          <Pressable onPress={() => navigation.navigate(dashboardConfig.nextRoute)}>
            <Text style={styles.nextWorkspace}>{dashboardConfig.nextWorkspace}</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.profileCard}>
        <View>
          <Text style={styles.profileLabel}>{t('roleHome.profile.signedInAs')}</Text>
          <Text style={styles.profileRole}>{t(`roleHome.roleLabel.${user.role}`, { defaultValue: user.role })}</Text>
          <Text style={styles.profileEmail}>{user.email}</Text>
        </View>
        <Text style={styles.divisionText}>
          {divisionDashboard?.division.name ?? (user.divisionId != null ? t('common.division', { id: user.divisionId }) : t('common.provinceWideAccess'))}
        </Text>
      </View>

      <Pressable style={styles.securityButton} onPress={() => navigation.navigate('KpiDashboard')}>
        <Text style={styles.securityButtonText}>{t('roleHome.buttons.kpiDashboard')}</Text>
      </Pressable>
      <Pressable style={styles.securityButton} onPress={() => navigation.navigate('SiteVisits')}>
        <Text style={styles.securityButtonText}>{t('roleHome.buttons.siteVisits')}</Text>
      </Pressable>
      <Pressable style={styles.securityButton} onPress={() => navigation.navigate('GisMap')}>
        <Text style={styles.securityButtonText}>{t('roleHome.buttons.gisMap')}</Text>
      </Pressable>
      {user.role === 'REGIONAL_DIRECTOR' || user.role === 'MEO' ? (
        <Pressable style={styles.securityButton} onPress={() => navigation.navigate('VisitCalendar')}>
          <Text style={styles.securityButtonText}>{t('roleHome.buttons.visitCalendar')}</Text>
        </Pressable>
      ) : null}
      {user.role === 'REGIONAL_DIRECTOR' || user.role === 'DIRECTOR_GENERAL' ? (
        <Pressable style={styles.securityButton} onPress={() => navigation.navigate('Analytics')}>
          <Text style={styles.securityButtonText}>{t('roleHome.buttons.analytics')}</Text>
        </Pressable>
      ) : null}
      {user.role === 'REGIONAL_DIRECTOR' || user.role === 'DIRECTOR_GENERAL' ? (
        <Pressable style={styles.securityButton} onPress={() => navigation.navigate('AuditTrail')}>
          <Text style={styles.securityButtonText}>{t('roleHome.buttons.auditTrail')}</Text>
        </Pressable>
      ) : null}
      {user.role === 'REGIONAL_DIRECTOR' || user.role === 'DIRECTOR_GENERAL' ? (
        <Pressable style={styles.securityButton} onPress={() => navigation.navigate('ProgressReconciliation')}>
          <Text style={styles.securityButtonText}>{t('roleHome.buttons.reconciliation')}</Text>
        </Pressable>
      ) : null}
      {user.role === 'REGIONAL_DIRECTOR' || user.role === 'DIRECTOR_GENERAL' ? (
        <Pressable style={styles.securityButton} onPress={() => navigation.navigate('Anomalies')}>
          <Text style={styles.securityButtonText}>{t('roleHome.buttons.anomalies')}</Text>
        </Pressable>
      ) : null}
      <Pressable style={styles.securityButton} onPress={() => navigation.navigate('Notifications')}>
        <Text style={styles.securityButtonText}>{t('roleHome.buttons.notifications')}</Text>
      </Pressable>
      <Pressable style={styles.securityButton} onPress={() => navigation.navigate('Security')}>
        <Text style={styles.securityButtonText}>{t('roleHome.buttons.security')}</Text>
      </Pressable>
      <Pressable style={styles.logout} onPress={signOut}>
        <Text style={styles.logoutText}>{t('roleHome.buttons.logOut')}</Text>
      </Pressable>
    </ScrollView>
  );
}

function MetricCard({ metric, loading }: { metric: Metric; loading: boolean }) {
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricDot, { backgroundColor: metricColor(metric.tone) }]} />
      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.metricLoader} />
      ) : (
        <Text style={styles.metricValue}>{metric.value}</Text>
      )}
      <Text style={styles.metricLabel}>{metric.label}</Text>
    </View>
  );
}

function ActivityCard({ title, recentVisits, recentIssues, onOpenVisit }: {
  title: string;
  recentVisits: RecentVisit[];
  recentIssues: RecentIssue[];
  onOpenVisit: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.activityCard}>
      <Text style={styles.activityTitle}>{title}</Text>
      {recentVisits.slice(0, 3).map((visit) => (
        <Pressable key={visit.id} style={styles.activityRow} onPress={onOpenVisit}>
          <View style={styles.activityDot} />
          <View style={styles.activityRowText}>
            <Text style={styles.activityPrimary}>{visit.schemeName}</Text>
            <Text style={styles.activitySecondary}>{visit.schemeUid} · {t(`siteVisits.status.${visit.status}`, { defaultValue: visit.status })}</Text>
          </View>
        </Pressable>
      ))}
      {recentIssues.slice(0, 3).map((issue) => (
        <Pressable key={issue.id} style={styles.activityRow} onPress={onOpenVisit}>
          <View style={[styles.activityDot, { backgroundColor: colors.warning }]} />
          <View style={styles.activityRowText}>
            <Text style={styles.activityPrimary}>{issue.issueType} · {issue.severity}</Text>
            <Text style={styles.activitySecondary}>{issue.schemeName}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function metricColor(tone: Metric['tone']) {
  if (tone === 'warning') return colors.warning;
  if (tone === 'success') return colors.success;
  if (tone === 'neutral') return colors.textSecondary;
  return colors.primary;
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: spacing.lg, backgroundColor: colors.background },
  intro: { marginBottom: spacing.lg },
  eyebrow: {
    color: colors.primaryDark,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  welcome: { color: colors.textSecondary, fontSize: typography.size.sm },
  name: {
    color: colors.textPrimary,
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    marginTop: spacing.xs,
  },
  description: {
    color: colors.textSecondary,
    fontSize: typography.size.md,
    lineHeight: typography.lineHeight.md,
    marginTop: spacing.sm,
  },
  metrics: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  metricCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 112,
  },
  metricDot: { width: 8, height: 8, borderRadius: radius.pill, marginBottom: spacing.md },
  metricValue: { color: colors.textPrimary, fontSize: typography.size.xl, fontWeight: typography.weight.bold },
  metricLoader: { alignSelf: 'flex-start' },
  metricLabel: { color: colors.textSecondary, fontSize: typography.size.xs, lineHeight: typography.lineHeight.sm, marginTop: spacing.xs },
  error: { color: colors.error, fontSize: typography.size.sm, lineHeight: typography.lineHeight.md, marginBottom: spacing.md },
  assignTeamButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  assignTeamIcon: { color: colors.white, fontSize: typography.size.lg, fontWeight: typography.weight.bold, marginRight: spacing.sm },
  assignTeamButtonText: { color: colors.white, fontSize: typography.size.sm, fontWeight: typography.weight.bold },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  emptyIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
    marginBottom: spacing.md,
  },
  emptyIconText: { color: colors.primaryDark, fontSize: typography.size.xl, fontWeight: typography.weight.regular },
  emptyTitle: { color: colors.textPrimary, fontSize: typography.size.lg, fontWeight: typography.weight.bold, textAlign: 'center' },
  emptyMessage: { color: colors.textSecondary, fontSize: typography.size.sm, lineHeight: typography.lineHeight.md, textAlign: 'center', marginTop: spacing.sm },
  nextWorkspace: { color: colors.primaryDark, fontSize: typography.size.xs, fontWeight: typography.weight.bold, marginTop: spacing.lg },
  activityCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  activityTitle: { color: colors.textPrimary, fontSize: typography.size.sm, fontWeight: typography.weight.bold, marginBottom: spacing.sm },
  activityRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs },
  activityDot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: colors.primary, marginRight: spacing.sm },
  activityRowText: { flex: 1 },
  activityPrimary: { color: colors.textPrimary, fontSize: typography.size.sm, fontWeight: typography.weight.medium },
  activitySecondary: { color: colors.textSecondary, fontSize: typography.size.xs, marginTop: 2 },
  profileCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: spacing.lg, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  profileLabel: { color: colors.textSecondary, fontSize: typography.size.xs },
  profileRole: { color: colors.textPrimary, fontSize: typography.size.sm, fontWeight: typography.weight.bold, marginTop: spacing.xs },
  profileEmail: { color: colors.textSecondary, fontSize: typography.size.xs, marginTop: spacing.xs },
  divisionText: { color: colors.primaryDark, fontSize: typography.size.xs, fontWeight: typography.weight.medium },
  securityButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
    paddingVertical: spacing.md - 4,
    alignItems: 'center',
  },
  securityButtonText: { color: colors.primaryDark, fontWeight: typography.weight.medium },
  logout: {
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    paddingVertical: spacing.md - 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.error,
  },
  logoutText: { color: colors.error, fontWeight: typography.weight.medium },
});
