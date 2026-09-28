/**
 * Self-service TOTP enrollment (hardening point #7). No QR image library is
 * used — the secret is shown as plain text for manual entry ("enter setup
 * key" in any authenticator app), keeping this screen dependency-free.
 * Available to every role — MFA_ENFORCEMENT_ENABLED (currently off) is what
 * actually makes it *required* for DG/RD; anyone can opt in early.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/useAuth';
import * as mfaApi from '../../api/mfa.api';
import { ApiClientError } from '../../api/client';
import { translateApiError } from '../../i18n/apiErrors';
import { colors, radius, spacing, typography } from '../../theme';

type Stage = 'loading' | 'off' | 'enrolling' | 'on';

export default function SecuritySettingsScreen() {
  const { t } = useTranslation();
  const { accessToken, updateSession } = useAuth();
  const [stage, setStage] = useState<Stage>('loading');
  const [factorId, setFactorId] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    mfaApi
      .listFactors(accessToken)
      .then(({ all }) => {
        if (cancelled) return;
        setStage(all.some((f) => f.status === 'verified') ? 'on' : 'off');
      })
      .catch(() => {
        if (!cancelled) setStage('off');
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const startEnroll = async () => {
    if (!accessToken) return;
    setError(null);
    setBusy(true);
    try {
      const factor = await mfaApi.enroll(accessToken);
      setFactorId(factor.id);
      setSecret(factor.totp.secret);
      setUri(factor.totp.uri);
      setStage('enrolling');
    } catch (e) {
      setError(e instanceof ApiClientError ? translateApiError(t, e, t('security.couldNotStartEnrollment')) : t('security.couldNotStartEnrollment'));
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async () => {
    if (!accessToken || !factorId) return;
    setError(null);
    if (!/^\d{6}$/.test(code.trim())) {
      setError(t('security.enterValidCode'));
      return;
    }
    setBusy(true);
    try {
      const { id: challengeId } = await mfaApi.challenge(accessToken, factorId);
      const { session } = await mfaApi.verify(accessToken, factorId, challengeId, code.trim());
      await updateSession(session);
      setCode('');
      setStage('on');
      Alert.alert(t('security.mfaEnabledAlert'));
    } catch (e) {
      setError(e instanceof ApiClientError ? translateApiError(t, e, t('security.verificationFailed')) : t('security.verificationFailed'));
    } finally {
      setBusy(false);
    }
  };

  const removeMfa = async () => {
    if (!accessToken) return;
    setBusy(true);
    try {
      const { all } = await mfaApi.listFactors(accessToken);
      for (const f of all) await mfaApi.unenroll(accessToken, f.id);
      setStage('off');
    } catch (e) {
      setError(e instanceof ApiClientError ? translateApiError(t, e, t('security.couldNotRemove')) : t('security.couldNotRemove'));
    } finally {
      setBusy(false);
    }
  };

  if (stage === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.title}>{t('security.title')}</Text>

      {stage === 'on' && (
        <>
          <Text style={styles.status}>{t('security.enabled')}</Text>
          <Pressable style={[styles.button, styles.dangerButton]} onPress={removeMfa} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('security.removeButton')}</Text>}
          </Pressable>
        </>
      )}

      {stage === 'off' && (
        <>
          <Text style={styles.status}>{t('security.notEnabled')}</Text>
          <Pressable style={styles.button} onPress={startEnroll} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('security.enableButton')}</Text>}
          </Pressable>
        </>
      )}

      {stage === 'enrolling' && secret && (
        <View>
          <Text style={styles.instructions}>{t('security.instructions')}</Text>
          <View style={styles.secretBox}>
            <Text selectable style={styles.secretText}>{secret}</Text>
          </View>
          {uri ? <Text selectable style={styles.uriText}>{uri}</Text> : null}

          <Text style={styles.label}>{t('security.enterCodeLabel')}</Text>
          <TextInput
            style={styles.codeInput}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
            placeholder={t('security.codePlaceholder')}
          />
          <Pressable style={styles.button} onPress={confirmCode} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('security.verifyButton')}</Text>}
          </Pressable>
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  title: {
    color: colors.textPrimary,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    marginBottom: spacing.md,
  },
  status: { color: colors.textSecondary, fontSize: typography.size.md, marginBottom: spacing.md },
  instructions: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.md,
    marginBottom: spacing.md,
  },
  secretBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.md - 2,
    marginBottom: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secretText: { color: colors.textPrimary, fontSize: 16, fontFamily: 'monospace', letterSpacing: 1 },
  uriText: { color: colors.textSecondary, fontSize: 10, marginBottom: spacing.md },
  label: { color: colors.textSecondary, fontSize: typography.size.sm, marginTop: spacing.sm, marginBottom: spacing.xs + 2 },
  codeInput: {
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 18,
    letterSpacing: 4,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: spacing.md - 4,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  dangerButton: { backgroundColor: colors.error },
  buttonText: { color: colors.white, fontWeight: typography.weight.medium, fontSize: typography.size.md },
  error: { color: colors.error, marginTop: spacing.md, fontSize: typography.size.sm },
});
