/**
 * Delay/anomaly detection (phases.md Step 31 — "no visit in X months,
 * spend-without-progress patterns") and predictive risk flagging (Step 33 —
 * "schemes likely to miss target completion date," which "builds directly
 * on the anomaly-detection foundation" and so lives as a third section on
 * this same screen/endpoint rather than a parallel one). RD/DG only,
 * division-scoped — same access as Analytics/Audit trail/Progress
 * reconciliation (Steps 23/26/27), an oversight view, not a write path.
 *
 * phases.md's own dependency note for Step 31: "needs a real accumulated
 * visit history over time — this can't be built (or validated) on day-one
 * data." On a fresh/early-stage division this screen will legitimately show
 * most/all schemes as "no recent visit," and very few (if any) schemes
 * eligible for risk flagging at all (Step 33 also needs a real
 * `physical_progress_pct`, the same app-written rollup the ADP import never
 * populates) — that's an honest reflection of a sparse visit history, not a
 * bug. Every threshold (`noVisitThresholdMonths`, `spendWithoutProgressThresholds`,
 * `riskGapThresholdPct`) is the backend's own documented judgment call,
 * surfaced here so the numbers on screen are never a mystery.
 *
 * Dependency-free, no FlatList virtualization — every list is capped
 * server-side (50 by default) specifically because these are short
 * "flagged problem" lists meant to be scanned in one screen, not a full
 * browse view, so a plain `.map()` inside one ScrollView is enough (the
 * same primitive-rendering approach AnalyticsScreen/ProgressReconciliation
 * already use).
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useAuth } from '../../auth/useAuth';
import {
	getAnomalies,
	type AnomaliesSummary,
	type AtRiskRow,
	type NoRecentVisitRow,
	type SpendWithoutProgressRow,
} from '../../api/dashboard.api';
import { formatRelativeTime } from '../../utils/dateTime';
import { colors, radius, spacing, typography } from '../../theme';

/** The source only ever gives a month+year target (schema.md §4.1) — shown
 *  as "June 2027", never a specific day, so the display never implies a
 *  precision the data doesn't actually have. */
