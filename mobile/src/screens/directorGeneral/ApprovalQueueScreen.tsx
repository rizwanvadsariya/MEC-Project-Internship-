import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/useAuth';
import { decideApproval, listPendingApprovals, type PendingApproval } from '../../api/approvals.api';
import { colors, radius, spacing, typography } from '../../theme';
import { formatExactDateTime, formatRelativeTime, groupByMonth } from '../../utils/dateTime';

export default function ApprovalQueueScreen() {
	const { t } = useTranslation();
	const { accessToken } = useAuth();
	const [items, setItems] = useState<PendingApproval[]>([]);
	const [selected, setSelected] = useState<PendingApproval | null>(null);
	const [remarks, setRemarks] = useState('');
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');

	const load = useCallback(async () => {
		if (!accessToken) return;
		setLoading(true);
		try {
			setItems(await listPendingApprovals(accessToken));
			setError('');
		} catch (err) {
			setError(err instanceof Error ? err.message : t('approvals.couldNotLoad'));
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

	// Keeps "just now"/"5 minutes ago" fresh while the screen stays open,
	// without refetching from the server — a plain re-render tick every
	// minute is enough resolution for this display, and self-cleans on unmount.
	const [, forceRerenderTick] = useState(0);
	useEffect(() => {
		const interval = setInterval(() => forceRerenderTick((n) => n + 1), 60000);
		return () => clearInterval(interval);
	}, []);

	const decide = async (decision: 'APPROVED' | 'REJECTED') => {
		if (!accessToken || !selected) return;
		if (decision === 'REJECTED' && !remarks.trim()) {
			setError(t('approvals.remarksRequiredForRejection'));
			return;
		}
		setSaving(true);
		try {
			await decideApproval(selected.teamId, decision, remarks.trim(), accessToken);
			setSelected(null);
			setRemarks('');
			await load();
		} catch (err) {
			setError(err instanceof Error ? err.message : t('approvals.couldNotDecide'));
		} finally {
			setSaving(false);
		}
	};

	return (
		<View style={styles.container}>
			<View style={styles.header}>
				<Text style={styles.title}>{t('approvals.title')}</Text>
				<Text style={styles.subtitle}>{t('approvals.subtitle')}</Text>
			</View>
			{error ? <Text style={styles.error}>{error}</Text> : null}
			{loading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
			{!loading && !items.length ? <Text style={styles.empty}>{t('approvals.noTeamsWaiting')}</Text> : null}
			<SectionList
				sections={groupByMonth(items).map((group) => ({
					title: group.monthLabel,
					count: group.items.length,
					data: group.items,
				}))}
				keyExtractor={(item) => item.requestId}
				contentContainerStyle={styles.list}
				renderSectionHeader={({ section }) => (
					<Text style={styles.sectionHeader}>
						{section.title} · {t('approvals.pendingCountInMonth', { count: section.count })}
					</Text>
				)}
				renderItem={({ item }) => (
					<Pressable style={styles.card} onPress={() => { setSelected(item); setRemarks(''); }}>
						<Text style={styles.uid}>{item.schemeUid}</Text>
						<Text style={styles.schemeName}>{item.schemeName}</Text>
						<Text style={styles.meta}>{t('approvals.submittedBy', { name: item.submittedByName, version: item.teamVersion })}</Text>
						<Text style={styles.meta}>{t('approvals.submittedAt', { date: formatExactDateTime(item.submittedAt) })}</Text>
						<Text style={styles.timeAgo}>{formatRelativeTime(item.submittedAt, t)}</Text>
						<Text style={styles.memberSummary}>{item.members.map((member) => `${member.fullName} (${member.teamRole})`).join(', ')}</Text>
						<Text style={styles.reviewHint}>{t('approvals.reviewProposal')}</Text>
					</Pressable>
				)}
			/>

			<Modal visible={selected !== null} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
				<View style={styles.modalBackdrop}>
					<View style={styles.modalCard}>
						<Text style={styles.modalTitle}>{t('approvals.reviewTeam')}</Text>
						<Text style={styles.schemeName}>{selected?.schemeUid}</Text>
						<Text style={styles.meta}>{selected?.schemeName}</Text>
						{selected ? (
							<>
								<Text style={styles.meta}>{t('approvals.submittedAt', { date: formatExactDateTime(selected.submittedAt) })}</Text>
								<Text style={styles.timeAgo}>{formatRelativeTime(selected.submittedAt, t)}</Text>
							</>
						) : null}
						{selected?.members.map((member) => <Text key={member.userId} style={styles.memberLine}>{member.fullName} · {member.teamRole}</Text>)}
						<TextInput
							value={remarks}
							onChangeText={setRemarks}
							placeholder={t('approvals.remarksPlaceholder')}
							placeholderTextColor={colors.textSecondary}
							multiline
							style={styles.remarks}
						/>
						<View style={styles.actions}>
							<Pressable disabled={saving} style={[styles.rejectButton, saving && styles.disabled]} onPress={() => decide('REJECTED')}>
								<Text style={styles.rejectText}>{t('approvals.reject')}</Text>
							</Pressable>
							<Pressable disabled={saving} style={[styles.approveButton, saving && styles.disabled]} onPress={() => decide('APPROVED')}>
								{saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.approveText}>{t('approvals.approve')}</Text>}
							</Pressable>
						</View>
						<Pressable onPress={() => setSelected(null)} style={styles.cancelButton}><Text style={styles.cancelText}>{t('approvals.close')}</Text></Pressable>
					</View>
				</View>
			</Modal>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
	header: { marginBottom: spacing.md },
	title: { color: colors.textPrimary, fontSize: typography.size.xxl, fontWeight: typography.weight.bold },
	subtitle: { color: colors.textSecondary, fontSize: typography.size.sm, lineHeight: typography.lineHeight.md, marginTop: spacing.sm },
	error: { color: colors.error, lineHeight: typography.lineHeight.md, marginBottom: spacing.sm },
	loader: { margin: spacing.xl },
	empty: { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },
	list: { paddingBottom: spacing.xl },
	sectionHeader: {
		color: colors.primaryDark,
		fontSize: typography.size.xs,
		fontWeight: typography.weight.bold,
		textTransform: 'uppercase',
		letterSpacing: 0.5,
		marginTop: spacing.md,
		marginBottom: spacing.sm,
	},
	card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
	uid: { color: colors.primaryDark, fontSize: typography.size.xs, fontWeight: typography.weight.bold },
	schemeName: { color: colors.textPrimary, fontSize: typography.size.md, fontWeight: typography.weight.bold, lineHeight: typography.lineHeight.md, marginTop: spacing.xs },
	timeAgo: { color: colors.primaryDark, fontSize: typography.size.xs, fontWeight: typography.weight.medium, marginTop: spacing.xs / 2 },
	meta: { color: colors.textSecondary, fontSize: typography.size.xs, lineHeight: typography.lineHeight.sm, marginTop: spacing.xs },
	memberSummary: { color: colors.textPrimary, fontSize: typography.size.xs, lineHeight: typography.lineHeight.sm, marginTop: spacing.sm },
	reviewHint: { color: colors.primaryDark, fontSize: typography.size.xs, fontWeight: typography.weight.bold, marginTop: spacing.md },
	modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(27,46,30,0.35)' },
	modalCard: { backgroundColor: colors.background, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg },
	modalTitle: { color: colors.textPrimary, fontSize: typography.size.lg, fontWeight: typography.weight.bold, marginBottom: spacing.md },
	memberLine: { color: colors.textPrimary, fontSize: typography.size.sm, marginTop: spacing.sm },
	remarks: { minHeight: 90, textAlignVertical: 'top', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.sm, color: colors.textPrimary, padding: spacing.md, marginTop: spacing.lg },
	actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
	rejectButton: { flex: 1, alignItems: 'center', borderColor: colors.error, borderWidth: 1, borderRadius: radius.sm, padding: spacing.md },
	rejectText: { color: colors.error, fontWeight: typography.weight.bold },
	approveButton: { flex: 1, alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.sm, padding: spacing.md },
	approveText: { color: colors.white, fontWeight: typography.weight.bold },
	cancelButton: { alignItems: 'center', padding: spacing.md },
	cancelText: { color: colors.textSecondary, fontWeight: typography.weight.medium },
	disabled: { opacity: 0.6 },
});
