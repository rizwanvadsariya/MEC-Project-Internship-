/**
 * Holds the active language + RTL state, mirroring AuthProvider.tsx's exact
 * shape (context + provider + useMemo'd value, a hook that throws outside the
 * provider, hydration via an async IIFE in useEffect, persistence delegated
 * to a separate thin storage module rather than inlined here).
 *
 * Hydration order: persisted choice (languageStorage) wins if one exists,
 * otherwise falls back to the device-detected language i18n/index.ts already
 * initialized i18next with.
 *
 * RTL direction changes take effect live: App.tsx keys its
 * NavigationContainer on `isRTL`, forcing a remount of the whole navigation
 * tree whenever it flips, so I18nManager.forceRTL's new direction applies to
 * freshly created native views immediately — no app restart needed.
 */
import React, { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { I18nManager } from 'react-native';
import i18next, { detectDeviceLanguage } from './index';
import { loadLanguage, saveLanguage } from './languageStorage';
import { isRtlLanguage, type SupportedLanguage } from './languages';

type LanguageContextValue = {
  isLoading: boolean;
  language: SupportedLanguage;
  isRTL: boolean;
  setLanguage: (language: SupportedLanguage) => Promise<void>;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: PropsWithChildren) {
  const [isLoading, setIsLoading] = useState(true);
  const [language, setLanguageState] = useState<SupportedLanguage>(detectDeviceLanguage());

  useEffect(() => {
    (async () => {
      const persisted = await loadLanguage();
      const initial = persisted ?? detectDeviceLanguage();
      setLanguageState(initial);
      await i18next.changeLanguage(initial);
      applyRtlForLanguage(initial);
      setIsLoading(false);
    })();
  }, []);

  const setLanguage = async (next: SupportedLanguage) => {
    await i18next.changeLanguage(next);
    await saveLanguage(next);
    applyRtlForLanguage(next);
    setLanguageState(next);
  };

  const value = useMemo(
    () => ({ isLoading, language, isRTL: isRtlLanguage(language), setLanguage }),
    [isLoading, language],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

function applyRtlForLanguage(language: SupportedLanguage) {
  const shouldBeRtl = isRtlLanguage(language);
  I18nManager.allowRTL(shouldBeRtl);
  if (I18nManager.isRTL !== shouldBeRtl) I18nManager.forceRTL(shouldBeRtl);
}

export function useLanguageContext(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguageContext must be used within a LanguageProvider');
  return ctx;
}
