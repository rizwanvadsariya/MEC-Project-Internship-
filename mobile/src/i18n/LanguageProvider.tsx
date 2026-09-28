/**
 * Holds the active language + RTL state, mirroring AuthProvider.tsx's exact
 * shape (context + provider + useMemo'd value, a hook that throws outside the
 * provider, hydration via an async IIFE in useEffect, persistence delegated
 * to a separate thin storage module rather than inlined here).
 *
 * Hydration order: persisted choice (languageStorage) wins if one exists,
 * otherwise falls back to the device-detected language i18n/index.ts already
 * initialized i18next with.
 */
import React, { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { I18nManager } from 'react-native';
import i18next, { detectDeviceLanguage } from './index';
import { loadLanguage, saveLanguage } from './languageStorage';
import { isRtlLanguage, type SupportedLanguage } from './languages';
import { attemptRtlReload } from './rtlReload';

type LanguageContextValue = {
  isLoading: boolean;
  language: SupportedLanguage;
  isRTL: boolean;
  /** True once a language switch changed RTL direction and a restart is
   *  needed for it to fully take visual effect (see rtlReload.ts). Cleared
   *  the next time the provider mounts. */
  restartNeeded: boolean;
  setLanguage: (language: SupportedLanguage) => Promise<void>;
  /** Attempts an app reload (expo-updates, if available) to apply a pending
   *  RTL direction change immediately. Returns false if the caller should
   *  instead tell the user to close and reopen the app manually. */
  restartNow: () => Promise<boolean>;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: PropsWithChildren) {
  const [isLoading, setIsLoading] = useState(true);
  const [language, setLanguageState] = useState<SupportedLanguage>(detectDeviceLanguage());
  const [restartNeeded, setRestartNeeded] = useState(false);

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
    const rtlChanged = isRtlLanguage(next) !== isRtlLanguage(language);
    await i18next.changeLanguage(next);
    await saveLanguage(next);
    setLanguageState(next);
    if (rtlChanged) {
      applyRtlForLanguage(next);
      setRestartNeeded(true);
    }
  };

  const restartNow = async () => {
    const reloaded = await attemptRtlReload();
    if (reloaded) setRestartNeeded(false);
    return reloaded;
  };

  const value = useMemo(
    () => ({ isLoading, language, isRTL: isRtlLanguage(language), restartNeeded, setLanguage, restartNow }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setLanguage/restartNow close over `language`, already a dep
    [isLoading, language, restartNeeded],
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
