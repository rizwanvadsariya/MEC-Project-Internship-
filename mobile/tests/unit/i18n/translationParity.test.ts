/**
 * Unit: translation-key parity across the 3 resource bundles (phases.md
 * Step 22). Walks en.json's key structure and asserts ur.json/sd.json have
 * exactly the same keys, no empty/whitespace-only values, and flags any
 * ur/sd value that's byte-identical to the English value where the English
 * value contains alphabetic characters (a strong signal of an untranslated
 * stub left in place). Pure data-comparison test, no rendering — matches
 * this project's established "pure logic tests only" precedent (see
 * tests/unit/offline/offlineQueue.test.ts).
 */
'use strict';

import en from '../../../src/i18n/translations/en.json';
import ur from '../../../src/i18n/translations/ur.json';
import sd from '../../../src/i18n/translations/sd.json';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Collects every leaf key path (dot-notation) in a nested JSON object. */
function collectKeyPaths(value: JsonValue, prefix = ''): string[] {
	if (value === null || typeof value !== 'object') return [prefix];
	if (Array.isArray(value)) return [prefix];
	return Object.entries(value).flatMap(([key, child]) =>
		collectKeyPaths(child, prefix ? `${prefix}.${key}` : key),
	);
}

function getAtPath(value: JsonValue, path: string): JsonValue {
	return path.split('.').reduce((current: JsonValue, segment) => {
		if (current === null || typeof current !== 'object' || Array.isArray(current)) return undefined as unknown as JsonValue;
		return (current as Record<string, JsonValue>)[segment];
	}, value);
}

/** Has at least one Unicode letter — used to tell "translate me" strings
 *  apart from punctuation-only / numeric-only / interpolation-only values
 *  that are legitimately identical across languages (e.g. "OK" abbreviations
 *  are still flagged since they do contain letters, by design). */
function hasAlphabeticContent(value: string): boolean {
	return /\p{L}/u.test(value);
}

const enKeyPaths = collectKeyPaths(en as unknown as JsonValue).sort();

/**
 * Language-picker labels are a deliberate, standard exception: every locale
 * shows each language's own endonym in its own script (English always shown
 * as "English", Urdu always as "اردو", Sindhi always as "سنڌي") regardless
 * of which language is currently active — this is how virtually every
 * app's language switcher works, so a user can find their language even if
 * they can't read the current UI language. These 3 keys are therefore
 * correctly identical across en/ur/sd.json, not untranslated stubs.
 */
const INTENTIONALLY_IDENTICAL_KEYS = new Set([
	'languageSettings.english',
	'languageSettings.urdu',
	'languageSettings.sindhi',
]);

describe('translation parity: en/ur/sd', () => {
	test('en.json has a non-trivial number of keys (sanity check the walker itself works)', () => {
		expect(enKeyPaths.length).toBeGreaterThan(100);
	});

	test.each([
		['ur', ur],
		['sd', sd],
	])('%s.json has exactly the same key paths as en.json — no missing, no extra', (_lang, bundle) => {
		const bundleKeyPaths = collectKeyPaths(bundle as unknown as JsonValue).sort();
		const missing = enKeyPaths.filter((key) => !bundleKeyPaths.includes(key));
		const extra = bundleKeyPaths.filter((key) => !enKeyPaths.includes(key));
		expect({ missing, extra }).toEqual({ missing: [], extra: [] });
	});

	test.each([
		['ur', ur],
		['sd', sd],
	])('%s.json has no empty or whitespace-only values', (_lang, bundle) => {
		const blank = enKeyPaths.filter((key) => {
			const value = getAtPath(bundle as unknown as JsonValue, key);
			return typeof value === 'string' && value.trim() === '';
		});
		expect(blank).toEqual([]);
	});

	test.each([
		['ur', ur],
		['sd', sd],
	])('%s.json has no value left byte-identical to the English source where English contains letters', (_lang, bundle) => {
		const untranslated = enKeyPaths.filter((key) => {
			if (INTENTIONALLY_IDENTICAL_KEYS.has(key)) return false;
			const enValue = getAtPath(en as unknown as JsonValue, key);
			const otherValue = getAtPath(bundle as unknown as JsonValue, key);
			if (typeof enValue !== 'string' || typeof otherValue !== 'string') return false;
			if (!hasAlphabeticContent(enValue)) return false;
			return enValue === otherValue;
		});
		expect(untranslated).toEqual([]);
	});
});
