import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/useAuth';
import { createTeam, listEligibleMembers, submitTeam, type EligibleMember } from '../../api/teams.api';
import { colors, radius, spacing, typography } from '../../theme';

type RouteParams = { schemeId: number };

export default function TeamAssemblyScreen() {
	const { t } = useTranslation();
	const { accessToken } = useAuth();
	const { params } = useRoute<{ key: string; name: string; params: RouteParams }>();
	const [members, setMembers] = useState<EligibleMember[]>([]);
	const [leadMeoId, setLeadMeoId] = useState('');
	const [supportingIds, setSupportingIds] = useState<string[]>([]);
	const [includeSelf, setIncludeSelf] = useState(false);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState('');
	const [error, setError] = useState('');

	useEffect(() => {
		if (!accessToken) return;
		listEligibleMembers(accessToken)
			.then(setMembers)
			.catch((err) => setError(err instanceof Error ? err.message : t('teams.couldNotLoadMembers')))
			.finally(() => setLoading(false));
	}, [accessToken, t]);

	const toggleSupporting = (id: string) => {
		setSupportingIds((current) => current.includes(id) ? current.filter((memberId) => memberId !== id) : [...current, id]);
	};

	const createAndSubmit = async () => {
		if (!accessToken || !leadMeoId) {
			setError(t('teams.selectLeadMeoFirst'));
			return;
		}
		setSaving(true);
		setError('');
		setMessage('');
		try {
			const team = await createTeam({ schemeId: params.schemeId, leadMeoId, supportingMemberIds: supportingIds, includeSelf }, accessToken);
			await submitTeam(team.id, accessToken);
			setMessage(t('teams.submittedMessage'));
		} catch (err) {
			setError(err instanceof Error ? err.message : t('teams.couldNotSubmit'));
		} finally {
			setSaving(false);
		}
	};

	return (
		<ScrollView contentContainerStyle={styles.container}>
			<Text style={styles.eyebrow}>{t('teams.eyebrow')}</Text>
			<Text style={styles.title}>{t('teams.title')}</Text>
			<Text style={styles.subtitle}>{t('teams.subtitle', { schemeId: params.schemeId })}</Text>
			{error ? <Text style={styles.error}>{error}</Text> : null}
			{message ? <Text style={styles.success}>{message}</Text> : null}
			{loading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
			{!loading && !members.length ? <Text style={styles.empty}>{t('teams.noEligibleMembers')}</Text> : null}
			{members.map((member) => {
				const isLead = member.id === leadMeoId;
				const isSupporting = supportingIds.includes(member.id);
				const canLead = member.role === 'MEO';
				return (
					<View key={member.id} style={styles.memberCard}>
						<View style={styles.memberInfo}>
							<Text style={styles.memberName}>{member.fullName}</Text>
							<Text style={styles.memberEmail}>{member.email}</Text>
							<Text style={styles.memberRole}>{member.role === 'MEO' ? t('teams.meoLabel') : t('teams.supportUserLabel')}</Text>
						</View>
						<View style={styles.actions}>
							{canLead ? <Pressable style={[styles.roleButton, isLead && styles.selectedLead]} onPress={() => setLeadMeoId(isLead ? '' : member.id)}>
								<Text style={[styles.roleText, isLead && styles.selectedText]}>{t('teams.leadMeo')}</Text>
							</Pressable> : null}
							<Pressable style={[styles.roleButton, isSupporting && styles.selectedSupport]} onPress={() => toggleSupporting(member.id)}>
								<Text style={[styles.roleText, isSupporting && styles.selectedText]}>{t('teams.support')}</Text>
							</Pressable>
						</View>
					</View>
				);
			})}
			<Pressable style={styles.selfRow} onPress={() => setIncludeSelf((current) => !current)}>
				<View style={[styles.checkbox, includeSelf && styles.checkboxChecked]}>
					{includeSelf ? <Text style={styles.checkboxMark}>✓</Text> : null}
				</View>
				<View style={styles.selfText}>
					<Text style={styles.selfLabel}>{t('teams.addMyself')}</Text>
					<Text style={styles.selfHint}>{t('teams.addMyselfHint')}</Text>
				</View>
			</Pressable>
			<Pressable disabled={saving} style={[styles.submitButton, saving && styles.disabled]} onPress={createAndSubmit}>
				{saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.submitText}>{t('teams.submitForApproval')}</Text>}
			</Pressable>
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	container: { flexGrow: 1, backgroundColor: colors.background, padding: spacing.lg },
	eyebrow: { color: colors.primaryDark, fontSize: typography.size.xs, fontWeight: typography.weight.bold, letterSpacing: 0.8, textTransform: 'uppercase' },
	title: { color: colors.textPrimary, fontSize: typography.size.xxl, fontWeight: typography.weight.bold, marginTop: spacing.sm },
	subtitle: { color: colors.textSecondary, fontSize: typography.size.sm, lineHeight: typography.lineHeight.md, marginTop: spacing.sm, marginBottom: spacing.lg },
	error: { color: colors.error, lineHeight: typography.lineHeight.md, marginBottom: spacing.md },
	success: { color: colors.success, fontWeight: typography.weight.bold, marginBottom: spacing.md },
	loader: { margin: spacing.xl },
	empty: { color: colors.textSecondary, textAlign: 'center', marginVertical: spacing.xl },
	memberCard: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, padding: spacing.md, marginBottom: spacing.sm },
	memberInfo: { flex: 1, paddingRight: spacing.sm },
	memberName: { color: colors.textPrimary, fontSize: typography.size.md, fontWeight: typography.weight.bold },
	memberEmail: { color: colors.textSecondary, fontSize: typography.size.xs, marginTop: spacing.xs },
	memberRole: { color: colors.primaryDark, fontSize: typography.size.xs, fontWeight: typography.weight.bold, marginTop: spacing.xs },
	actions: { gap: spacing.xs },
	roleButton: { borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
	selectedLead: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
	selectedSupport: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
	roleText: { color: colors.primaryDark, fontSize: typography.size.xs, fontWeight: typography.weight.medium },
	selectedText: { color: colors.white },
	submitButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.sm, marginTop: spacing.lg, padding: spacing.md },
	submitText: { color: colors.white, fontSize: typography.size.md, fontWeight: typography.weight.bold },
	disabled: { opacity: 0.6 },
	selfRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, padding: spacing.md, marginTop: spacing.md },
	checkbox: { width: 22, height: 22, borderRadius: radius.sm, borderColor: colors.border, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm },
	checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
	checkboxMark: { color: colors.white, fontSize: typography.size.xs, fontWeight: typography.weight.bold },
	selfText: { flex: 1 },
	selfLabel: { color: colors.textPrimary, fontSize: typography.size.sm, fontWeight: typography.weight.bold },
	selfHint: { color: colors.textSecondary, fontSize: typography.size.xs, marginTop: spacing.xs, lineHeight: typography.lineHeight.sm },
});
