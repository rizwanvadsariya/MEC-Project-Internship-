/**
 * Self-service TOTP enrollment (hardening point #7). No QR image library is
 * used — the secret is shown as plain text for manual entry ("enter setup
 * key" in any authenticator app), keeping this screen dependency-free.
 * Available to every role — MFA_ENFORCEMENT_ENABLED (currently off) is what
 * actually makes it *required* for DG/RD; anyone can opt in early.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ApiClientError } from '../../api/client';
import * as mfaApi from '../../api/mfa.api';

type Stage = 'loading' | 'off' | 'enrolling' | 'on';

export default function SecuritySettingsScreen() {
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
      setError(e instanceof ApiClientError ? e.message : 'Could not start enrollment.');
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async () => {
    if (!accessToken || !factorId) return;
    setError(null);
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setBusy(true);
    try {
      const { id: challengeId } = await mfaApi.challenge(accessToken, factorId);
      const { session } = await mfaApi.verify(accessToken, factorId, challengeId, code.trim());
      await updateSession(session);
      setCode('');
      setStage('on');
      Alert.alert('Two-factor authentication enabled');
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Verification failed.');
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
      setError(e instanceof ApiClientError ? e.message : 'Could not remove two-factor authentication.');
    } finally {
      setBusy(false);
    }
  };

  if (stage === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#2563eb" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.title}>Two-factor authentication</Text>

      {stage === 'on' && (
        <>
          <Text style={styles.status}>✅ Enabled</Text>
          <Pressable style={[styles.button, styles.dangerButton]} onPress={removeMfa} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Remove two-factor authentication</Text>}
          </Pressable>
        </>
      )}

      {stage === 'off' && (
        <>
          <Text style={styles.status}>❌ Not enabled</Text>
          <Pressable style={styles.button} onPress={startEnroll} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Enable two-factor authentication</Text>}
          </Pressable>
        </>
      )}

      {stage === 'enrolling' && secret && (
        <View>
          <Text style={styles.instructions}>
            1. Open your authenticator app (Google Authenticator, Authy, etc.){'\n'}
            2. Choose &ldquo;Enter a setup key&rdquo; (manual entry){'\n'}
            3. Account: your email · Key: below · Type: Time-based
          </Text>
          <View style={styles.secretBox}>
            <Text selectable style={styles.secretText}>{secret}</Text>
          </View>
          {uri ? <Text selectable style={styles.uriText}>{uri}</Text> : null}

          <Text style={styles.label}>Enter the 6-digit code it shows:</Text>
          <TextInput
            style={styles.codeInput}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="123456"
          />
          <Pressable style={styles.button} onPress={confirmCode} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify & enable</Text>}
          </Pressable>
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1220' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b1220' },
  title: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 12 },
  status: { color: '#cbd5e1', fontSize: 15, marginBottom: 16 },
  instructions: { color: '#94a3b8', fontSize: 13, lineHeight: 20, marginBottom: 14 },
  secretBox: { backgroundColor: '#1f2937', borderRadius: 8, padding: 14, marginBottom: 10 },
  secretText: { color: '#fff', fontSize: 16, fontFamily: 'monospace', letterSpacing: 1 },
  uriText: { color: '#475569', fontSize: 10, marginBottom: 16 },
  label: { color: '#cbd5e1', fontSize: 13, marginTop: 8, marginBottom: 6 },
  codeInput: {
    backgroundColor: '#1f2937',
    color: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 18,
    letterSpacing: 4,
    textAlign: 'center',
    marginBottom: 16,
  },
  button: { backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  dangerButton: { backgroundColor: '#7f1d1d' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  error: { color: '#f87171', marginTop: 14, fontSize: 13 },
});
