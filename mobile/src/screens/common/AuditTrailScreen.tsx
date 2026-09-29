/**
 * Full audit trail (phases.md Step 26) — surfaces the team_approval_requests
 * history that's existed since Step 9 (submit/reject/resubmit/approve), which
 * until now only ever showed as the still-PENDING queue (ApprovalQueueScreen).
 * RD/DG both, division-scoped, same as GET /api/v1/approvals/history.
 * Cursor-paginated FlatList, same pattern as NotificationsScreen.
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/useAuth';
import { listApprovalHistory, type ApprovalHistoryEntry } from '../../api/approvals.api';
import { formatExactDateTime, formatRelativeTime } from '../../utils/dateTime';
import { colors, radius, spacing, typography } from '../../theme';

type DecisionFilter = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED';
const FILTERS: DecisionFilter[] = ['ALL', 'PENDING', 'APPROVED', 'REJECTED'];

function decisionColor(decision: ApprovalHistoryEntry['decision']): string {
	if (decision === 'APPROVED') return colors.success;
	if (decision === 'REJECTED') return colors.error;
	return colors.warning;
}

export default function AuditTrailScreen() {
	const { t } = useTranslation();
	const { accessToken } = useAuth();
	const [filter, setFilter] = useState<DecisionFilter>('ALL');
	const [items, setItems] = useState<ApprovalHistoryEntry[]>([]);
	const [nextCursor, setNextCursor] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [loadingMore, setLoadingMore] = useState(false);
	const [error, setError] = useState('');

	const load = useCallback(async (activeFilter: DecisionFilter) => {
		if (!accessToken) return;
		setLoading(true);
		try {
			const result = await listApprovalHistory(accessToken, {
				decision: activeFilter === 'ALL' ? undefined : activeFilter,
			});
			setItems(result.items);
			setNextCursor(result.nextCursor);
			setError('');
		} catch (err) {
			setError(err instanceof Error ? err.message : t('auditTrail.couldNotLoad'));
		} finally {
			setLoading(false);
		}
	}, [accessToken, t]);

	useFocusEffect(
		useCallback(() => {
			const timer = setTimeout(() => { void load(filter); }, 0);
			return () => clearTimeout(timer);
		}, [load, filter]),
	);

	const loadMore = async () => {
		if (!accessToken || !nextCursor || loadingMore) return;
		setLoadingMore(true);
		try {
			const result = await listApprovalHistory(accessToken, {
				decision: filter === 'ALL' ? undefined : filter,
				cursor: nextCursor,
			});
			setItems((prev) => [...prev, ...result.items]);
			setNextCursor(result.nextCursor);
		} catch (err) {
			setError(err instanceof Error ? err.message : t('auditTrail.couldNotLoadMore'));
		} finally {
			setLoadingMore(false);
		}
	};

	return (
		<View style={styles.container}>
			<View style={styles.header}>
				<Text style={styles.title}>{t('auditTrail.title')}</Text>
				<Text style={styles.subtitle}>{t('auditTrail.subtitle')}</Text>
			</View>

			<View style={styles.filterRow}>
				{FILTERS.map((option) => (
					<Pressable
						key={option}
						style={[styles.filterChip, filter === option && styles.filterChipActive]}
						onPress={() => setFilter(option)}
					>
						<Text style={[styles.filterChipText, filter === option && styles.filterChipTextActive]}>
							{t(`auditTrail.filter.${option}`)}
						</Text>
					</Pressable>
				))}
			</View>

			{error ? <Text style={styles.error}>{error}</Text> : null}
			{loading && !items.length ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
			{!loading && !items.length ? <Text style={styles.empty}>{t('auditTrail.noHistoryYet')}</Text> : null}

			<FlatList
				data={items}
				keyExtractor={(item) => item.requestId}
				contentContainerStyle={styles.list}
				onEndReachedThreshold={0.4}
				onEndReached={loadMore}
				ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
				renderItem={({ item }) => <AuditTrailCard item={item} />}
			/>
		</View>
	);
}

function AuditTrailCard({ item }: { item: ApprovalHistoryEntry }) {
	const { t } = useTranslation();
	return (
		<View style={styles.card}>
			<View style={styles.cardHeader}>
				<Text style={styles.schemeName} numberOfLines={1}>{item.schemeName}</Text>
				<View style={[styles.decisionBadge, { backgroundColor: decisionColor(item.decision) }]}>
					<Text style={styles.decisionBadgeText}>{t(`auditTrail.decision.${item.decision}`)}</Text>
				</View>
			</View>
			<Text style={styles.versionLabel}>{t('auditTrail.version', { version: item.teamVersion })}</Text>

			<View style={styles.metaRow}>
				<Text style={styles.metaLabel}>{t('auditTrail.submittedBy', { name: item.submittedByName })}</Text>
				<Text style={styles.metaTime}>{formatExactDateTime(item.submittedAt)} · {formatRelativeTime(item.submittedAt, t)}</Text>
			</View>

			{item.decision !== 'PENDING' && item.reviewedByName ? (
				<View style={styles.metaRow}>
					<Text style={styles.metaLabel}>
						{t(item.decision === 'APPROVED' ? 'auditTrail.approvedBy' : 'auditTrail.rejectedBy', { name: item.reviewedByName })}
					</Text>
					<Text style={styles.metaTime}>{item.reviewedAt ? `${formatExactDateTime(item.reviewedAt)} · ${formatRelativeTime(item.reviewedAt, t)}` : ''}</Text>
				</View>
			) : null}

			{item.remarks ? (
				<View style={styles.remarksBox}>
					<Text style={styles.remarksLabel}>{t('auditTrail.remarks')}</Text>
					<Text style={styles.remarksText}>{item.remarks}</Text>
				</View>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
	header: { marginBottom: spacing.md },
	title: { color: colors.textPrimary, fontSize: typography.size.xxl, fontWeight: typography.weight.bold },
	subtitle: { color: colors.textSecondary, fontSize: typography.size.sm, lineHeight: typography.lineHeight.md, marginTop: spacing.sm },
	filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
	filterChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
	filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
	filterChipText: { color: colors.textSecondary, fontSize: typography.size.xs, fontWeight: typography.weight.medium },
	filterChipTextActive: { color: colors.white },
	error: { color: colors.error, lineHeight: typography.lineHeight.md, marginBottom: spacing.sm },
	loader: { margin: spacing.xl },
	empty: { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },
	list: { paddingBottom: spacing.xl },
	card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
	cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
	schemeName: { flex: 1, color: colors.textPrimary, fontSize: typography.size.md, fontWeight: typography.weight.bold },
	decisionBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
	decisionBadgeText: { color: colors.white, fontSize: typography.size.xs, fontWeight: typography.weight.bold },
	versionLabel: { color: colors.textSecondary, fontSize: typography.size.xs, marginTop: spacing.xs / 2 },
	metaRow: { marginTop: spacing.sm },
	metaLabel: { color: colors.textPrimary, fontSize: typography.size.sm },
	metaTime: { color: colors.textSecondary, fontSize: typography.size.xs, marginTop: 2 },
	remarksBox: { marginTop: spacing.sm, padding: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.background },
	remarksLabel: { color: colors.textSecondary, fontSize: typography.size.xs, fontWeight: typography.weight.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
	remarksText: { color: colors.textPrimary, fontSize: typography.size.sm, marginTop: 2, lineHeight: typography.lineHeight.md },
});
