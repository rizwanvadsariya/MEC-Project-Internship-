/**
 * Unit: the offline queue's persistence contract (phases.md Step 18) — this
 * is the first real test file in the mobile app (previously
 * `passWithNoTests: true`, per jest.config.js's own comment). Mocks
 * AsyncStorage with a Map-backed fake and expo-file-system with a minimal
 * File/Directory fake, so these tests never touch a real device filesystem.
 *
 * offlineQueue.ts keeps a module-level in-memory cache alongside AsyncStorage
 * — jest.resetModules() before each test (and re-requiring the module) is
 * what actually proves persistence rather than just re-reading the same
 * cached array, and keeps every test's queue state independent.
 *
 * Variables referenced from inside a jest.mock() factory must be prefixed
 * `mock` (case-insensitive) — Babel's static hoist-check for jest.mock
 * enforces this regardless of the factory only running lazily at require time.
 */
'use strict';

let mockBackingStore: Map<string, string>;
let mockDeletedFileUris: string[];

jest.mock('@react-native-async-storage/async-storage', () => ({
	getItem: jest.fn((key: string) => Promise.resolve(mockBackingStore.get(key) ?? null)),
	setItem: jest.fn((key: string, value: string) => {
		mockBackingStore.set(key, value);
		return Promise.resolve();
	}),
}));

jest.mock('expo-file-system', () => {
	class MockFile {
		uri: string;
		extension: string;
		constructor(...parts: Array<string | { uri: string }>) {
			this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
			const match = this.uri.match(/\.[^./]+$/);
			this.extension = match ? match[0] : '';
		}
		get exists() {
			return !mockDeletedFileUris.includes(this.uri);
		}
		async copy(destination: MockFile) {
			const index = mockDeletedFileUris.indexOf(destination.uri);
			if (index !== -1) mockDeletedFileUris.splice(index, 1);
		}
		delete() {
			mockDeletedFileUris.push(this.uri);
		}
	}

	class MockDirectory {
		uri: string;
		exists = true;
		constructor(...parts: Array<string | { uri: string }>) {
			this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
		}
		create() {}
	}

	return { File: MockFile, Directory: MockDirectory, Paths: { document: { uri: 'file:///document' } } };
});

type OfflineQueueModule = typeof import('../../../src/offline/offlineQueue');
let offlineQueue: OfflineQueueModule;

beforeEach(() => {
	mockBackingStore = new Map();
	mockDeletedFileUris = [];
	jest.resetModules();
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	offlineQueue = require('../../../src/offline/offlineQueue');
});

test('enqueuePhoto persists the file and adds a photo item scoped to its visit', async () => {
	await offlineQueue.enqueuePhoto('visit-1', 'file:///cache/photo.jpg', 'Front wall');

	const queue = await offlineQueue.getQueueForVisit('visit-1');
	expect(queue).toHaveLength(1);
	expect(queue[0]).toMatchObject({ type: 'photo', visitId: 'visit-1', caption: 'Front wall' });
	expect((queue[0] as { localUri: string }).localUri).not.toBe('file:///cache/photo.jpg');
	expect((queue[0] as { localUri: string }).localUri).toContain('offline-photos');
});

test('enqueuePhoto carries captured GPS coordinates through (phases.md Step 19) when provided', async () => {
	await offlineQueue.enqueuePhoto('visit-1', 'file:///cache/photo.jpg', '', { geoLat: 24.8607, geoLng: 67.0011, takenAt: '2026-01-01T12:00:00.000Z' });

	const [queued] = await offlineQueue.getQueueForVisit('visit-1');
	expect(queued).toMatchObject({ geoLat: 24.8607, geoLng: 67.0011, takenAt: '2026-01-01T12:00:00.000Z' });
});

test('enqueuePhoto without a geo argument queues the photo with no coordinates, not a crash', async () => {
	await offlineQueue.enqueuePhoto('visit-1', 'file:///cache/photo.jpg', '');

	const [queued] = await offlineQueue.getQueueForVisit('visit-1');
	expect((queued as { geoLat?: number }).geoLat).toBeUndefined();
});

