import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { getVisitForm, type VisitFormContext } from '../../api/visitForms.api';
import { listVisitPhotos, type VisitPhoto } from '../../api/photos.api';
import { listIssues, updateIssueLifecycle, type IssueLifecycleUpdate, type IssueReport, type IssueStatus } from '../../api/issues.api';
import { listEligibleMembers, type EligibleMember } from '../../api/teams.api';
import { translateApiError } from '../../i18n/apiErrors';
import { useAuth } from '../../auth/useAuth';
import { colors, radius, spacing, typography } from '../../theme';

// Step 24 — a status may only move forward along this line; a later stage may
// be set directly (e.g. straight to RESOLVED) without passing through every
// intermediate one. Mirrors backend/src/services/issue.service.js's own
// STATUS_ORDER exactly.
const STATUS_ORDER: IssueStatus[] = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED'];

export default function VisitReportScreen() {
	const { t } = useTranslation();
	const { accessToken, user } = useAuth();
	const isRd = user?.role === 'REGIONAL_DIRECTOR';
	const route = useRoute<{ key: string; name: string; params?: { id?: string } }>();
	const visitId = route.params?.id ?? '';
	const [context, setContext] = useState<VisitFormContext | null>(null);
	const [photos, setPhotos] = useState<VisitPhoto[]>([]);
	const [issues, setIssues] = useState<IssueReport[]>([]);
	const [eligibleMembers, setEligibleMembers] = useState<EligibleMember[]>([]);
	const [error, setError] = useState('');
	const [savingIssueId, setSavingIssueId] = useState<string | null>(null);
	const [ownerPickerIssueId, setOwnerPickerIssueId] = useState<string | null>(null);
	const [dueDatePickerIssueId, setDueDatePickerIssueId] = useState<string | null>(null);
	const [lifecycleError, setLifecycleError] = useState('');

	const load = useCallback(async () => {
		if (!accessToken || !visitId) return;
		try {
			const [form, visitPhotos, filedIssues, members] = await Promise.all([
				getVisitForm(visitId, accessToken),
				listVisitPhotos(visitId, accessToken),
				listIssues(visitId, accessToken),
				isRd ? listEligibleMembers(accessToken) : Promise.resolve([]),
			]);
			setContext(form); setPhotos(visitPhotos); setIssues(filedIssues); setEligibleMembers(members); setError('');
		} catch (err) { setError(err instanceof Error ? err.message : t('report.couldNotLoad')); }
	}, [accessToken, visitId, isRd, t]);

	useFocusEffect(useCallback(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]));

	const applyLifecycleUpdate = async (issueId: string, update: IssueLifecycleUpdate) => {
		if (!accessToken) return;
		setSavingIssueId(issueId);
		setOwnerPickerIssueId(null);
		setDueDatePickerIssueId(null);
		try {
			const updated = await updateIssueLifecycle(visitId, issueId, update, accessToken);
			setIssues((current) => current.map((issue) => (issue.id === issueId ? updated : issue)));
			setLifecycleError('');
		} catch (err) {
			setLifecycleError(translateApiError(t, err, t('issueLifecycle.couldNotUpdate')));
		} finally {
			setSavingIssueId(null);
		}
	};

	if (error) return <Text style={styles.error}>{error}</Text>;
	if (!context) return <ActivityIndicator color={colors.primary} style={styles.loader} />;
	if (!context.form) return <Text style={styles.error}>{t('report.noReport')}</Text>;

	return <ScrollView contentContainerStyle={styles.container}>
		<Text style={styles.kicker}>{t('report.kicker')}</Text>
		<Text style={styles.title}>{context.template.name}</Text>
		<Text style={styles.version}>{t('report.templateVersionSubmitted', { version: context.template.version })}</Text>
		<View style={styles.summary}>
			<Row label={t('report.physicalProgress')} value={`${context.form.physicalProgressPct ?? 0}%`} />
			<Row label={t('report.remarks')} value={context.form.remarks || t('report.noRemarksProvided')} />
		</View>
		<Text style={styles.sectionTitle}>{t('report.sectorChecklist')}</Text>
		<View style={styles.card}>{context.template.fields.map((field) => <Row key={field.id} label={field.label} value={formatValue(context.form?.responses[field.fieldKey], t)} />)}</View>
		<Text style={styles.sectionTitle}>{t('report.progressEvidence')}</Text>
		{photos.length ? <View style={styles.photoGrid}>{photos.map((photo) => <View key={photo.id} style={styles.photoCard}><Image source={{ uri: photo.signedUrl }} style={styles.photo} /><Text style={styles.caption}>{photo.caption || t('visitForm.progressPhoto')}</Text></View>)}</View> : <Text style={styles.muted}>{t('report.noPhotosAttached')}</Text>}
		<Text style={styles.sectionTitle}>{t('report.issueReports', { count: issues.length })}</Text>
		{lifecycleError ? <Text style={styles.error}>{lifecycleError}</Text> : null}
		{issues.length ? issues.map((issue) => (
			<IssueCard
				key={issue.id}
				issue={issue}
				isRd={isRd}
				saving={savingIssueId === issue.id}
				eligibleMembers={eligibleMembers}
				ownerPickerOpen={ownerPickerIssueId === issue.id}
				onOpenOwnerPicker={() => setOwnerPickerIssueId(issue.id)}
				onCloseOwnerPicker={() => setOwnerPickerIssueId(null)}
				dueDatePickerOpen={dueDatePickerIssueId === issue.id}
				onOpenDueDatePicker={() => setDueDatePickerIssueId(issue.id)}
				onCloseDueDatePicker={() => setDueDatePickerIssueId(null)}
				onUpdate={(update) => applyLifecycleUpdate(issue.id, update)}
			/>
		)) : <Text style={styles.muted}>{t('report.noIssuesReported')}</Text>}
	</ScrollView>;
}

