/** Email/password -> AuthProvider.signIn. Backend applies its own rate limits
 *  and lockout policy (Memory.md "Supabase Auth setup" points #5/#8). */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ApiClientError } from '../../api/client';
import { apiBaseUrl } from '../../api/client';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setSubmitting(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
    } catch (e) {
      if (e instanceof ApiClientError) setError(e.message);
      else setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <Text style={styles.title}>Smart Provincial M&E</Text>
        <Text style={styles.subtitle}>Sindh Secretariat — Scheme Monitoring</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@mec.local"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            editable={!submitting}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            editable={!submitting}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.button, submitting && styles.buttonDisabled]}
            onPress={onSubmit}
            disabled={submitting}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Log in</Text>}
          </Pressable>
        </View>

        <Text style={styles.hint}>API: {apiBaseUrl}</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#0b1220' },
  title: { fontSize: 24, fontWeight: '700', color: '#fff', textAlign: 'center' },
  subtitle: { fontSize: 13, color: '#94a3b8', textAlign: 'center', marginTop: 4, marginBottom: 32 },
  form: { backgroundColor: '#111827', borderRadius: 12, padding: 20 },
  label: { color: '#cbd5e1', fontSize: 13, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: '#1f2937',
    color: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  error: { color: '#f87171', marginTop: 14, fontSize: 13 },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  hint: { color: '#475569', fontSize: 11, textAlign: 'center', marginTop: 16 },
});
