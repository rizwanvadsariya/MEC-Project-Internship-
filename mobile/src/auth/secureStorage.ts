/**
 * Thin wrapper over expo-secure-store for the auth session (architecture.md
 * §4.1 — never AsyncStorage for anything token-shaped).
 */
import * as SecureStore from 'expo-secure-store';

const SESSION_KEY = 'mec.session';

export type StoredSession = {
  accessToken: string;
  refreshToken: string;
  userId: string;
  email: string;
};

export async function saveSession(session: StoredSession): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function loadSession(): Promise<StoredSession | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}