function IssueCard({
	issue,
	isRd,
	saving,
	eligibleMembers,
	ownerPickerOpen,
	onOpenOwnerPicker,
	onCloseOwnerPicker,
	dueDatePickerOpen,
	onOpenDueDatePicker,
	onCloseDueDatePicker,
	onUpdate,
}: {
	issue: IssueReport;
	isRd: boolean;
	saving: boolean;
	eligibleMembers: EligibleMember[];
	ownerPickerOpen: boolean;
	onOpenOwnerPicker: () => void;
	onCloseOwnerPicker: () => void;
	dueDatePickerOpen: boolean;
	onOpenDueDatePicker: () => void;
	onCloseDueDatePicker: () => void;
	onUpdate: (update: IssueLifecycleUpdate) => void;
}) {
	const { t } = useTranslation();
	const owner = eligibleMembers.find((member) => member.id === issue.ownerId);
	const isResolved = issue.status === 'RESOLVED';
	const nextStatuses = STATUS_ORDER.filter((status, index) => index > STATUS_ORDER.indexOf(issue.status) && status !== 'OPEN') as Exclude<IssueStatus, 'OPEN'>[];

	return (
		<View style={styles.issueCard}>
			<Row label={issue.issueType} value={`${issue.severity} • ${t(`issueLifecycle.status.${issue.status}`)}`} />
			<Text style={styles.value}>{issue.description}</Text>
			{issue.escalatedAt ? <Text style={styles.escalatedBadge}>{t('issueLifecycle.escalatedToDg')}</Text> : null}
			<View style={styles.lifecycleMeta}>
				<Text style={styles.metaText}>{t('issueLifecycle.owner')}: {owner ? owner.fullName : issue.ownerId ? issue.ownerId : t('issueLifecycle.unassigned')}</Text>
				<Text style={styles.metaText}>{t('issueLifecycle.dueDate')}: {issue.dueDate ?? t('issueLifecycle.noDueDate')}</Text>
			</View>

			{isRd && !isResolved ? (
				saving ? (
					<ActivityIndicator color={colors.primary} style={styles.lifecycleSpinner} />
				) : (
					<View style={styles.lifecycleActions}>
						{nextStatuses.map((status) => (
							<Pressable key={status} style={styles.actionButton} onPress={() => onUpdate({ status })}>
								<Text style={styles.actionButtonText}>{t('issueLifecycle.advanceTo', { status: t(`issueLifecycle.status.${status}`) })}</Text>
							</Pressable>
						))}
						<Pressable style={styles.actionButtonSecondary} onPress={onOpenOwnerPicker}>
							<Text style={styles.actionButtonSecondaryText}>{issue.ownerId ? t('issueLifecycle.changeOwner') : t('issueLifecycle.assignOwner')}</Text>
						</Pressable>
						<Pressable style={styles.actionButtonSecondary} onPress={onOpenDueDatePicker}>
							<Text style={styles.actionButtonSecondaryText}>{issue.dueDate ? t('issueLifecycle.changeDueDate') : t('issueLifecycle.setDueDate')}</Text>
						</Pressable>
						{issue.dueDate ? (
							<Pressable style={styles.actionButtonSecondary} onPress={() => onUpdate({ dueDate: null })}>
								<Text style={styles.actionButtonSecondaryText}>{t('issueLifecycle.clearDueDate')}</Text>
							</Pressable>
						) : null}
					</View>
				)
			) : null}
			{isRd && isResolved ? <Text style={styles.metaText}>{t('issueLifecycle.resolvedLocked')}</Text> : null}

			{dueDatePickerOpen ? (
				<DateTimePicker
					value={issue.dueDate ? parseIsoDate(issue.dueDate) : new Date()}
					mode="date"
					display="default"
					onChange={(event: DateTimePickerEvent, selectedDate?: Date) => {
						if (event.type === 'set' && selectedDate) onUpdate({ dueDate: toIsoDate(selectedDate) });
						else onCloseDueDatePicker();
					}}
				/>
			) : null}

			<Modal visible={ownerPickerOpen} transparent animationType="fade" onRequestClose={onCloseOwnerPicker}>
				<Pressable style={styles.modalBackdrop} onPress={onCloseOwnerPicker}>
					<View style={styles.modalCard}>
						<Text style={styles.modalTitle}>{t('issueLifecycle.selectOwnerTitle')}</Text>
						<Pressable style={styles.memberRow} onPress={() => onUpdate({ ownerId: null })}>
							<Text style={styles.memberRowText}>{t('issueLifecycle.unassignOwner')}</Text>
						</Pressable>
						{eligibleMembers.map((member) => (
							<Pressable key={member.id} style={styles.memberRow} onPress={() => onUpdate({ ownerId: member.id })}>
								<Text style={styles.memberRowText}>{member.fullName} ({member.role})</Text>
							</Pressable>
						))}
						<Pressable style={styles.memberRow} onPress={onCloseOwnerPicker}>
							<Text style={styles.memberRowCancel}>{t('issueLifecycle.cancel')}</Text>
						</Pressable>
					</View>
				</Pressable>
			</Modal>
		</View>
	);
}

