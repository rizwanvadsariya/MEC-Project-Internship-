/**
 * Unit: save/load/clear round-trip for the persisted language preference
 * (phases.md Step 22), mirroring offlineQueue.test.ts's AsyncStorage mocking
 * style (Map-backed fake, no real device storage touched).
 */
'use strict';

let mockBackingStore: Map<string, string>;

jest.mock('@react-native-async-storage/async-storage', () => ({
	getItem: jest.fn((key: string) => Promise.resolve(mockBackingStore.get(key) ?? null)),
	setItem: jest.fn((key: string, value: string) => {
		mockBackingStore.set(key, value);
		return Promise.resolve();
	}),
	removeItem: jest.fn((key: string) => {
		mockBackingStore.delete(key);
		return Promise.resolve();
	}),
}));

type LanguageStorageModule = typeof import('../../../src/i18n/languageStorage');
let languageStorage: LanguageStorageModule;

beforeEach(() => {
	mockBackingStore = new Map();
	jest.resetModules();
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	languageStorage = require('../../../src/i18n/languageStorage');
});

test('loadLanguage returns null when nothing has been saved yet', async () => {
	expect(await languageStorage.loadLanguage()).toBeNull();
});

test('saveLanguage then loadLanguage round-trips the chosen language', async () => {
	await languageStorage.saveLanguage('ur');
	expect(await languageStorage.loadLanguage()).toBe('ur');
});

test('saveLanguage overwrites a previously saved language', async () => {
	await languageStorage.saveLanguage('ur');
	await languageStorage.saveLanguage('sd');
	expect(await languageStorage.loadLanguage()).toBe('sd');
});

test('loadLanguage ignores a corrupted/unsupported stored value rather than crashing', async () => {
	mockBackingStore.set('@mec/language', 'fr');
	expect(await languageStorage.loadLanguage()).toBeNull();
});

test('clearLanguage removes the saved preference', async () => {
	await languageStorage.saveLanguage('en');
	await languageStorage.clearLanguage();
	expect(await languageStorage.loadLanguage()).toBeNull();
});

test('the saved language survives a fresh module load, proving it is backed by AsyncStorage and not an in-memory cache', async () => {
	await languageStorage.saveLanguage('ur');

	jest.resetModules();
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const reloaded: LanguageStorageModule = require('../../../src/i18n/languageStorage');

	expect(await reloaded.loadLanguage()).toBe('ur');
});
