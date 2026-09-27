/**
 * i18next setup: 3 resource bundles (en/ur/sd), fallback 'en'. Initial
 * language is device-detected via expo-localization, but LanguageProvider
 * overrides it with the persisted user choice (if any) once hydration runs —
 * see LanguageProvider.tsx. i18next itself is initialized synchronously at
 * import time so `t(...)` is always safe to call from the very first render,
 * same way `theme/index.ts` is a static import used everywhere.
 */
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import en from './translations/en.json';
import ur from './translations/ur.json';
import sd from './translations/sd.json';
import { DEFAULT_LANGUAGE, mapLocaleToSupportedLanguage } from './languages';

export function detectDeviceLanguage(): ReturnType<typeof mapLocaleToSupportedLanguage> {
  try {
    const [locale] = Localization.getLocales();
    return mapLocaleToSupportedLanguage(locale?.languageTag ?? locale?.languageCode ?? null);
  } catch {
    // expo-localization should never throw, but this project's own
    // established pattern is to never let a device-info lookup crash a
    // render — degrade to the default language instead.
    return DEFAULT_LANGUAGE;
  }
}

if (!i18next.isInitialized) {
  // eslint-disable-next-line import/no-named-as-default-member -- this is i18next's own documented chained-init API (i18next.use(...).init(...)), not an accidental collision with the named `use` export.
  void i18next.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      ur: { translation: ur },
      sd: { translation: sd },
    },
    lng: detectDeviceLanguage(),
    fallbackLng: DEFAULT_LANGUAGE,
    interpolation: { escapeValue: false },
  });
}

export default i18next;
