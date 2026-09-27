/**
 * Pure, dependency-free language-code logic — kept separate from
 * LanguageProvider.tsx/index.ts so it's directly unit-testable without
 * rendering anything (the mobile test suite has no component-render tests,
 * see Memory.md's established "pure logic tests only" precedent).
 */

export const SUPPORTED_LANGUAGES = ['en', 'ur', 'sd'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

/** Urdu and Sindhi are both right-to-left scripts; English is left-to-right. */
const RTL_LANGUAGES = new Set<SupportedLanguage>(['ur', 'sd']);

export function isSupportedLanguage(value: string): value is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

export function isRtlLanguage(language: SupportedLanguage): boolean {
  return RTL_LANGUAGES.has(language);
}

/**
 * Maps a device/browser locale tag (e.g. "ur-PK", "sd", "en-US", "fr-FR") to
 * one of our 3 supported languages, defaulting to English for anything else.
 * Only looks at the primary subtag (before the first "-"), case-insensitive.
 */
export function mapLocaleToSupportedLanguage(localeTag: string | null | undefined): SupportedLanguage {
  if (!localeTag) return DEFAULT_LANGUAGE;
  const primary = localeTag.split('-')[0]?.toLowerCase();
  if (primary && isSupportedLanguage(primary)) return primary;
  return DEFAULT_LANGUAGE;
}
