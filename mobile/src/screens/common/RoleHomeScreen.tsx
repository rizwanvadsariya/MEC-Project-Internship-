import React from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../auth/useAuth';
import { colors, radius, spacing, typography } from '../../theme';

const ROLE_LABELS: Record<string, string> = {
  REGIONAL_DIRECTOR: 'Regional Director',
  DIRECTOR_GENERAL: 'Director General',
  MEO: 'Lead MEO',
  SUPPORT_USER: 'Support User',
};

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

const DASHBOARDS: Record<string, DashboardConfig> = {
  REGIONAL_DIRECTOR: {
    eyebrow: 'Division workspace',
    title: 'Your monitoring overview',
    description: 'Assemble teams and keep field visits moving across your division.',
    metrics: [
      { label: 'Active teams', value: '0', tone: 'primary' },
      { label: 'Awaiting approval', value: '0', tone: 'warning' },
      { label: 'Upcoming visits', value: '0', tone: 'success' },
    ],
    emptyTitle: 'No monitoring activity yet',
    emptyMessage: 'Browse a scheme to create your first field monitoring team.',
    nextWorkspace: 'Next workspace: Scheme browser',
    nextRoute: 'Schemes',
  },
  DIRECTOR_GENERAL: {
    eyebrow: 'Division oversight',
    title: 'Your approval overview',
    description: 'Review proposed teams and track delivery across your division.',
    metrics: [
      { label: 'Pending approvals', value: '0', tone: 'warning' },
      { label: 'Active visits', value: '0', tone: 'primary' },
      { label: 'Open issues', value: '0', tone: 'success' },
    ],
    emptyTitle: 'Approval queue is clear',
    emptyMessage: 'New team proposals will appear here when an RD submits them.',
    nextWorkspace: 'Next workspace: Approval queue',
    nextRoute: 'ApprovalQueue',
  },
  MEO: {
    eyebrow: 'Fieldwork workspace',
    title: 'Your visit overview',
    description: 'See assigned work and keep field reports up to date.',
    metrics: [
      { label: 'Assigned visits', value: '0', tone: 'primary' },
      { label: 'Forms due', value: '0', tone: 'warning' },
      { label: 'Issues reported', value: '0', tone: 'success' },
    ],
    emptyTitle: 'No visits assigned',
    emptyMessage: 'Approved team assignments will appear here when you are added to a visit.',
    nextWorkspace: 'Next workspace: Assigned visits',
    nextRoute: 'SiteVisits',
  },
  SUPPORT_USER: {
    eyebrow: 'Read-only workspace',
    title: 'Monitoring at a glance',
    description: 'Follow scheme progress and visit activity without changing records.',
    metrics: [
      { label: 'Schemes monitored', value: '0', tone: 'primary' },
      { label: 'Active visits', value: '0', tone: 'success' },
      { label: 'Recent updates', value: '0', tone: 'neutral' },
    ],
    emptyTitle: 'Nothing to review yet',
    emptyMessage: 'Scheme and visit updates will appear here as monitoring work begins.',
    nextWorkspace: 'Next workspace: Scheme browser',
    nextRoute: 'Schemes',
  },
};

export default function RoleHomeScreen() {
  const { user, signOut } = useAuth();
  const navigation = useNavigation<{ navigate: (screen: string) => void }>();
  if (!user) return null;
  const dashboard = DASHBOARDS[user.role] ?? DASHBOARDS.SUPPORT_USER;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.intro}>
        <Text style={styles.eyebrow}>{dashboard.eyebrow}</Text>
        <Text style={styles.welcome}>Welcome back,</Text>
        <Text style={styles.name}>{user.fullName}</Text>
        <Text style={styles.description}>{dashboard.description}</Text>
      </View>

      <View style={styles.metrics}>
        {dashboard.metrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </View>

      <View style={styles.emptyCard}>
        <View style={styles.emptyIcon}>
          <Text style={styles.emptyIconText}>+</Text>
        </View>
        <Text style={styles.emptyTitle}>{dashboard.emptyTitle}</Text>
        <Text style={styles.emptyMessage}>{dashboard.emptyMessage}</Text>
        <Pressable onPress={() => navigation.navigate(dashboard.nextRoute)}>
          <Text style={styles.nextWorkspace}>{dashboard.nextWorkspace}</Text>
        </Pressable>
      </View>

      <View style={styles.profileCard}>
        <View>
          <Text style={styles.profileLabel}>Signed in as</Text>
          <Text style={styles.profileRole}>{ROLE_LABELS[user.role] ?? user.role}</Text>
          <Text style={styles.profileEmail}>{user.email}</Text>
        </View>
        <Text style={styles.divisionText}>
          {user.divisionId != null ? `Division ${user.divisionId}` : 'Province-wide access'}
        </Text>
      </View>

      <Pressable style={styles.securityButton} onPress={() => navigation.navigate('SiteVisits')}>
        <Text style={styles.securityButtonText}>Site visits</Text>
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

function MetricCard({ metric }: { metric: Metric }) {
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricDot, { backgroundColor: metricColor(metric.tone) }]} />
      <Text style={styles.metricValue}>{metric.value}</Text>
      <Text style={styles.metricLabel}>{metric.label}</Text>
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
  metricLabel: { color: colors.textSecondary, fontSize: typography.size.xs, lineHeight: typography.lineHeight.sm, marginTop: spacing.xs },
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
