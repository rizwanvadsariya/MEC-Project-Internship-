/** Dynamic form from the department template: progress %, remarks, sector-specific fields. */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import DynamicFormRenderer from '../../components/forms/DynamicFormRenderer';
import { getVisitForm, saveVisitForm, submitVisitForm, type VisitFormContext } from '../../api/visitForms.api';
import { useAuth } from '../../auth/useAuth';
import { colors, radius, spacing, typography } from '../../theme';

export default function VisitFormScreen() {
	const { accessToken } = useAuth();
	const route = useRoute<{ key: string; name: string; params?: { id?: string } }>();
	const visitId = route.params?.id ?? '';
	const [context, setContext] = useState<VisitFormContext | null>(null);
	const [progress, setProgress] = useState('');
	const [remarks, setRemarks] = useState('');
	const [responses, setResponses] = useState<Record<string, unknown>>({});
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState('');
	const [error, setError] = useState('');

	const load = useCallback(async () => {
		if (!accessToken || !visitId) return;
		setLoading(true);
		try {
			const result = await getVisitForm(visitId, accessToken);
			setContext(result);
			setProgress(result.form?.physicalProgressPct == null ? '' : String(result.form.physicalProgressPct));
			setRemarks(result.form?.remarks ?? '');
			setResponses(result.form?.responses ?? {});
			setError('');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Could not load the visit form.');
		} finally {
			setLoading(false);
		}
	}, [accessToken, visitId]);

	useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);

	const persist = async (submit: boolean) => {
		if (!accessToken || !context) return;
		const numericProgress = Number(progress);
		if (!Number.isFinite(numericProgress) || numericProgress < 0 || numericProgress > 100) {
			setError('Physical progress must be a number from 0 to 100.');
			return;
		}
		setSaving(true);
		setError('');
		setMessage('');
		try {
			const payload = { physicalProgressPct: numericProgress, remarks: remarks.trim() || null, responses };
			const saved = submit ? await submitVisitForm(visitId, payload, accessToken) : await saveVisitForm(visitId, payload, accessToken);
			setMessage(submit ? 'Form submitted successfully.' : 'Draft saved.');
			setContext((current) => current ? { ...current, form: saved } : current);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Could not save the visit form.');
		} finally {
			setSaving(false);
		}
	};

	if (loading) return <ActivityIndicator color={colors.primary} style={styles.loader} />;
	if (error && !context) return <Text style={styles.error}>{error}</Text>;
	if (!context) return null;
	const readOnly = !context.canEdit || context.form?.status === 'SUBMITTED';

	return (
		<ScrollView contentContainerStyle={styles.container}>
			<Text style={styles.title}>{context.template.name}</Text>
			<Text style={styles.subtitle}>Template version {context.template.version}</Text>
			{context.form?.status === 'SUBMITTED' ? <Text style={styles.submitted}>Submitted</Text> : null}
			<Text style={styles.label}>Physical progress (%) *</Text>
			<TextInput editable={!readOnly} value={progress} onChangeText={setProgress} keyboardType="numeric" placeholder="0 - 100" placeholderTextColor={colors.textSecondary} style={styles.input} />
			<Text style={styles.label}>Remarks</Text>
			<TextInput editable={!readOnly} value={remarks} onChangeText={setRemarks} multiline placeholder="Describe what you observed" placeholderTextColor={colors.textSecondary} style={[styles.input, styles.remarks]} />
			<Text style={styles.sectionTitle}>Sector checklist</Text>
			<DynamicFormRenderer fields={context.template.fields} values={responses} disabled={readOnly} onChange={(key, value) => setResponses((current) => ({ ...current, [key]: value }))} />
			{error ? <Text style={styles.error}>{error}</Text> : null}
			{message ? <Text style={styles.message}>{message}</Text> : null}
			{context.canEdit && !readOnly ? <View style={styles.actions}>
				<Pressable disabled={saving} style={[styles.button, styles.secondaryButton]} onPress={() => { void persist(false); }}><Text style={styles.secondaryText}>{saving ? 'Saving...' : 'Save draft'}</Text></Pressable>
				<Pressable disabled={saving} style={[styles.button, styles.primaryButton]} onPress={() => { void persist(true); }}><Text style={styles.primaryText}>{saving ? 'Submitting...' : 'Submit form'}</Text></Pressable>
			</View> : null}
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	container: { flexGrow: 1, backgroundColor: colors.background, padding: spacing.lg },
	loader: { flex: 1, margin: spacing.xl },
	title: { color: colors.textPrimary, fontSize: typography.size.xl, fontWeight: typography.weight.bold },
	subtitle: { color: colors.textSecondary, fontSize: typography.size.sm, marginTop: spacing.xs, marginBottom: spacing.lg },
	sectionTitle: { color: colors.textPrimary, fontSize: typography.size.lg, fontWeight: typography.weight.bold, marginTop: spacing.md, marginBottom: spacing.md },
	label: { color: colors.textPrimary, fontSize: typography.size.sm, fontWeight: typography.weight.medium, marginBottom: spacing.xs },
	input: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, color: colors.textPrimary, minHeight: 48, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.md },
	remarks: { minHeight: 100, textAlignVertical: 'top' },
	error: { color: colors.error, lineHeight: typography.lineHeight.md, marginVertical: spacing.sm },
	message: { color: colors.success, marginVertical: spacing.sm },
	submitted: { color: colors.success, fontWeight: typography.weight.bold, marginBottom: spacing.md },
	actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, paddingBottom: spacing.xl },
	button: { flex: 1, alignItems: 'center', borderRadius: radius.md, paddingVertical: spacing.md },
	primaryButton: { backgroundColor: colors.primary },
	secondaryButton: { backgroundColor: colors.surface, borderColor: colors.primary, borderWidth: 1 },
	primaryText: { color: colors.white, fontWeight: typography.weight.bold },
	secondaryText: { color: colors.primaryDark, fontWeight: typography.weight.bold },
});
