import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/useAuth';
import { provisionUser } from '../../api/auth.api';
import TextField from '../../components/common/TextField';
import PrimaryButton from '../../components/common/PrimaryButton';
import Card from '../../components/common/Card';
import { colors, radius, spacing, typography } from '../../theme';

type MemberRole = 'MEO' | 'SUPPORT_USER';

export default function CreateTeamMemberScreen() {
  const { t } = useTranslation();
  const { accessToken, user } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<MemberRole>('MEO');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    if (!accessToken || !user || !fullName.trim() || !email.trim()) return;
    setBusy(true);
    setError('');
    setMessage('');
    setInviteLink('');
    try {
      const result = await provisionUser(accessToken, {
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        role,
        divisionIds: user.divisionIds?.length ? user.divisionIds : [user.divisionId as number],
      });
      setMessage(t('teamMember.created'));
      if (result.inviteLink) setInviteLink(result.inviteLink);
      setFullName('');
      setEmail('');
      setPhone('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('teamMember.createFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{t('teamMember.title')}</Text>
      <Text style={styles.subtitle}>{t('teamMember.subtitle')}</Text>
      <Card style={styles.card}>
        <TextField
          label={t('teamMember.fullName')}
          value={fullName}
          onChangeText={setFullName}
          placeholder={t('teamMember.fullNamePlaceholder')}
          icon="person-outline"
        />
        <View style={styles.fieldGap} />
        <TextField
          label={t('teamMember.email')}
          value={email}
          onChangeText={setEmail}
          placeholder={t('teamMember.emailPlaceholder')}
          autoCapitalize="none"
          keyboardType="email-address"
          icon="mail-outline"
        />
        <View style={styles.fieldGap} />
        <TextField
          label={t('teamMember.phone')}
          value={phone}
          onChangeText={setPhone}
          placeholder={t('teamMember.phonePlaceholder')}
          keyboardType="phone-pad"
          icon="call-outline"
        />
        <Text style={styles.label}>{t('teamMember.role')}</Text>
        <View style={styles.roleRow}>
          {(['MEO', 'SUPPORT_USER'] as MemberRole[]).map((item) => (
            <Pressable key={item} onPress={() => setRole(item)} style={[styles.roleButton, role === item && styles.roleButtonSelected]}>
              <Text style={[styles.roleText, role === item && styles.roleTextSelected]}>{t(`teamMember.roles.${item}`)}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.note}>{t('teamMember.divisionNote')}</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {message ? <Text style={styles.success}>{message}</Text> : null}
        {inviteLink ? <Text selectable style={styles.invite}>{t('teamMember.inviteLink', { link: inviteLink })}</Text> : null}
        <PrimaryButton
          label={t('teamMember.create')}
          onPress={() => void submit()}
          disabled={!fullName.trim() || !email.trim()}
          loading={busy}
          style={styles.submit}
        />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: spacing.lg, backgroundColor: colors.background },
  title: { color: colors.textPrimary, fontSize: typography.size.xxl, fontWeight: typography.weight.bold },
  subtitle: { color: colors.textSecondary, fontSize: typography.size.sm, marginTop: spacing.xs, marginBottom: spacing.lg },
  card: { gap: 0 },
  fieldGap: { height: spacing.md },
  label: { color: colors.primaryDark, fontSize: typography.size.sm, fontWeight: typography.weight.bold, marginTop: spacing.md, marginBottom: spacing.xs },
  roleRow: { flexDirection: 'row', gap: spacing.sm },
  roleButton: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  roleButtonSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  roleText: { color: colors.primaryDark, fontWeight: typography.weight.medium },
  roleTextSelected: { color: colors.white },
  note: { color: colors.textSecondary, fontSize: typography.size.xs, marginTop: spacing.md },
  error: { color: colors.error, marginTop: spacing.md },
  success: { color: colors.success, marginTop: spacing.md },
  invite: { color: colors.primaryDark, fontSize: typography.size.xs, marginTop: spacing.sm },
  submit: { marginTop: spacing.lg },
});