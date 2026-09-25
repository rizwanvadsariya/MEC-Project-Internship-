/**
 * The lead MEO's single field-report screen: dynamic form (progress %,
 * remarks, sector-specific fields), photo capture, and an optional issue
 * report. Non-lead viewers land here too, in read-only mode (see canEdit
 * below) — and per the backend's visitForm/photo/issue services, they see
 * nothing at all here until the report is actually submitted.
 *
 * Photos and any reported issue are saved to the backend on *either* Save
 * draft or Submit (both call persist()) — a draft save is a real save, not a
 * no-op for anything but the form fields. Once an issue is filed it's
 * tracked in `filedIssue` so a second Save draft never re-files a duplicate;
 * it can still be removed (while the report isn't submitted yet) via the
 * existing DELETE endpoint. Once submitted, the whole report is permanently
 * locked, matching the backend's SUBMITTED lock.
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import DynamicFormRenderer from '../../components/forms/DynamicFormRenderer';
import { getVisitForm, saveVisitForm, submitVisitForm, type VisitFormContext } from '../../api/visitForms.api';
import { listVisitPhotos, uploadVisitPhoto, type VisitPhoto } from '../../api/photos.api';
import { deleteIssue, fileIssue, listIssues, type IssueReport, type IssueSeverity } from '../../api/issues.api';
import { useAuth } from '../../auth/useAuth';
import { colors, radius, spacing, typography } from '../../theme';

const SEVERITIES: IssueSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const SEVERITY_COLOR: Record<IssueSeverity, string> = {
	LOW: colors.success,
	MEDIUM: colors.warning,
	HIGH: colors.error,
	CRITICAL: colors.error,
};

export default function VisitFormScreen() {
	const { accessToken } = useAuth();
	const route = useRoute<{ key: string; name: string; params?: { id?: string } }>();
	const navigation = useNavigation<{ navigate: (screen: string, params?: Record<string, string>) => void }>();
	const visitId = route.params?.id ?? '';
	const [context, setContext] = useState<VisitFormContext | null>(null);
	const [progress, setProgress] = useState('');
	const [remarks, setRemarks] = useState('');
	const [responses, setResponses] = useState<Record<string, unknown>>({});
	const [photos, setPhotos] = useState<VisitPhoto[]>([]);
	const [pendingPhotos, setPendingPhotos] = useState<{ id: string; uri: string; caption: string }[]>([]);
	const [photoCaption, setPhotoCaption] = useState('');
	const [photoPreview, setPhotoPreview] = useState<string | null>(null);
	const [hasIssue, setHasIssue] = useState(false);
	const [issueType, setIssueType] = useState('');
	const [issueSeverity, setIssueSeverity] = useState<IssueSeverity>('MEDIUM');
	const [issueDescription, setIssueDescription] = useState('');
	const [filedIssue, setFiledIssue] = useState<IssueReport | null>(null);
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
			setPhotos(await listVisitPhotos(visitId, accessToken));
			const issues = await listIssues(visitId, accessToken);
			setFiledIssue(issues[0] ?? null);
			setError('');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Could not load the visit form.');
		} finally {
			setLoading(false);
		}
	}, [accessToken, visitId]);

	useFocusEffect(useCallback(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]));

	const persist = async (submit: boolean) => {
		if (!accessToken || !context) return;
		const numericProgress = Number(progress);
		if (!Number.isFinite(numericProgress) || numericProgress < 0 || numericProgress > 100) {
			setError('Physical progress must be a number from 0 to 100.');
			return;
		}
		if (!filedIssue && hasIssue && (!issueType.trim() || !issueDescription.trim())) {
			setError('Issue type and description are required when reporting an issue.');
			return;
		}
		setSaving(true);
		setError('');
		setMessage('');
		try {
			if (pendingPhotos.length) {
				const uploadedPhotos: VisitPhoto[] = [];
				for (const photo of pendingPhotos) {
					uploadedPhotos.push(await uploadVisitPhoto(visitId, accessToken, photo.uri, photo.caption || undefined));
				}
				setPhotos((current) => [...uploadedPhotos.reverse(), ...current]);
				setPendingPhotos([]);
			}
			if (!filedIssue && hasIssue) {
				const created = await fileIssue(visitId, { issueType: issueType.trim(), severity: issueSeverity, description: issueDescription.trim() }, accessToken);
				setFiledIssue(created);
			}
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

	const removeFiledIssue = async () => {
		if (!accessToken || !filedIssue) return;
		setSaving(true);
		setError('');
		try {
			await deleteIssue(visitId, filedIssue.id, accessToken);
			setFiledIssue(null);
			setHasIssue(false);
			setIssueType('');
			setIssueSeverity('MEDIUM');
			setIssueDescription('');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Could not remove the reported issue.');
		} finally {
			setSaving(false);
		}
	};

	const capturePhoto = async () => {
		if (!accessToken || readOnly) return;
		const permission = await ImagePicker.requestCameraPermissionsAsync();
		if (!permission.granted) { setError('Camera permission is required to capture a progress photo.'); return; }
		const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: false });
		if (result.canceled || !result.assets[0]) return;
		setPendingPhotos((current) => [...current, { id: `${Date.now()}-${current.length}`, uri: result.assets[0].uri, caption: photoCaption.trim() }]);
		setPhotoCaption('');
	};

	if (loading) return <ActivityIndicator color={colors.primary} style={styles.loader} />;
	if (error && !context) return <Text style={styles.error}>{error}</Text>;
	if (!context) return null;
	if (!context.canEdit && !context.form) {
		return (
			<View style={styles.container}>
				<Text style={styles.title}>{context.template.name}</Text>
				<Text style={styles.muted}>This visit report has not been submitted yet. It will appear here once the lead MEO submits it.</Text>
			</View>
		);
	}
	const readOnly = !context.canEdit || context.form?.status === 'SUBMITTED';

	return (
		<ScrollView contentContainerStyle={styles.container}>
			<Text style={styles.title}>{context.template.name}</Text>
			<Text style={styles.subtitle}>Template version {context.template.version}</Text>
			{context.form?.status === 'SUBMITTED' ? <Text style={styles.submitted}>SUBMITTED AND LOCKED: this report cannot be edited.</Text> : <View style={styles.warning}><Text style={styles.warningTitle}>ONE-TIME SUBMISSION</Text><Text style={styles.warningText}>Fill in the progress, checklist, photos, and any issue found carefully. You can submit this visit report only once. After submission, everything is permanently locked.</Text></View>}

			<Text style={styles.label}>Physical progress (%) *</Text>
			<TextInput editable={!readOnly} value={progress} onChangeText={setProgress} keyboardType="numeric" placeholder="0 - 100" placeholderTextColor={colors.textSecondary} style={styles.input} />
			<Text style={styles.label}>Remarks</Text>
			<TextInput editable={!readOnly} value={remarks} onChangeText={setRemarks} multiline placeholder="Describe what you observed" placeholderTextColor={colors.textSecondary} style={[styles.input, styles.remarks]} />
			<Text style={styles.sectionTitle}>Sector checklist</Text>
			<DynamicFormRenderer fields={context.template.fields} values={responses} disabled={readOnly} onChange={(key, value) => setResponses((current) => ({ ...current, [key]: value }))} />

			<Text style={styles.sectionTitle}>Progress photos</Text>
			{!readOnly ? <>
				<Text style={styles.photoHint}>Capture clear evidence before submitting the report. You can preview or remove each photo before final submission.</Text>
				<TextInput value={photoCaption} onChangeText={setPhotoCaption} placeholder="Photo caption (optional)" placeholderTextColor={colors.textSecondary} style={styles.input} />
				<Pressable disabled={saving} style={styles.photoButton} onPress={() => { void capturePhoto(); }}><Ionicons name="camera-outline" size={20} color={colors.white} /><Text style={styles.primaryText}>Capture progress photo</Text></Pressable>
				{pendingPhotos.length ? <View style={styles.photoGrid}>{pendingPhotos.map((photo) => <View key={photo.id} style={styles.photoCard}><Pressable onPress={() => setPhotoPreview(photo.uri)}><Image source={{ uri: photo.uri }} style={styles.photo} /></Pressable><Pressable style={styles.removePhoto} onPress={() => setPendingPhotos((current) => current.filter((item) => item.id !== photo.id))}><Ionicons name="close" size={16} color={colors.white} /></Pressable><Text style={styles.photoCaption}>{photo.caption || 'Review photo'}</Text></View>)}</View> : null}
			</> : null}
			{photos.length ? <View style={styles.photoGrid}>{photos.map((photo) => <Pressable key={photo.id} style={styles.photoCard} onPress={() => setPhotoPreview(photo.signedUrl)}><Image source={{ uri: photo.signedUrl }} style={styles.photo} /><Text style={styles.photoCaption}>{photo.caption || 'Progress photo'}</Text></Pressable>)}</View> : null}

			<Text style={styles.sectionTitle}>Any issues found?</Text>
			{filedIssue ? <View style={styles.issueBox}>
				<View style={styles.issueHeader}>
					<Text style={styles.issueTypeText}>{filedIssue.issueType}</Text>
					<View style={[styles.badge, { backgroundColor: SEVERITY_COLOR[filedIssue.severity] }]}><Text style={styles.badgeText}>{filedIssue.severity}</Text></View>
				</View>
				<Text style={styles.value}>{filedIssue.description}</Text>
				{!readOnly ? <Pressable disabled={saving} onPress={() => { void removeFiledIssue(); }}><Text style={styles.removeIssueText}>Remove issue</Text></Pressable> : null}
			</View> : !readOnly ? <>
				<View style={styles.yesNoRow}>
					<Pressable style={[styles.yesNoChip, !hasIssue && styles.yesNoChipActive]} onPress={() => setHasIssue(false)}>
						<Text style={[styles.yesNoText, !hasIssue && styles.yesNoTextActive]}>No</Text>
					</Pressable>
					<Pressable style={[styles.yesNoChip, hasIssue && styles.yesNoChipActive]} onPress={() => setHasIssue(true)}>
						<Text style={[styles.yesNoText, hasIssue && styles.yesNoTextActive]}>Yes</Text>
					</Pressable>
				</View>
				{hasIssue ? <View style={styles.issueBox}>
					<Text style={styles.label}>Issue type *</Text>
					<TextInput value={issueType} onChangeText={setIssueType} placeholder="e.g. Construction defect" placeholderTextColor={colors.textSecondary} style={styles.input} />
					<Text style={styles.label}>Severity *</Text>
					<View style={styles.severityRow}>
						{SEVERITIES.map((option) => (
							<Pressable key={option} onPress={() => setIssueSeverity(option)} style={[styles.severityChip, issueSeverity === option && { backgroundColor: SEVERITY_COLOR[option], borderColor: SEVERITY_COLOR[option] }]}>
								<Text style={[styles.severityText, issueSeverity === option && styles.severityTextActive]}>{option}</Text>
							</Pressable>
						))}
					</View>
					<Text style={styles.label}>Description *</Text>
					<TextInput value={issueDescription} onChangeText={setIssueDescription} multiline placeholder="Describe the issue in detail" placeholderTextColor={colors.textSecondary} style={[styles.input, styles.remarks]} />
				</View> : null}
			</> : <Text style={styles.muted}>No issue was reported.</Text>}

			{error ? <Text style={styles.error}>{error}</Text> : null}
			{message ? <Text style={styles.message}>{message}</Text> : null}
			{context.form?.status === 'SUBMITTED' ? <Pressable style={[styles.button, styles.primaryButton]} onPress={() => navigation.navigate('VisitReport', { id: visitId })}><Text style={styles.primaryText}>Preview submitted report</Text></Pressable> : null}
			{context.canEdit && !readOnly ? <View style={styles.actions}>
				<Pressable disabled={saving} style={[styles.button, styles.secondaryButton]} onPress={() => { void persist(false); }}><Text style={styles.secondaryText}>{saving ? 'Saving...' : 'Save draft'}</Text></Pressable>
				<Pressable disabled={saving} style={[styles.button, styles.primaryButton]} onPress={() => { void persist(true); }}><Text style={styles.primaryText}>{saving ? 'Submitting...' : 'Submit form'}</Text></Pressable>
			</View> : null}
			<Modal visible={photoPreview !== null} transparent animationType="fade" onRequestClose={() => setPhotoPreview(null)}><Pressable style={styles.previewBackdrop} onPress={() => setPhotoPreview(null)}>{photoPreview ? <Image source={{ uri: photoPreview }} style={styles.previewImage} resizeMode="contain" /> : null}</Pressable></Modal>
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
	warning: { backgroundColor: '#FFF8E1', borderColor: colors.warning, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
	warningTitle: { color: '#7A5700', fontWeight: typography.weight.bold, marginBottom: spacing.xs },
	warningText: { color: '#7A5700', fontSize: typography.size.xs, lineHeight: typography.lineHeight.md },
	photoHint: { color: colors.textSecondary, fontSize: typography.size.xs, lineHeight: typography.lineHeight.md, marginBottom: spacing.sm },
	photoButton: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', backgroundColor: colors.primaryDark, borderRadius: radius.md, paddingVertical: spacing.md },
	photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
	photoCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, overflow: 'hidden', position: 'relative', width: '48%' },
	photo: { aspectRatio: 1, width: '100%' },
	removePhoto: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.72)', borderRadius: radius.pill, justifyContent: 'center', position: 'absolute', right: spacing.xs, top: spacing.xs, width: 28, height: 28 },
	photoCaption: { color: colors.textSecondary, fontSize: typography.size.xs, padding: spacing.sm },
	yesNoRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
	yesNoChip: { borderColor: colors.border, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
	yesNoChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
	yesNoText: { color: colors.textSecondary, fontSize: typography.size.sm, fontWeight: typography.weight.bold },
	yesNoTextActive: { color: colors.white },
	issueBox: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
	issueHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
	issueTypeText: { color: colors.textPrimary, fontSize: typography.size.md, fontWeight: typography.weight.bold, flexShrink: 1 },
	badge: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
	badgeText: { color: colors.white, fontSize: typography.size.xs, fontWeight: typography.weight.bold },
	value: { color: colors.textPrimary, fontSize: typography.size.sm, lineHeight: typography.lineHeight.md },
	removeIssueText: { color: colors.error, fontSize: typography.size.xs, fontWeight: typography.weight.bold, marginTop: spacing.sm },
	muted: { color: colors.textSecondary, fontSize: typography.size.sm },
	severityRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
	severityChip: { borderColor: colors.border, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
	severityText: { color: colors.textSecondary, fontSize: typography.size.xs, fontWeight: typography.weight.bold },
	severityTextActive: { color: colors.white },
	previewBackdrop: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.9)', flex: 1, justifyContent: 'center', padding: spacing.lg },
	previewImage: { height: '80%', width: '100%' },
	actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, paddingBottom: spacing.xl },
	button: { flex: 1, alignItems: 'center', borderRadius: radius.md, paddingVertical: spacing.md },
	primaryButton: { backgroundColor: colors.primary },
	secondaryButton: { backgroundColor: colors.surface, borderColor: colors.primary, borderWidth: 1 },
	primaryText: { color: colors.white, fontWeight: typography.weight.bold },
	secondaryText: { color: colors.primaryDark, fontWeight: typography.weight.bold },
});
