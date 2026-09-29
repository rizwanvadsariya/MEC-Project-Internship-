/**
 * Physical vs. financial progress reconciliation (phases.md Step 27) — compares
 * physicalProgressPct (the app's own MEO-reported rollup, Step 23) against
 * financialProgressPct (the ADP booklet's own figure, never written by the
 * app) per scheme, division-scoped, RD/DG only. Worst-divergence-first list,
 * same cursor-paginated FlatList pattern as AuditTrailScreen/NotificationsScreen.
 * Dependency-free (no chart library), matching AnalyticsScreen's own
 * established precedent for this project.
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/useAuth';
import { getProgressReconciliation, type ReconciliationRow } from '../../api/dashboard.api';
import { colors, radius, spacing, typography } from '../../theme';

function gapColor(gap: number, thresholdPct: number): string {
	if (Math.abs(gap) >= thresholdPct) return colors.error;
	if (Math.abs(gap) >= thresholdPct / 2) return colors.warning;
	return colors.success;
}

function formatPct(value: number): string {
	return `${Math.round(value)}%`;
}

export default function ProgressReconciliationScreen() {
	const { t } = useTranslation();
	const { accessToken } = useAuth();
	const [flaggedOnly, setFlaggedOnly] = useState(false);
	const [rows, setRows] = useState<ReconciliationRow[]>([]);
	const [summary, setSummary] = useState<{ schemesTotal: number; schemesWithBothValues: number; schemesFlagged: number; flagThresholdPct: number } | null>(null);
	const [nextCursor, setNextCursor] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [loadingMore, setLoadingMore] = useState(false);
	const [error, setError] = useState('');

	const load = useCallback(async (onlyFlagged: boolean) => {
		if (!accessToken) return;
		setLoading(true);
		try {
			const result = await getProgressReconciliation(accessToken, { flaggedOnly: onlyFlagged });
			setRows(result.rows);
			setNextCursor(result.nextCursor);
			setSummary({
				schemesTotal: result.schemesTotal,
				schemesWithBothValues: result.schemesWithBothValues,
				schemesFlagged: result.schemesFlagged,
				flagThresholdPct: result.flagThresholdPct,
			});
			setError('');
		} catch (err) {
			setError(err instanceof Error ? err.message : t('reconciliation.couldNotLoad'));
		} finally {
			setLoading(false);
		}
	}, [accessToken, t]);

	useFocusEffect(
		useCallback(() => {
			const timer = setTimeout(() => { void load(flaggedOnly); }, 0);
			return () => clearTimeout(timer);
		}, [load, flaggedOnly]),
	);

	const loadMore = async () => {
		if (!accessToken || !nextCursor || loadingMore) return;
		setLoadingMore(true);
		try {
			const result = await getProgressReconciliation(accessToken, { flaggedOnly, cursor: nextCursor });
			setRows((prev) => [...prev, ...result.rows]);
			setNextCursor(result.nextCursor);
		} catch (err) {
			setError(err instanceof Error ? err.message : t('reconciliation.couldNotLoadMore'));
		} finally {
			setLoadingMore(false);
		}
	};

	return (
		<View style={styles.container}>
			<View style={styles.header}>
				<Text style={styles.title}>{t('reconciliation.title')}</Text>
				<Text style={styles.subtitle}>{t('reconciliation.subtitle')}</Text>
			</View>

			{summary ? (
				<View style={styles.summaryCard}>
					<Text style={styles.summaryText}>
						{t('reconciliation.coverage', { withBoth: summary.schemesWithBothValues, total: summary.schemesTotal })}
					</Text>
					<Text style={styles.summaryText}>
						{t('reconciliation.flaggedCount', { count: summary.schemesFlagged, threshold: summary.flagThresholdPct })}
					</Text>
				</View>
			) : null}

			<View style={styles.filterRow}>
				<Pressable
					style={[styles.filterChip, !flaggedOnly && styles.filterChipActive]}
					onPress={() => setFlaggedOnly(false)}
				>
					<Text style={[styles.filterChipText, !flaggedOnly && styles.filterChipTextActive]}>{t('reconciliation.filter.all')}</Text>
				</Pressable>
				<Pressable
					style={[styles.filterChip, flaggedOnly && styles.filterChipActive]}
					onPress={() => setFlaggedOnly(true)}
				>
					<Text style={[styles.filterChipText, flaggedOnly && styles.filterChipTextActive]}>{t('reconciliation.filter.flaggedOnly')}</Text>
				</Pressable>
			</View>

			{error ? <Text style={styles.error}>{error}</Text> : null}
			{loading && !rows.length ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
			{!loading && !rows.length ? <Text style={styles.empty}>{t('reconciliation.noSchemesYet')}</Text> : null}

			<FlatList
				data={rows}
				keyExtractor={(item) => String(item.id)}
				contentContainerStyle={styles.list}
				onEndReachedThreshold={0.4}
				onEndReached={loadMore}
				ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
				renderItem={({ item }) => <ReconciliationCard item={item} thresholdPct={summary?.flagThresholdPct ?? 25} />}
			/>
		</View>
	);
}

function ReconciliationCard({ item, thresholdPct }: { item: ReconciliationRow; thresholdPct: number }) {
	const { t } = useTranslation();
	const color = gapColor(item.gap, thresholdPct);
	const direction = item.gap >= 0 ? t('reconciliation.financialAhead') : t('reconciliation.physicalAhead');
	return (
		<View style={styles.card}>
			<View style={styles.cardHeader}>
				<Text style={styles.schemeName} numberOfLines={1}>{item.name}</Text>
				<View style={[styles.gapBadge, { backgroundColor: color }]}>
					<Text style={styles.gapBadgeText}>{formatPct(Math.abs(item.gap))}</Text>
				</View>
			</View>
			<Text style={styles.departmentName}>{item.departmentName} · {item.uid}</Text>

			<View style={styles.pctRow}>
				<View style={styles.pctColumn}>
					<Text style={styles.pctLabel}>{t('reconciliation.physical')}</Text>
					<Text style={styles.pctValue}>{formatPct(item.physicalProgressPct)}</Text>
				</View>
				<View style={styles.pctColumn}>
					<Text style={styles.pctLabel}>{t('reconciliation.financial')}</Text>
					<Text style={styles.pctValue}>{formatPct(item.financialProgressPct)}</Text>
				</View>
			</View>

			<Text style={[styles.direction, { color }]}>{direction}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
	header: { marginBottom: spacing.md },
	title: { color: colors.textPrimary, fontSize: typography.size.xxl, fontWeight: typography.weight.bold },
	subtitle: { color: colors.textSecondary, fontSize: typography.size.sm, lineHeight: typography.lineHeight.md, marginTop: spacing.sm },
	summaryCard: {
		backgroundColor: colors.surface,
		borderRadius: radius.lg,
		borderWidth: 1,
		borderColor: colors.border,
		padding: spacing.md,
		marginBottom: spacing.md,
	},
	summaryText: { color: colors.textSecondary, fontSize: typography.size.xs, marginTop: spacing.xs / 2 },
	filterRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md },
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
	gapBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
	gapBadgeText: { color: colors.white, fontSize: typography.size.xs, fontWeight: typography.weight.bold },
	departmentName: { color: colors.textSecondary, fontSize: typography.size.xs, marginTop: spacing.xs / 2 },
	pctRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm },
	pctColumn: { flex: 1 },
	pctLabel: { color: colors.textSecondary, fontSize: typography.size.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
	pctValue: { color: colors.textPrimary, fontSize: typography.size.md, fontWeight: typography.weight.bold, marginTop: 2 },
	direction: { fontSize: typography.size.xs, fontWeight: typography.weight.medium, marginTop: spacing.sm },
});
