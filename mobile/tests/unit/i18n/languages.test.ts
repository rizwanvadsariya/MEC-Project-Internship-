/**
 * Unit: pure language-code logic in languages.ts (phases.md Step 22) —
 * isRtlLanguage, mapLocaleToSupportedLanguage, isSupportedLanguage. No
 * rendering, no mocks needed — these are plain exported functions.
 */
'use strict';

import {
	DEFAULT_LANGUAGE,
	SUPPORTED_LANGUAGES,
	isRtlLanguage,
	isSupportedLanguage,
	mapLocaleToSupportedLanguage,
} from '../../../src/i18n/languages';

describe('isRtlLanguage', () => {
	test('Urdu and Sindhi are RTL', () => {
		expect(isRtlLanguage('ur')).toBe(true);
		expect(isRtlLanguage('sd')).toBe(true);
	});

	test('English is not RTL', () => {
		expect(isRtlLanguage('en')).toBe(false);
	});
});

describe('isSupportedLanguage', () => {
	test.each(SUPPORTED_LANGUAGES)('"%s" is supported', (lang) => {
		expect(isSupportedLanguage(lang)).toBe(true);
	});

	test('an arbitrary unsupported code is rejected', () => {
		expect(isSupportedLanguage('fr')).toBe(false);
		expect(isSupportedLanguage('')).toBe(false);
	});
});

describe('mapLocaleToSupportedLanguage', () => {
	test('maps a bare supported code', () => {
		expect(mapLocaleToSupportedLanguage('ur')).toBe('ur');
		expect(mapLocaleToSupportedLanguage('sd')).toBe('sd');
		expect(mapLocaleToSupportedLanguage('en')).toBe('en');
	});

	test('maps a locale tag with a region subtag by its primary subtag', () => {
		expect(mapLocaleToSupportedLanguage('ur-PK')).toBe('ur');
		expect(mapLocaleToSupportedLanguage('en-US')).toBe('en');
	});

	test('is case-insensitive', () => {
		expect(mapLocaleToSupportedLanguage('UR-PK')).toBe('ur');
	});

	test('falls back to the default language for an unsupported locale', () => {
		expect(mapLocaleToSupportedLanguage('fr-FR')).toBe(DEFAULT_LANGUAGE);
	});

	test('falls back to the default language for null/undefined/empty input, never throws', () => {
		expect(mapLocaleToSupportedLanguage(null)).toBe(DEFAULT_LANGUAGE);
		expect(mapLocaleToSupportedLanguage(undefined)).toBe(DEFAULT_LANGUAGE);
		expect(mapLocaleToSupportedLanguage('')).toBe(DEFAULT_LANGUAGE);
	});
});
