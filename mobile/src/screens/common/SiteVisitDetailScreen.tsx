/**
 * Read-only site visit detail: scheme, status, and team. What support users
 * and RD/DG see. The form/photos/issues sections join this screen once the
 * lead MEO can actually fill them in (phases.md Steps 12-14).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../../auth/useAuth';
import { getSiteVisit, type SiteVisitDetail } from '../../api/siteVisits.api';
import { colors, radius, spacing, typography } from '../../theme';

const STATUS_LABEL: Record<string, string> = {
	SCHEDULED: 'Scheduled',
	IN_PROGRESS: 'In progress',
	COMPLETED: 'Completed',
	CANCELLED: 'Cancelled',
};

export default function SiteVisitDetailScreen() {
	const { accessToken, user } = useAuth();
	const route = useRoute<{ key: string; name: string; params?: { id?: string } }>();
	const navigation = useNavigation<{ navigate: (screen: string, params?: Record<string, string>) => void }>();
	const visitId = route.params?.id ?? '';
	const [visit, setVisit] = useState<SiteVisitDetail | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');

	const load = useCallback(async () => {
		if (!accessToken || !visitId) return;
		setLoading(true);
		try {
			setVisit(await getSiteVisit(visitId, accessToken));
			setError('');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Could not load this site visit.');
		} finally {
			setLoading(false);
		}
	}, [accessToken, visitId]);

	useEffect(() => {
		const timer = setTimeout(() => { void load(); }, 0);
		return () => clearTimeout(timer);
	}, [load]);

	if (loading) return <ActivityIndicator color={colors.primary} style={styles.loader} />;
	if (error) return <Text style={styles.error}>{error}</Text>;
	if (!visit) return null;

	return (
		<ScrollView contentContainerStyle={styles.container}>
			<Text style={styles.uid}>{visit.schemeUid}</Text>
			<Text style={styles.schemeName}>{visit.schemeName}</Text>

			<View style={styles.card}>
				<Row label="Status" value={STATUS_LABEL[visit.status] ?? visit.status} />
				<Row label="Scheduled" value={visit.scheduledDate ?? 'Not yet scheduled'} />
				<Row label="Started" value={visit.startedAt ? new Date(visit.startedAt).toLocaleString() : '—'} />
				<Row label="Completed" value={visit.completedAt ? new Date(visit.completedAt).toLocaleString() : '—'} />
			</View>
			{visit.members.some((member) => member.userId === user?.id && member.teamRole === 'LEAD_MEO') ? <Pressable style={styles.formButton} onPress={() => navigation.navigate('VisitForm', { id: visit.id })}>
				<Text style={styles.formButtonText}>Open visit form</Text>
			</Pressable> : null}
			{visit.members.some((member) => member.userId === user?.id && member.teamRole === 'LEAD_MEO') ? <Pressable style={styles.photoButton} onPress={() => navigation.navigate('PhotoCapture', { id: visit.id })}>
				<Text style={styles.formButtonText}>Capture progress photo</Text>
			</Pressable> : null}

			<Text style={styles.sectionTitle}>Team</Text>
			<View style={styles.card}>
				{visit.members.map((member) => (
					<View key={member.id} style={styles.memberRow}>
						<Text style={styles.memberName}>{member.fullName}</Text>
						<Text style={styles.memberRole}>{member.teamRole.replace('_', ' ')}</Text>
					</View>
				))}
			</View>

			<Text style={styles.pendingNote}>Progress form, photos, and issue reports appear here once the lead MEO starts filling them in.</Text>
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
	loader: { flex: 1, margin: spacing.xl },
	error: { color: colors.error, padding: spacing.lg, lineHeight: typography.lineHeight.md },
	uid: { color: colors.primaryDark, fontSize: typography.size.xs, fontWeight: typography.weight.bold },
	schemeName: { color: colors.textPrimary, fontSize: typography.size.xl, fontWeight: typography.weight.bold, lineHeight: typography.lineHeight.lg, marginTop: spacing.xs, marginBottom: spacing.lg },
	sectionTitle: { color: colors.textPrimary, fontSize: typography.size.md, fontWeight: typography.weight.bold, marginTop: spacing.lg, marginBottom: spacing.sm },
	card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
	row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
	rowLabel: { color: colors.textSecondary, fontSize: typography.size.sm },
	rowValue: { color: colors.textPrimary, fontSize: typography.size.sm, fontWeight: typography.weight.medium },
	memberRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
	memberName: { color: colors.textPrimary, fontSize: typography.size.sm, fontWeight: typography.weight.medium },
	memberRole: { color: colors.textSecondary, fontSize: typography.size.xs },
	pendingNote: { color: colors.textSecondary, fontSize: typography.size.xs, lineHeight: typography.lineHeight.sm, marginTop: spacing.lg, textAlign: 'center' },
	formButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, marginTop: spacing.lg },
	formButtonText: { color: colors.white, fontWeight: typography.weight.bold },
	photoButton: { alignItems: 'center', backgroundColor: colors.primaryDark, borderRadius: radius.md, paddingVertical: spacing.md, marginTop: spacing.sm },
});
