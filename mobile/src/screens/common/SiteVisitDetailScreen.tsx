/**
 * Site visit detail: scheme, status, team, and a single link into the visit
 * form screen — which itself now owns the whole field-report flow (form,
 * photos, and an optional issue report, all filed together on submission).
 * The lead MEO gets an edit-capable link; every other visible role (support,
 * other MEOs, in-division RD/DG) gets the same link in view-only mode.
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/useAuth';
import { getSiteVisit, scheduleSiteVisit, type SiteVisitDetail } from '../../api/siteVisits.api';
import { colors, radius, spacing, typography } from '../../theme';

export default function SiteVisitDetailScreen() {
	const { t } = useTranslation();
	const { accessToken, user } = useAuth();
	const route = useRoute<{ key: string; name: string; params?: { id?: string } }>();
	const navigation = useNavigation<{ navigate: (screen: string, params?: Record<string, string>) => void }>();
	const visitId = route.params?.id ?? '';
	const [visit, setVisit] = useState<SiteVisitDetail | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [datePickerOpen, setDatePickerOpen] = useState(false);
	const [saving, setSaving] = useState(false);

	const load = useCallback(async () => {
		if (!accessToken || !visitId) return;
		setLoading(true);
		try {
			setVisit(await getSiteVisit(visitId, accessToken));
			setError('');
		} catch (err) {
			setError(err instanceof Error ? err.message : t('siteVisits.detail.couldNotLoadVisit'));
		} finally {
			setLoading(false);
		}
	}, [accessToken, visitId, t]);

	useFocusEffect(
		useCallback(() => {
			const timer = setTimeout(() => { void load(); }, 0);
			return () => clearTimeout(timer);
		}, [load]),
	);

	if (loading) return <ActivityIndicator color={colors.primary} style={styles.loader} />;
	if (error) return <Text style={styles.error}>{error}</Text>;
	if (!visit) return null;

	const isLeadMeo = visit.members.some((member) => member.userId === user?.id && member.teamRole === 'LEAD_MEO');
	const canDiscuss = user?.role !== 'SUPPORT_USER';
	// phases.md Step 21 — "RD / lead MEO plan upcoming visits"; a visit that's
	// already wrapped up has nothing left to schedule.
	const canSchedule = (user?.role === 'REGIONAL_DIRECTOR' || isLeadMeo) && visit.status !== 'COMPLETED' && visit.status !== 'CANCELLED';

	const saveScheduledDate = async (scheduledDate: string | null) => {
		if (!accessToken) return;
		setSaving(true);
		try {
			const updated = await scheduleSiteVisit(visit.id, scheduledDate, accessToken);
			setVisit((current) => (current ? { ...current, scheduledDate: updated.scheduledDate } : current));
			setError('');
		} catch (err) {
			setError(err instanceof Error ? err.message : t('siteVisits.detail.couldNotUpdateDate'));
		} finally {
			setSaving(false);
		}
	};

	return (
		<ScrollView contentContainerStyle={styles.container}>
			<Text style={styles.uid}>{visit.schemeUid}</Text>
			<Text style={styles.schemeName}>{visit.schemeName}</Text>

			<View style={styles.card}>
				<Row label={t('siteVisits.detail.status')} value={t(`siteVisits.status.${visit.status}`, { defaultValue: visit.status })} />
				{canSchedule ? (
					<Pressable style={styles.row} onPress={() => setDatePickerOpen(true)} disabled={saving}>
						<Text style={styles.rowLabel}>{t('siteVisits.detail.scheduled')}</Text>
						{saving ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.rowValueLink}>{visit.scheduledDate ?? t('siteVisits.detail.tapToSetDate')}</Text>}
					</Pressable>
				) : (
					<Row label={t('siteVisits.detail.scheduled')} value={visit.scheduledDate ?? t('siteVisits.detail.notYetScheduled')} />
				)}
				<Row label={t('siteVisits.detail.started')} value={visit.startedAt ? new Date(visit.startedAt).toLocaleString() : '—'} />
				<Row label={t('siteVisits.detail.completed')} value={visit.completedAt ? new Date(visit.completedAt).toLocaleString() : '—'} />
			</View>
			{canSchedule && visit.scheduledDate ? (
				<Pressable onPress={() => saveScheduledDate(null)} disabled={saving}>
					<Text style={styles.clearDateText}>{t('siteVisits.detail.clearScheduledDate')}</Text>
				</Pressable>
			) : null}
			{datePickerOpen ? (
				<DateTimePicker
					value={visit.scheduledDate ? parseIsoDate(visit.scheduledDate) : new Date()}
					mode="date"
					display="default"
					onChange={(event: DateTimePickerEvent, selectedDate?: Date) => {
						setDatePickerOpen(false);
						if (event.type === 'set' && selectedDate) saveScheduledDate(toIsoDate(selectedDate));
					}}
				/>
			) : null}
			<Pressable style={styles.formButton} onPress={() => navigation.navigate('VisitForm', { id: visit.id })}>
				<Text style={styles.formButtonText}>{isLeadMeo ? t('siteVisits.detail.fillVisitForm') : t('siteVisits.detail.viewVisitForm')}</Text>
			</Pressable>
			{canDiscuss ? (
				<Pressable
					style={styles.discussButton}
					onPress={() => navigation.navigate('Comments', { commentableType: 'SITE_VISIT', commentableId: visit.id, title: t('siteVisits.detail.discussionTitle', { schemeName: visit.schemeName }) })}
				>
					<Text style={styles.discussButtonText}>{t('siteVisits.detail.discussion')}</Text>
				</Pressable>
			) : null}

			<Text style={styles.sectionTitle}>{t('siteVisits.detail.team')}</Text>
			<View style={styles.card}>
				{visit.members.map((member) => (
					<View key={member.id} style={styles.memberRow}>
						<Text style={styles.memberName}>{member.fullName}</Text>
						<Text style={styles.memberRole}>{member.teamRole.replace('_', ' ')}</Text>
					</View>
				))}
			</View>

			{!isLeadMeo ? <Text style={styles.pendingNote}>{t('siteVisits.detail.viewOnlyNote')}</Text> : null}
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
	rowValueLink: { color: colors.primaryDark, fontSize: typography.size.sm, fontWeight: typography.weight.bold },
	clearDateText: { color: colors.error, fontSize: typography.size.xs, fontWeight: typography.weight.medium, textAlign: 'center', marginTop: spacing.sm },
	memberRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
	memberName: { color: colors.textPrimary, fontSize: typography.size.sm, fontWeight: typography.weight.medium },
	memberRole: { color: colors.textSecondary, fontSize: typography.size.xs },
	pendingNote: { color: colors.textSecondary, fontSize: typography.size.xs, lineHeight: typography.lineHeight.sm, marginTop: spacing.lg, textAlign: 'center' },
	formButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, marginTop: spacing.lg },
	formButtonText: { color: colors.white, fontWeight: typography.weight.bold },
	discussButton: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.primary, borderWidth: 1, borderRadius: radius.md, paddingVertical: spacing.md, marginTop: spacing.sm },
	discussButtonText: { color: colors.primaryDark, fontWeight: typography.weight.bold },
});
