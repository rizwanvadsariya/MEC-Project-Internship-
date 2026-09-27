/**
 * Thin wrapper over AsyncStorage for the persisted language preference.
 * Not secret/token-shaped data, so this deliberately does NOT use
 * expo-secure-store (reserved for tokens per architecture.md §4.1 — see
 * mobile/src/auth/secureStorage.ts) — follows the AsyncStorage precedent
 * already established by mobile/src/offline/offlineQueue.ts instead.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupportedLanguage } from './languages';
import { isSupportedLanguage } from './languages';

const LANGUAGE_KEY = '@mec/language';

export async function saveLanguage(language: SupportedLanguage): Promise<void> {
  await AsyncStorage.setItem(LANGUAGE_KEY, language);
}

export async function loadLanguage(): Promise<SupportedLanguage | null> {
  const raw = await AsyncStorage.getItem(LANGUAGE_KEY);
  if (!raw || !isSupportedLanguage(raw)) return null;
  return raw;
}

export async function clearLanguage(): Promise<void> {
  await AsyncStorage.removeItem(LANGUAGE_KEY);
}
