/**
 * Custom KPI dashboards per role (phases.md Step 34 — "same data model,
 * different scope: province vs. division"), explicitly framed by phases.md
 * as "the final layer — combines every analytics building block built so
 * far" (Steps 23/30/31/33). Open to every role — unlike Analytics/Audit
 * trail/Reconciliation/Anomalies (RD/DG only), this screen is role-aware
 * internally and has something real to show every role, the same reasoning
 * Step 30's GIS map already used for being open to everyone.
 *
 * Two layers, stacked on one screen, both reusing endpoints this app
 * already has (no new backend route for this step):
 *  - "Province overview" — every division's own progress figure, from the
 *    same province-wide `GET /schemes/map` data Step 30's map already
 *    colors by (open to every role).
 *  - A role-scoped layer: RD/DG get their own division's Step 23 dashboard
 *    numbers plus Step 31/33's anomaly/risk totals (`GET /dashboards/division`
 *    + `GET /dashboards/anomalies`); MEO/Support get their team-membership-
 *    scoped Step 16 numbers (`GET /dashboards/member`) — the closest thing
 *    those two roles have to "their own division," since neither has
 *    division-wide access anywhere else in this app either.
 * buildKpiDashboard.ts owns the actual card-shaping logic; this screen is
 * just data-fetching + layout.
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/useAuth';
import { getAnomalies, getDivisionDashboard, getMemberDashboard, type AnomaliesSummary, type DivisionDashboard, type MemberDashboard } from '../../api/dashboard.api';
import { getMapSummary, type MapSummary } from '../../api/map.api';
import { buildDivisionKpiCards, buildMemberKpiCards, buildProvinceOverviewCards, type KpiCard } from '../../kpi/buildKpiDashboard';
import { colors, radius, spacing, typography } from '../../theme';

const DIVISION_SCOPED_ROLES = ['REGIONAL_DIRECTOR', 'DIRECTOR_GENERAL'];

export default function KpiDashboardScreen() {
	const { t } = useTranslation();
	const { accessToken, user } = useAuth();
	const navigation = useNavigation<{ navigate: (screen: string) => void }>();
	const isDivisionScoped = user?.role != null && DIVISION_SCOPED_ROLES.includes(user.role);

	const [mapSummary, setMapSummary] = useState<MapSummary | null>(null);
	const [divisionSummary, setDivisionSummary] = useState<DivisionDashboard | null>(null);
	const [memberSummary, setMemberSummary] = useState<MemberDashboard | null>(null);
	const [anomalies, setAnomalies] = useState<AnomaliesSummary | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');

	const load = useCallback(async () => {
		if (!accessToken) return;
		setLoading(true);
		try {
			if (isDivisionScoped) {
				const [map, division, anomaliesResult] = await Promise.all([
					getMapSummary(accessToken),
					getDivisionDashboard(accessToken),
					getAnomalies(accessToken),
				]);
				setMapSummary(map);
				setDivisionSummary(division);
				setAnomalies(anomaliesResult);
			} else {
				const [map, member] = await Promise.all([getMapSummary(accessToken), getMemberDashboard(accessToken)]);
				setMapSummary(map);
				setMemberSummary(member);
			}
			setError('');
		} catch (err) {
			setError(err instanceof Error ? err.message : t('kpi.couldNotLoad'));
		} finally {
			setLoading(false);
		}
	}, [accessToken, isDivisionScoped, t]);

	useFocusEffect(
		useCallback(() => {
			const timer = setTimeout(() => { void load(); }, 0);
			return () => clearTimeout(timer);
		}, [load]),
	);

	const provinceCards = mapSummary ? buildProvinceOverviewCards(mapSummary.divisions, t) : [];
	const scopedCards = isDivisionScoped
		? (divisionSummary && anomalies ? buildDivisionKpiCards(divisionSummary, anomalies, t) : [])
		: (memberSummary ? buildMemberKpiCards(memberSummary, t) : []);
	const scopedSectionTitle = isDivisionScoped
		? t('kpi.divisionSectionTitle', { division: divisionSummary?.division.name ?? '' })
		: t('kpi.memberSectionTitle');

	if (loading && !mapSummary) {
		return (
			<View style={styles.centered}>
				<ActivityIndicator color={colors.primary} />
			</View>
		);
	}

	return (
		<ScrollView contentContainerStyle={styles.container}>
			<Text style={styles.title}>{t('kpi.title')}</Text>
			<Text style={styles.subtitle}>{t('kpi.subtitle')}</Text>

			{error ? <Text style={styles.error}>{error}</Text> : null}

			<KpiSection title={t('kpi.provinceSectionTitle')} cards={provinceCards} />
			<KpiSection title={scopedSectionTitle} cards={scopedCards} />

			<View style={styles.linkRow}>
				<Pressable style={styles.linkButton} onPress={() => navigation.navigate('GisMap')}>
					<Text style={styles.linkButtonText}>{t('kpi.viewMap')}</Text>
				</Pressable>
				{isDivisionScoped ? (
					<>
						<Pressable style={styles.linkButton} onPress={() => navigation.navigate('Analytics')}>
							<Text style={styles.linkButtonText}>{t('kpi.viewAnalytics')}</Text>
						</Pressable>
						<Pressable style={styles.linkButton} onPress={() => navigation.navigate('Anomalies')}>
							<Text style={styles.linkButtonText}>{t('kpi.viewAnomalies')}</Text>
						</Pressable>
					</>
				) : null}
			</View>
		</ScrollView>
	);
}

function KpiSection({ title, cards }: { title: string; cards: KpiCard[] }) {
	const { t } = useTranslation();
	return (
		<View style={styles.card}>
			<Text style={styles.sectionHeader}>{title}</Text>
			{cards.length === 0 ? (
				<Text style={styles.empty}>{t('kpi.noData')}</Text>
			) : (
				<View style={styles.grid}>
					{cards.map((kpi) => <KpiTile key={kpi.key} kpi={kpi} />)}
				</View>
			)}
		</View>
	);
}

function KpiTile({ kpi }: { kpi: KpiCard }) {
	const toneStyle = kpi.tone === 'danger' ? styles.tileDanger : kpi.tone === 'warning' ? styles.tileWarning : styles.tileDefault;
	const valueToneStyle = kpi.tone === 'danger' ? styles.tileValueDanger : kpi.tone === 'warning' ? styles.tileValueWarning : styles.tileValueDefault;
	return (
		<View style={[styles.tile, toneStyle]}>
			<Text style={[styles.tileValue, valueToneStyle]}>{kpi.value}</Text>
			<Text style={styles.tileLabel} numberOfLines={2}>{kpi.label}</Text>
		</View>
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
	sectionHeader: { color: colors.textPrimary, fontSize: typography.size.md, fontWeight: typography.weight.bold, marginBottom: spacing.sm },
	empty: { color: colors.textSecondary, fontSize: typography.size.sm, textAlign: 'center', paddingVertical: spacing.md },
	grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
	tile: {
		flexBasis: '47%',
		flexGrow: 1,
		borderRadius: radius.md,
		borderWidth: 1,
		padding: spacing.sm,
	},
	tileDefault: { backgroundColor: colors.background, borderColor: colors.border },
	tileWarning: { backgroundColor: colors.background, borderColor: colors.warning },
	tileDanger: { backgroundColor: colors.background, borderColor: colors.error },
	tileValue: { fontSize: typography.size.xl, fontWeight: typography.weight.bold },
	tileValueDefault: { color: colors.primaryDark },
	tileValueWarning: { color: colors.warning },
	tileValueDanger: { color: colors.error },
	tileLabel: { color: colors.textSecondary, fontSize: typography.size.xs, marginTop: spacing.xs / 2 },
	linkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
	linkButton: { flexGrow: 1, backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: spacing.sm, alignItems: 'center', paddingHorizontal: spacing.md },
	linkButtonText: { color: colors.white, fontSize: typography.size.sm, fontWeight: typography.weight.bold },
});
