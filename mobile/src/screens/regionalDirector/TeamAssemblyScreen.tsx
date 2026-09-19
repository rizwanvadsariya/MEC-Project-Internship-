import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { useAuth } from '../../auth/useAuth';
import { createTeam, listEligibleMembers, submitTeam, type EligibleMember } from '../../api/teams.api';
import { colors, radius, spacing, typography } from '../../theme';

type RouteParams = { schemeId: number };

export default function TeamAssemblyScreen() {
	const { accessToken } = useAuth();
	const { params } = useRoute<{ key: string; name: string; params: RouteParams }>();
	const [members, setMembers] = useState<EligibleMember[]>([]);
	const [leadMeoId, setLeadMeoId] = useState('');
	const [supportingIds, setSupportingIds] = useState<string[]>([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState('');
	const [error, setError] = useState('');

	useEffect(() => {
		if (!accessToken) return;
		listEligibleMembers(accessToken)
			.then(setMembers)
			.catch((err) => setError(err instanceof Error ? err.message : 'Could not load eligible MEOs.'))
			.finally(() => setLoading(false));
	}, [accessToken]);

	const toggleSupporting = (id: string) => {
		setSupportingIds((current) => current.includes(id) ? current.filter((memberId) => memberId !== id) : [...current, id]);
	};

	const createAndSubmit = async () => {
		if (!accessToken || !leadMeoId) {
			setError('Select a lead MEO before submitting.');
			return;
		}
		setSaving(true);
		setError('');
		setMessage('');
		try {
			const team = await createTeam({ schemeId: params.schemeId, leadMeoId, supportingMemberIds: supportingIds }, accessToken);
			await submitTeam(team.id, accessToken);
			setMessage('Team submitted for DG approval.');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Could not submit the team.');
		} finally {
			setSaving(false);
		}
	};

	return (
		<ScrollView contentContainerStyle={styles.container}>
			<Text style={styles.eyebrow}>Team assembly</Text>
			<Text style={styles.title}>Build a monitoring team</Text>
			<Text style={styles.subtitle}>Scheme #{params.schemeId} · Select one lead MEO and any supporting MEOs or support staff.</Text>
			{error ? <Text style={styles.error}>{error}</Text> : null}
			{message ? <Text style={styles.success}>{message}</Text> : null}
			{loading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
			{!loading && !members.length ? <Text style={styles.empty}>No active MEOs or support users are available in your division.</Text> : null}
			{members.map((member) => {
				const isLead = member.id === leadMeoId;
				const isSupporting = supportingIds.includes(member.id);
				const canLead = member.role === 'MEO';
				return (
					<View key={member.id} style={styles.memberCard}>
						<View style={styles.memberInfo}>
							<Text style={styles.memberName}>{member.fullName}</Text>
							<Text style={styles.memberEmail}>{member.email}</Text>
							<Text style={styles.memberRole}>{member.role === 'MEO' ? 'MEO' : 'Support user'}</Text>
						</View>
						<View style={styles.actions}>
							{canLead ? <Pressable style={[styles.roleButton, isLead && styles.selectedLead]} onPress={() => setLeadMeoId(isLead ? '' : member.id)}>
								<Text style={[styles.roleText, isLead && styles.selectedText]}>Lead MEO</Text>
							</Pressable> : null}
							<Pressable style={[styles.roleButton, isSupporting && styles.selectedSupport]} onPress={() => toggleSupporting(member.id)}>
								<Text style={[styles.roleText, isSupporting && styles.selectedText]}>Support</Text>
							</Pressable>
						</View>
					</View>
				);
			})}
			<Pressable disabled={saving} style={[styles.submitButton, saving && styles.disabled]} onPress={createAndSubmit}>
				{saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.submitText}>Submit for DG approval</Text>}
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
});