function parseIsoDate(value: string) {
	const [year, month, day] = value.split('-').map(Number);
	return new Date(year, month - 1, day);
}

function toIsoDate(value: Date) {
	const year = value.getFullYear();
	const month = String(value.getMonth() + 1).padStart(2, '0');
	const day = String(value.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function formatValue(value: unknown, t: (key: string) => string) {
	if (value === null || value === undefined || value === '') return t('report.notProvided');
	if (Array.isArray(value)) return value.join(', ').replaceAll('_', ' ');
	if (typeof value === 'boolean') return value ? t('report.yes') : t('report.no');
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
	escalatedBadge: { color: colors.error, fontSize: typography.size.xs, fontWeight: typography.weight.bold, marginTop: spacing.xs },
	lifecycleMeta: { marginTop: spacing.sm, gap: spacing.xs },
	metaText: { color: colors.textSecondary, fontSize: typography.size.xs },
	lifecycleSpinner: { marginTop: spacing.sm, alignSelf: 'flex-start' },
	lifecycleActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
	actionButton: { backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
	actionButtonText: { color: colors.white, fontSize: typography.size.xs, fontWeight: typography.weight.bold },
	actionButtonSecondary: { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
	actionButtonSecondaryText: { color: colors.textPrimary, fontSize: typography.size.xs, fontWeight: typography.weight.medium },
	modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.lg },
	modalCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
	modalTitle: { color: colors.textPrimary, fontSize: typography.size.md, fontWeight: typography.weight.bold, marginBottom: spacing.sm },
	memberRow: { paddingVertical: spacing.sm, borderBottomColor: colors.border, borderBottomWidth: 1 },
	memberRowText: { color: colors.textPrimary, fontSize: typography.size.sm },
	memberRowCancel: { color: colors.error, fontSize: typography.size.sm, fontWeight: typography.weight.bold },
});
