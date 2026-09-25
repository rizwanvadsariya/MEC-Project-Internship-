import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import { getVisitForm, type VisitFormContext } from '../../api/visitForms.api';
import { listVisitPhotos, type VisitPhoto } from '../../api/photos.api';
import { listIssues, type IssueReport } from '../../api/issues.api';
import { useAuth } from '../../auth/useAuth';
import { colors, radius, spacing, typography } from '../../theme';

export default function VisitReportScreen() {
	const { accessToken } = useAuth();
	const route = useRoute<{ key: string; name: string; params?: { id?: string } }>();
	const visitId = route.params?.id ?? '';
	const [context, setContext] = useState<VisitFormContext | null>(null);
	const [photos, setPhotos] = useState<VisitPhoto[]>([]);
	const [issues, setIssues] = useState<IssueReport[]>([]);
	const [error, setError] = useState('');

	const load = useCallback(async () => {
		if (!accessToken || !visitId) return;
		try {
			const [form, visitPhotos, filedIssues] = await Promise.all([getVisitForm(visitId, accessToken), listVisitPhotos(visitId, accessToken), listIssues(visitId, accessToken)]);
			setContext(form); setPhotos(visitPhotos); setIssues(filedIssues); setError('');
		} catch (err) { setError(err instanceof Error ? err.message : 'Could not load the submitted report.'); }
	}, [accessToken, visitId]);

	useFocusEffect(useCallback(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]));

	if (error) return <Text style={styles.error}>{error}</Text>;
	if (!context) return <ActivityIndicator color={colors.primary} style={styles.loader} />;
	if (!context.form) return <Text style={styles.error}>No submitted report exists for this visit.</Text>;

	return <ScrollView contentContainerStyle={styles.container}>
		<Text style={styles.kicker}>FIELD MONITORING REPORT</Text>
		<Text style={styles.title}>{context.template.name}</Text>
		<Text style={styles.version}>Template version {context.template.version} • Submitted and locked</Text>
		<View style={styles.summary}>
			<Row label="Physical progress" value={`${context.form.physicalProgressPct ?? 0}%`} />
			<Row label="Remarks" value={context.form.remarks || 'No remarks provided'} />
		</View>
		<Text style={styles.sectionTitle}>Sector checklist</Text>
		<View style={styles.card}>{context.template.fields.map((field) => <Row key={field.id} label={field.label} value={formatValue(context.form?.responses[field.fieldKey])} />)}</View>
		<Text style={styles.sectionTitle}>Progress evidence</Text>
		{photos.length ? <View style={styles.photoGrid}>{photos.map((photo) => <View key={photo.id} style={styles.photoCard}><Image source={{ uri: photo.signedUrl }} style={styles.photo} /><Text style={styles.caption}>{photo.caption || 'Progress photo'}</Text></View>)}</View> : <Text style={styles.muted}>No photos were attached.</Text>}
		<Text style={styles.sectionTitle}>Issue reports ({issues.length})</Text>
		{issues.length ? issues.map((issue) => <View key={issue.id} style={styles.issueCard}><Row label={issue.issueType} value={`${issue.severity} • ${issue.status.replace('_', ' ')}`} /><Text style={styles.value}>{issue.description}</Text></View>) : <Text style={styles.muted}>No issues were reported.</Text>}
	</ScrollView>;
}

function formatValue(value: unknown) {
	if (value === null || value === undefined || value === '') return 'Not provided';
	if (Array.isArray(value)) return value.join(', ').replaceAll('_', ' ');
	if (typeof value === 'boolean') return value ? 'Yes' : 'No';
	return String(value).replaceAll('_', ' ');
}

function Row({ label, value }: { label: string; value: string }) {
	return <View style={styles.row}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>;
}

const styles = StyleSheet.create({
	container: { flexGrow: 1, backgroundColor: colors.background, padding: spacing.lg },
	loader: { flex: 1, margin: spacing.xl },
	kicker: { color: colors.primaryDark, fontSize: typography.size.xs, fontWeight: typography.weight.bold, letterSpacing: 1 },
	title: { color: colors.textPrimary, fontSize: typography.size.xl, fontWeight: typography.weight.bold, marginTop: spacing.sm },
	version: { color: colors.success, fontSize: typography.size.xs, marginTop: spacing.xs, marginBottom: spacing.lg },
	summary: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
	sectionTitle: { color: colors.textPrimary, fontSize: typography.size.lg, fontWeight: typography.weight.bold, marginTop: spacing.lg, marginBottom: spacing.sm },
	card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
	issueCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
	row: { borderBottomColor: colors.border, borderBottomWidth: 1, paddingVertical: spacing.sm },
	label: { color: colors.textSecondary, fontSize: typography.size.xs, marginBottom: spacing.xs },
	value: { color: colors.textPrimary, fontSize: typography.size.sm, lineHeight: typography.lineHeight.md },
	muted: { color: colors.textSecondary, fontSize: typography.size.sm },
	error: { color: colors.error, padding: spacing.lg, lineHeight: typography.lineHeight.md },
	photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
	photoCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, overflow: 'hidden', width: '48%' },
	photo: { aspectRatio: 1, width: '100%' },
	caption: { color: colors.textSecondary, fontSize: typography.size.xs, padding: spacing.sm },
});