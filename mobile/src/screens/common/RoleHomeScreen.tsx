import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
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

const ROLE_LABELS: Record<string, string> = {
  REGIONAL_DIRECTOR: 'Regional Director',
  DIRECTOR_GENERAL: 'Director General',
  MEO: 'Lead MEO',
  SUPPORT_USER: 'Support User',
};

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

function rdDashboard(dashboard: DivisionDashboard | null): DashboardConfig {
  const teams = dashboard?.teams.byStatus;
  const visits = dashboard?.visits.byStatus;
  return {
    eyebrow: 'Division workspace',
    title: 'Your monitoring overview',
    description: 'Assemble teams and keep field visits moving across your division.',
    metrics: [
      { label: 'Active teams', value: String(teams?.APPROVED ?? 0), tone: 'primary' },
      { label: 'Awaiting approval', value: String(teams?.PENDING_APPROVAL ?? 0), tone: 'warning' },
      { label: 'Upcoming visits', value: String(visits?.SCHEDULED ?? 0), tone: 'success' },
    ],
    emptyTitle: dashboard && dashboard.teams.total > 0 ? 'Division activity in progress' : 'No monitoring activity yet',
    emptyMessage: dashboard && dashboard.teams.total > 0
      ? `${dashboard.teams.total} team${dashboard.teams.total === 1 ? '' : 's'} tracked across ${dashboard.division.name}.`
      : 'Browse a scheme to create your first field monitoring team.',
    nextWorkspace: 'Next workspace: Scheme browser',
    nextRoute: 'Schemes',
  };
}

function dgDashboard(dashboard: DivisionDashboard | null): DashboardConfig {
  const teams = dashboard?.teams.byStatus;
  const visits = dashboard?.visits.byStatus;
  const activeVisits = (visits?.SCHEDULED ?? 0) + (visits?.IN_PROGRESS ?? 0);
  return {
    eyebrow: 'Division oversight',
    title: 'Your approval overview',
    description: 'Review proposed teams and track delivery across your division.',
    metrics: [
      { label: 'Pending approvals', value: String(teams?.PENDING_APPROVAL ?? 0), tone: 'warning' },
      { label: 'Active visits', value: String(activeVisits), tone: 'primary' },
      { label: 'Open issues', value: String(dashboard?.issues.open ?? 0), tone: 'success' },
    ],
    emptyTitle: teams && teams.PENDING_APPROVAL > 0 ? 'Teams awaiting your decision' : 'Approval queue is clear',
    emptyMessage: teams && teams.PENDING_APPROVAL > 0
      ? `${teams.PENDING_APPROVAL} team${teams.PENDING_APPROVAL === 1 ? '' : 's'} in ${dashboard?.division.name} need a decision.`
      : 'New team proposals will appear here when an RD submits them.',
    nextWorkspace: 'Next workspace: Approval queue',
    nextRoute: 'ApprovalQueue',
  };
}

function meoDashboard(dashboard: MemberDashboard | null): DashboardConfig {
  return {
    eyebrow: 'Fieldwork workspace',
    title: 'Your visit overview',
    description: 'See assigned work and keep field reports up to date.',
    metrics: [
      { label: 'Assigned visits', value: String(dashboard?.visits.total ?? 0), tone: 'primary' },
      { label: 'Forms due', value: String(dashboard?.formsDue ?? 0), tone: 'warning' },
      { label: 'Issues reported', value: String(dashboard?.issues.reportedByMe ?? 0), tone: 'success' },
    ],
    emptyTitle: dashboard && dashboard.visits.total > 0 ? 'Fieldwork in progress' : 'No visits assigned',
    emptyMessage: dashboard && dashboard.visits.total > 0
      ? `${dashboard.visits.total} visit${dashboard.visits.total === 1 ? '' : 's'} assigned to you, ${dashboard.formsDue} form${dashboard.formsDue === 1 ? '' : 's'} still due.`
      : 'Approved team assignments will appear here when you are added to a visit.',
    nextWorkspace: 'Next workspace: Assigned visits',
    nextRoute: 'SiteVisits',
  };
}