test('enqueueFormSave replaces any previously queued form action for the same visit, keeping only the latest', async () => {
	await offlineQueue.enqueueFormSave('visit-1', { physicalProgressPct: 20, responses: {} }, false);
	await offlineQueue.enqueueFormSave('visit-1', { physicalProgressPct: 80, responses: {} }, true);

	const queue = await offlineQueue.getQueueForVisit('visit-1');
	expect(queue).toHaveLength(1);
	expect(queue[0]).toMatchObject({ type: 'form', submit: true, payload: { physicalProgressPct: 80 } });
});

test('getQueueForVisit only returns items for that visit, not another visit\'s', async () => {
	await offlineQueue.enqueueFormSave('visit-1', { physicalProgressPct: 10, responses: {} }, false);
	await offlineQueue.enqueueFormSave('visit-2', { physicalProgressPct: 50, responses: {} }, false);

	expect(await offlineQueue.getQueueForVisit('visit-1')).toHaveLength(1);
	expect(await offlineQueue.getQueueForVisit('visit-2')).toHaveLength(1);
	expect(await offlineQueue.getQueue()).toHaveLength(2);
});

test('a photo queued before a form action for the same visit stays ordered before it', async () => {
	await offlineQueue.enqueuePhoto('visit-1', 'file:///cache/a.jpg', '');
	await offlineQueue.enqueueFormSave('visit-1', { physicalProgressPct: 100, responses: {} }, true);

	const queue = await offlineQueue.getQueueForVisit('visit-1');
	expect(queue.map((item) => item.type)).toEqual(['photo', 'form']);
});

test('removeFromQueue deletes a photo item\'s persisted file and drops it from the queue', async () => {
	await offlineQueue.enqueuePhoto('visit-1', 'file:///cache/a.jpg', '');
	const [queued] = await offlineQueue.getQueueForVisit('visit-1');

	await offlineQueue.removeFromQueue(queued.id);

	expect(await offlineQueue.getQueueForVisit('visit-1')).toHaveLength(0);
	expect(mockDeletedFileUris).toContain((queued as { localUri: string }).localUri);
});

test('removeFromQueue on a form item does not touch the filesystem', async () => {
	await offlineQueue.enqueueFormSave('visit-1', { physicalProgressPct: 10, responses: {} }, false);
	const [queued] = await offlineQueue.getQueueForVisit('visit-1');

	await offlineQueue.removeFromQueue(queued.id);

	expect(mockDeletedFileUris).toHaveLength(0);
});

test('hasPendingActionsForVisit reflects the queue', async () => {
	expect(await offlineQueue.hasPendingActionsForVisit('visit-1')).toBe(false);
	await offlineQueue.enqueueFormSave('visit-1', { physicalProgressPct: 10, responses: {} }, false);
	expect(await offlineQueue.hasPendingActionsForVisit('visit-1')).toBe(true);
});

test('subscribeToQueue fires immediately with the current queue, then again on every mutation', async () => {
	const seen: number[] = [];
	const unsubscribe = offlineQueue.subscribeToQueue((queue) => seen.push(queue.length));
	await new Promise((resolve) => setImmediate(resolve)); // let the immediate fire land

	await offlineQueue.enqueueFormSave('visit-1', { physicalProgressPct: 10, responses: {} }, false);
	await offlineQueue.enqueuePhoto('visit-1', 'file:///cache/a.jpg', '');

	expect(seen).toEqual([0, 1, 2]);
	unsubscribe();
	await offlineQueue.enqueueFormSave('visit-2', { physicalProgressPct: 5, responses: {} }, false);
	expect(seen).toEqual([0, 1, 2]); // no more updates after unsubscribing
});

test('the queue survives a fresh module load, proving it is actually backed by AsyncStorage and not just an in-memory cache', async () => {
	await offlineQueue.enqueueFormSave('visit-1', { physicalProgressPct: 42, responses: { ok: true } }, true);

	jest.resetModules();
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const reloaded: OfflineQueueModule = require('../../../src/offline/offlineQueue');

	const queue = await reloaded.getQueueForVisit('visit-1');
	expect(queue).toHaveLength(1);
	expect(queue[0]).toMatchObject({ submit: true, payload: { physicalProgressPct: 42 } });
});
