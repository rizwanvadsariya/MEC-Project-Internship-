/**
 * A scheme's full record (phases.md Step 28's "open its record" destination,
 * reached either by scanning its QR code via QrScanScreen or tapping "View
 * details" on its card in SchemeBrowserScreen). Reads GET /schemes/:id —
 * this endpoint and its mobile client function (getScheme) already existed
 * before this step, with no screen ever consuming them; this is the first UI
 * surface for it, same "fill in an existing unused capability" shape as
 * several earlier steps in this app (issue.repo before Step 14,
 * dashboard.repo before Step 16, etc.).
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/useAuth';
import { getScheme, type Scheme } from '../../api/schemes.api';
import { colors, radius, spacing, typography } from '../../theme';

function formatPct(value: number | null | undefined): string {
	return value == null ? '—' : `${Math.round(value)}%`;
}

export default function SchemeDetailScreen() {
	const { t } = useTranslation();
	const { accessToken } = useAuth();
	const route = useRoute<{ key: string; name: string; params?: { schemeId?: number } }>();
	const schemeId = route.params?.schemeId;
	const [scheme, setScheme] = useState<Scheme | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');

	const load = useCallback(async () => {
		if (!accessToken || !schemeId) return;
		setLoading(true);
		try {
			setScheme(await getScheme(schemeId, accessToken));
			setError('');
		} catch (err) {
			setError(err instanceof Error ? err.message : t('schemeDetail.couldNotLoad'));
		} finally {
			setLoading(false);
		}
	}, [accessToken, schemeId, t]);

	useFocusEffect(
		useCallback(() => {
			const timer = setTimeout(() => { void load(); }, 0);
			return () => clearTimeout(timer);
		}, [load]),
	);

	if (loading && !scheme) {
		return (
			<View style={styles.centered}>
				<ActivityIndicator color={colors.primary} />
			</View>
		);
	}

	if (error && !scheme) {
		return (
			<View style={styles.centered}>
				<Text style={styles.error}>{error}</Text>
			</View>
		);
	}

	if (!scheme) return null;

	return (
		<ScrollView contentContainerStyle={styles.container}>
			<Text style={styles.uid}>{scheme.uid}</Text>
			<Text style={styles.name}>{scheme.name}</Text>
			<Text style={styles.status}>{scheme.status || t('common.unspecified')}</Text>

			<View style={styles.card}>
				<Row label={t('schemeDetail.department')} value={scheme.departmentName} />
				{scheme.subSectorName ? <Row label={t('schemeDetail.subSector')} value={scheme.subSectorName} /> : null}
				<Row label={t('schemeDetail.districts')} value={scheme.districts.join(', ') || t('schemes.districtNotSpecified')} />
				<Row label={t('schemeDetail.divisions')} value={scheme.divisions.join(', ') || t('common.unspecified')} />
				{scheme.targetCompletionDate ? <Row label={t('schemeDetail.targetCompletion')} value={scheme.targetCompletionDate} /> : null}
				{scheme.estimatedCost != null ? <Row label={t('schemeDetail.estimatedCost')} value={String(scheme.estimatedCost)} /> : null}
			</View>

			<View style={styles.card}>
				<Text style={styles.sectionHeader}>{t('schemeDetail.progress')}</Text>
				<View style={styles.pctRow}>
					<View style={styles.pctColumn}>
						<Text style={styles.pctLabel}>{t('reconciliation.physical')}</Text>
						<Text style={styles.pctValue}>{formatPct(scheme.physicalProgressPct)}</Text>
					</View>
					<View style={styles.pctColumn}>
						<Text style={styles.pctLabel}>{t('reconciliation.financial')}</Text>
						<Text style={styles.pctValue}>{formatPct(scheme.financialProgressPct)}</Text>
					</View>
				</View>
			</View>

			{error ? <Text style={styles.error}>{error}</Text> : null}
		</ScrollView>
	);
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<View style={styles.row}>
			<Text style={styles.rowLabel}>{label}</Text>
			<Text style={styles.rowValue}>{value}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flexGrow: 1, padding: spacing.lg, backgroundColor: colors.background },
	centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: spacing.lg },
	error: { color: colors.error, textAlign: 'center', lineHeight: typography.lineHeight.md },
	uid: { color: colors.primaryDark, fontSize: typography.size.xs, fontWeight: typography.weight.bold },
	name: { color: colors.textPrimary, fontSize: typography.size.xxl, fontWeight: typography.weight.bold, marginTop: spacing.xs, lineHeight: typography.lineHeight.lg },
	status: { color: colors.success, fontSize: typography.size.sm, fontWeight: typography.weight.medium, marginTop: spacing.xs },
	card: {
		backgroundColor: colors.surface,
		borderRadius: radius.lg,
		borderWidth: 1,
		borderColor: colors.border,
		padding: spacing.md,
		marginTop: spacing.md,
	},
	sectionHeader: { color: colors.textPrimary, fontSize: typography.size.md, fontWeight: typography.weight.bold, marginBottom: spacing.sm },
	row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: spacing.xs },
	rowLabel: { color: colors.textSecondary, fontSize: typography.size.sm },
	rowValue: { color: colors.textPrimary, fontSize: typography.size.sm, fontWeight: typography.weight.medium, flexShrink: 1, textAlign: 'right' },
	pctRow: { flexDirection: 'row', gap: spacing.lg },
	pctColumn: { flex: 1 },
	pctLabel: { color: colors.textSecondary, fontSize: typography.size.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
	pctValue: { color: colors.textPrimary, fontSize: typography.size.lg, fontWeight: typography.weight.bold, marginTop: 2 },
});
