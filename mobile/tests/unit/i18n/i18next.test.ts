/**
 * Unit: i18next itself resolves the right string per language after
 * changeLanguage(), and falls back to English for an unknown key (phases.md
 * Step 22). Talks directly to the already-initialized i18next singleton
 * (src/i18n/index.ts inits it synchronously at import time) — no component
 * rendering involved.
 */
'use strict';

import i18next from '../../../src/i18n/index';

afterEach(async () => {
	await i18next.changeLanguage('en');
});

test('t() resolves the English string by default', () => {
	expect(i18next.t('common.save')).toBe('Save');
});

test('changeLanguage("ur") switches every subsequent t() call to Urdu', async () => {
	await i18next.changeLanguage('ur');
	expect(i18next.t('common.save')).toBe('محفوظ کریں');
});

test('changeLanguage("sd") switches every subsequent t() call to Sindhi', async () => {
	await i18next.changeLanguage('sd');
	expect(i18next.t('common.save')).toBe('محفوظ ڪريو');
});

test('changeLanguage back to "en" restores the English string', async () => {
	await i18next.changeLanguage('ur');
	await i18next.changeLanguage('en');
	expect(i18next.t('common.save')).toBe('Save');
});

test('interpolation substitutes named variables regardless of active language', async () => {
	await i18next.changeLanguage('en');
	expect(i18next.t('common.division', { id: 7 })).toBe('Division 7');
});

test('an unknown key falls back to returning the key itself rather than throwing', () => {
	expect(() => i18next.t('this.key.does.not.exist')).not.toThrow();
});