function supportDashboard(dashboard: MemberDashboard | null): DashboardConfig {
  const activeVisits = (dashboard?.visits.byStatus.SCHEDULED ?? 0) + (dashboard?.visits.byStatus.IN_PROGRESS ?? 0);
  const recentUpdates = (dashboard?.recentVisits.length ?? 0) + (dashboard?.recentIssues.length ?? 0);
  return {
    eyebrow: 'Read-only workspace',
    title: 'Monitoring at a glance',
    description: 'Follow scheme progress and visit activity without changing records.',
    metrics: [
      { label: 'Schemes monitored', value: String(dashboard?.schemesMonitored ?? 0), tone: 'primary' },
      { label: 'Active visits', value: String(activeVisits), tone: 'success' },
      { label: 'Recent updates', value: String(recentUpdates), tone: 'neutral' },
    ],
    emptyTitle: dashboard && dashboard.schemesMonitored > 0 ? 'Monitoring in progress' : 'Nothing to review yet',
    emptyMessage: dashboard && dashboard.schemesMonitored > 0
      ? `${dashboard.schemesMonitored} scheme${dashboard.schemesMonitored === 1 ? '' : 's'} being tracked through your team assignments.`
      : 'Scheme and visit updates will appear here as monitoring work begins.',
    nextWorkspace: 'Next workspace: Scheme browser',
    nextRoute: 'Schemes',
  };
}

export default function RoleHomeScreen() {
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
      setDashboardError(err instanceof Error ? err.message : 'Could not load your activity.');
    } finally {
      setLoadingDashboard(false);
    }
  }, [accessToken, hasLiveDashboard, isDivisionScoped]);

  useFocusEffect(
    useCallback(() => {
      const timer = setTimeout(() => { void loadDashboard(); }, 0);
      return () => clearTimeout(timer);
    }, [loadDashboard]),
  );

  if (!user) return null;

  const dashboardConfig = user.role === 'REGIONAL_DIRECTOR'
    ? rdDashboard(divisionDashboard)
    : user.role === 'DIRECTOR_GENERAL'
      ? dgDashboard(divisionDashboard)
      : user.role === 'MEO'
        ? meoDashboard(memberDashboard)
        : supportDashboard(memberDashboard);

  const recentVisits = divisionDashboard?.recentVisits ?? memberDashboard?.recentVisits ?? [];
  const recentIssues = divisionDashboard?.recentIssues ?? memberDashboard?.recentIssues ?? [];
  const activityTitle = isDivisionScoped ? 'Recent division activity' : 'Recent activity on your visits';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.intro}>
        <Text style={styles.eyebrow}>{dashboardConfig.eyebrow}</Text>
        <Text style={styles.welcome}>Welcome back,</Text>
        <Text style={styles.name}>{user.fullName}</Text>
        <Text style={styles.description}>{dashboardConfig.description}</Text>
      </View>

      <View style={styles.metrics}>
        {dashboardConfig.metrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} loading={hasLiveDashboard && loadingDashboard} />
        ))}
      </View>

      {hasLiveDashboard && dashboardError ? <Text style={styles.error}>{dashboardError}</Text> : null}

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
          <Text style={styles.profileLabel}>Signed in as</Text>
          <Text style={styles.profileRole}>{ROLE_LABELS[user.role] ?? user.role}</Text>
          <Text style={styles.profileEmail}>{user.email}</Text>
        </View>
        <Text style={styles.divisionText}>
          {divisionDashboard?.division.name ?? (user.divisionId != null ? `Division ${user.divisionId}` : 'Province-wide access')}
        </Text>
      </View>

      <Pressable style={styles.securityButton} onPress={() => navigation.navigate('SiteVisits')}>
        <Text style={styles.securityButtonText}>Site visits</Text>
      </Pressable>
      <Pressable style={styles.securityButton} onPress={() => navigation.navigate('Notifications')}>
        <Text style={styles.securityButtonText}>Notifications</Text>
      </Pressable>
      <Pressable style={styles.securityButton} onPress={() => navigation.navigate('Security')}>
        <Text style={styles.securityButtonText}>Security settings</Text>
      </Pressable>
      <Pressable style={styles.logout} onPress={signOut}>
        <Text style={styles.logoutText}>Log out</Text>
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
  return (
    <View style={styles.activityCard}>
      <Text style={styles.activityTitle}>{title}</Text>
      {recentVisits.slice(0, 3).map((visit) => (
        <Pressable key={visit.id} style={styles.activityRow} onPress={onOpenVisit}>
          <View style={styles.activityDot} />
          <View style={styles.activityRowText}>
            <Text style={styles.activityPrimary}>{visit.schemeName}</Text>
            <Text style={styles.activitySecondary}>{visit.schemeUid} · {visit.status}</Text>
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