function formatTargetMonth(isoDate: string): string {
	return new Date(isoDate).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export default function AnomaliesScreen() {
	const { t } = useTranslation();
	const { accessToken } = useAuth();
	const navigation = useNavigation<{ navigate: (screen: string, params?: Record<string, number>) => void }>();

	const [summary, setSummary] = useState<AnomaliesSummary | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');

	const load = useCallback(async () => {
		if (!accessToken) return;
		setLoading(true);
		try {
			setSummary(await getAnomalies(accessToken));
			setError('');
		} catch (err) {
			setError(err instanceof Error ? err.message : t('anomalies.couldNotLoad'));
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

	const openScheme = (schemeId: number) => navigation.navigate('SchemeDetail', { schemeId });

	if (loading && !summary) {
		return (
			<View style={styles.centered}>
				<ActivityIndicator color={colors.primary} />
			</View>
		);
	}

	return (
		<ScrollView contentContainerStyle={styles.container}>
			<Text style={styles.title}>{t('anomalies.title')}</Text>
			<Text style={styles.subtitle}>{t('anomalies.subtitle')}</Text>

			{error ? <Text style={styles.error}>{error}</Text> : null}

			{summary ? (
				<>
					<NoRecentVisitSection summary={summary} t={t} onViewScheme={openScheme} />
					<SpendWithoutProgressSection summary={summary} t={t} onViewScheme={openScheme} />
					<AtRiskSection summary={summary} t={t} onViewScheme={openScheme} />
				</>
			) : null}
		</ScrollView>
	);
}

function NoRecentVisitSection({
	summary,
	t,
	onViewScheme,
}: {
	summary: AnomaliesSummary;
	t: TFunction;
	onViewScheme: (schemeId: number) => void;
}) {
	const { total, rows } = summary.noRecentVisit;
	return (
		<View style={styles.card}>
			<Text style={styles.sectionHeader}>{t('anomalies.noRecentVisit.title')}</Text>
			<Text style={styles.sectionContext}>
				{t('anomalies.noRecentVisit.thresholdContext', { months: summary.noVisitThresholdMonths })}
			</Text>
			<Text style={styles.totalFlagged}>{t('anomalies.totalFlagged', { count: total })}</Text>

			{rows.length === 0 ? (
				<Text style={styles.empty}>{t('anomalies.noneFlagged')}</Text>
			) : (
				rows.map((row) => <NoRecentVisitCard key={row.id} row={row} t={t} onPress={() => onViewScheme(row.id)} />)
			)}
		</View>
	);
}

function NoRecentVisitCard({ row, t, onPress }: { row: NoRecentVisitRow; t: TFunction; onPress: () => void }) {
	return (
		<Pressable style={styles.row} onPress={onPress}>
			<View style={styles.rowText}>
				<Text style={styles.rowName} numberOfLines={1}>{row.name}</Text>
				<Text style={styles.rowMeta}>{row.departmentName} · {row.uid}</Text>
				<Text style={styles.rowDetail}>
					{row.lastVisitDate === null ? t('anomalies.neverVisited') : t('anomalies.lastVisit', { time: formatRelativeTime(row.lastVisitDate, t) })}
				</Text>
			</View>
			<Text style={styles.rowChevron}>{'>'}</Text>
		</Pressable>
	);
}

function SpendWithoutProgressSection({
	summary,
	t,
	onViewScheme,
}: {
	summary: AnomaliesSummary;
	t: TFunction;
	onViewScheme: (schemeId: number) => void;
}) {
	const { total, rows } = summary.spendWithoutProgress;
	const { financialMinPct, physicalMaxPct } = summary.spendWithoutProgressThresholds;
	return (
		<View style={styles.card}>
			<Text style={styles.sectionHeader}>{t('anomalies.spendWithoutProgress.title')}</Text>
			<Text style={styles.sectionContext}>
				{t('anomalies.spendWithoutProgress.thresholdContext', { financialMinPct, physicalMaxPct })}
			</Text>
			<Text style={styles.totalFlagged}>{t('anomalies.totalFlagged', { count: total })}</Text>

			{rows.length === 0 ? (
				<Text style={styles.empty}>{t('anomalies.noneFlagged')}</Text>
			) : (
				rows.map((row) => <SpendWithoutProgressCard key={row.id} row={row} t={t} onPress={() => onViewScheme(row.id)} />)
			)}
		</View>
	);
}

function SpendWithoutProgressCard({ row, t, onPress }: { row: SpendWithoutProgressRow; t: TFunction; onPress: () => void }) {
	return (
		<Pressable style={styles.row} onPress={onPress}>
			<View style={styles.rowText}>
				<Text style={styles.rowName} numberOfLines={1}>{row.name}</Text>
				<Text style={styles.rowMeta}>{row.departmentName} · {row.uid}</Text>
				<Text style={styles.rowDetail}>
					{t('anomalies.spendWithoutProgress.progressPair', { physical: Math.round(row.physicalProgressPct), financial: Math.round(row.financialProgressPct) })}
				</Text>
			</View>
			<Text style={styles.rowChevron}>{'>'}</Text>
		</Pressable>
	);
}

function AtRiskSection({
	summary,
	t,
	onViewScheme,
}: {
	summary: AnomaliesSummary;
	t: TFunction;
	onViewScheme: (schemeId: number) => void;
}) {
	const { total, rows } = summary.atRiskOfMissingTarget;
	return (
		<View style={styles.card}>
			<Text style={styles.sectionHeader}>{t('anomalies.atRisk.title')}</Text>
			<Text style={styles.sectionContext}>
				{t('anomalies.atRisk.thresholdContext', { gapPct: summary.riskGapThresholdPct })}
			</Text>
			<Text style={styles.totalFlagged}>{t('anomalies.totalFlagged', { count: total })}</Text>

			{rows.length === 0 ? (
				<Text style={styles.empty}>{t('anomalies.noneFlagged')}</Text>
			) : (
				rows.map((row) => <AtRiskCard key={row.id} row={row} t={t} onPress={() => onViewScheme(row.id)} />)
			)}
		</View>
	);
}

function AtRiskCard({ row, t, onPress }: { row: AtRiskRow; t: TFunction; onPress: () => void }) {
	return (
		<Pressable style={styles.row} onPress={onPress}>
			<View style={styles.rowText}>
				<Text style={styles.rowName} numberOfLines={1}>{row.name}</Text>
				<Text style={styles.rowMeta}>{row.departmentName} · {row.uid}</Text>
				<Text style={styles.rowDetail}>
					{row.isOverdue
						? t('anomalies.atRisk.overdue', { targetMonth: formatTargetMonth(row.targetDate) })
						: t('anomalies.atRisk.behindPace', {
							targetMonth: formatTargetMonth(row.targetDate),
							expected: Math.round(row.expectedProgressPct),
							actual: Math.round(row.physicalProgressPct),
						})}
				</Text>
			</View>
			<Text style={styles.rowChevron}>{'>'}</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	container: { flexGrow: 1, padding: spacing.lg, backgroundColor: colors.background, paddingBottom: spacing.xxl },
	centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
	title: { color: colors.textPrimary, fontSize: typography.size.xxl, fontWeight: typography.weight.bold },
	subtitle: { color: colors.textSecondary, fontSize: typography.size.sm, lineHeight: typography.lineHeight.md, marginTop: spacing.xs, marginBottom: spacing.md },
	error: { color: colors.error, lineHeight: typography.lineHeight.md, marginBottom: spacing.sm },
	card: {
		backgroundColor: colors.surface,
		borderRadius: radius.lg,
		borderWidth: 1,
		borderColor: colors.border,
		padding: spacing.md,
		marginBottom: spacing.md,
	},
	sectionHeader: { color: colors.textPrimary, fontSize: typography.size.md, fontWeight: typography.weight.bold },
	sectionContext: { color: colors.textSecondary, fontSize: typography.size.xs, marginTop: spacing.xs },
	totalFlagged: { color: colors.error, fontSize: typography.size.sm, fontWeight: typography.weight.bold, marginTop: spacing.sm, marginBottom: spacing.sm },
	empty: { color: colors.textSecondary, fontSize: typography.size.sm, textAlign: 'center', paddingVertical: spacing.md },
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingVertical: spacing.sm,
		borderTopWidth: 1,
		borderTopColor: colors.border,
	},
	rowText: { flex: 1 },
	rowName: { color: colors.textPrimary, fontSize: typography.size.sm, fontWeight: typography.weight.bold },
	rowMeta: { color: colors.textSecondary, fontSize: typography.size.xs, marginTop: 2 },
	rowDetail: { color: colors.error, fontSize: typography.size.xs, fontWeight: typography.weight.medium, marginTop: 2 },
	rowChevron: { color: colors.textSecondary, fontSize: typography.size.md, marginLeft: spacing.sm },
});
