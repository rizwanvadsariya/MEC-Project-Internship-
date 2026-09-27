/**
 * Unit: syncManager's drain-the-queue contract (phases.md Step 18). Mocks
 * offlineQueue.ts, the visitForms/photos API clients, and NetInfo, so this
 * never touches AsyncStorage, the filesystem, or a real network call —
 * offlineQueue.ts's own persistence contract is covered separately in
 * offlineQueue.test.ts.
 *
 * syncManager.ts keeps module-level `syncing`/`started` state, so every test
 * resets the module registry and re-requires it fresh — otherwise a
 * `started` flag left `true` by an earlier test would make `startAutoSync`
 * silently no-op in a later one.
 */
'use strict';

jest.mock('../../../src/offline/offlineQueue', () => ({
	getQueue: jest.fn(),
	removeFromQueue: jest.fn(),
}));
jest.mock('../../../src/api/visitForms.api', () => ({
	saveVisitForm: jest.fn(),
	submitVisitForm: jest.fn(),
}));
jest.mock('../../../src/api/photos.api', () => ({
	uploadVisitPhoto: jest.fn(),
}));
jest.mock('@react-native-community/netinfo', () => ({
	fetch: jest.fn(),
	addEventListener: jest.fn(),
}));

type SyncManagerModule = typeof import('../../../src/offline/syncManager');
type OfflineQueueMock = { getQueue: jest.Mock; removeFromQueue: jest.Mock };
type VisitFormsApiMock = { saveVisitForm: jest.Mock; submitVisitForm: jest.Mock };
type PhotosApiMock = { uploadVisitPhoto: jest.Mock };
type NetInfoMock = { fetch: jest.Mock; addEventListener: jest.Mock };

let syncManager: SyncManagerModule;
let offlineQueue: OfflineQueueMock;
let visitFormsApi: VisitFormsApiMock;
let photosApi: PhotosApiMock;
let netInfo: NetInfoMock;

function photoAction(overrides: Partial<{ id: string; visitId: string; localUri: string; caption: string; geoLat: number; geoLng: number; takenAt: string }> = {}) {
	return { id: 'p1', type: 'photo' as const, visitId: 'visit-1', localUri: 'file:///document/offline-photos/a.jpg', caption: '', createdAt: 1, ...overrides };
}
function formAction(overrides: Partial<{ id: string; visitId: string; submit: boolean }> = {}) {
	return { id: 'f1', type: 'form' as const, visitId: 'visit-1', payload: { physicalProgressPct: 10, responses: {} }, submit: false, createdAt: 2, ...overrides };
}

beforeEach(() => {
	jest.resetModules();
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	syncManager = require('../../../src/offline/syncManager');
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	offlineQueue = require('../../../src/offline/offlineQueue');
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	visitFormsApi = require('../../../src/api/visitForms.api');
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	photosApi = require('../../../src/api/photos.api');
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	netInfo = require('@react-native-community/netinfo');

	offlineQueue.getQueue.mockResolvedValue([]);
	offlineQueue.removeFromQueue.mockResolvedValue(undefined);
	visitFormsApi.saveVisitForm.mockResolvedValue({});
	visitFormsApi.submitVisitForm.mockResolvedValue({});
	photosApi.uploadVisitPhoto.mockResolvedValue({});
	netInfo.fetch.mockResolvedValue({ isConnected: true, isInternetReachable: true });
	netInfo.addEventListener.mockReturnValue(() => {});
});

describe('processQueue', () => {
	test('does nothing without a token — no API calls, no queue reads', async () => {
		await syncManager.processQueue(null);
		expect(offlineQueue.getQueue).not.toHaveBeenCalled();
	});

	test('uploads a photo action via uploadVisitPhoto and removes it from the queue on success', async () => {
		offlineQueue.getQueue.mockResolvedValue([photoAction()]);

		await syncManager.processQueue('tok');

		expect(photosApi.uploadVisitPhoto).toHaveBeenCalledWith('visit-1', 'tok', 'file:///document/offline-photos/a.jpg', {
			caption: undefined,
			geoLat: undefined,
			geoLng: undefined,
			takenAt: undefined,
		});
		expect(offlineQueue.removeFromQueue).toHaveBeenCalledWith('p1');
	});

	test('a photo action with captured GPS coordinates (phases.md Step 19) passes them through to uploadVisitPhoto', async () => {
		offlineQueue.getQueue.mockResolvedValue([photoAction({ geoLat: 24.8607, geoLng: 67.0011, takenAt: '2026-01-01T12:00:00.000Z' })]);

		await syncManager.processQueue('tok');

		expect(photosApi.uploadVisitPhoto).toHaveBeenCalledWith('visit-1', 'tok', 'file:///document/offline-photos/a.jpg', {
			caption: undefined,
			geoLat: 24.8607,
			geoLng: 67.0011,
			takenAt: '2026-01-01T12:00:00.000Z',
		});
	});

	test('a draft form action calls saveVisitForm, not submitVisitForm', async () => {
		offlineQueue.getQueue.mockResolvedValue([formAction({ submit: false })]);

		await syncManager.processQueue('tok');

		expect(visitFormsApi.saveVisitForm).toHaveBeenCalledWith('visit-1', { physicalProgressPct: 10, responses: {} }, 'tok');
		expect(visitFormsApi.submitVisitForm).not.toHaveBeenCalled();
		expect(offlineQueue.removeFromQueue).toHaveBeenCalledWith('f1');
	});

	test('a submit form action calls submitVisitForm, not saveVisitForm', async () => {
		offlineQueue.getQueue.mockResolvedValue([formAction({ submit: true })]);

		await syncManager.processQueue('tok');

		expect(visitFormsApi.submitVisitForm).toHaveBeenCalledWith('visit-1', { physicalProgressPct: 10, responses: {} }, 'tok');
		expect(visitFormsApi.saveVisitForm).not.toHaveBeenCalled();
	});

	test('processes the queue strictly in order: a photo before the submit that depends on it', async () => {
		const order: string[] = [];
		photosApi.uploadVisitPhoto.mockImplementation(async () => { order.push('photo'); return {}; });
		visitFormsApi.submitVisitForm.mockImplementation(async () => { order.push('submit'); return {}; });
		offlineQueue.getQueue.mockResolvedValue([photoAction(), formAction({ submit: true })]);

		await syncManager.processQueue('tok');

		expect(order).toEqual(['photo', 'submit']);
	});

	test('stops at the first failure and never applies a later action out of order', async () => {
		photosApi.uploadVisitPhoto.mockRejectedValue(new Error('still offline'));
		offlineQueue.getQueue.mockResolvedValue([photoAction({ id: 'p1' }), formAction({ id: 'f1', submit: true })]);

		await syncManager.processQueue('tok');

		expect(visitFormsApi.submitVisitForm).not.toHaveBeenCalled();
		expect(offlineQueue.removeFromQueue).not.toHaveBeenCalledWith('f1');
		expect(offlineQueue.removeFromQueue).not.toHaveBeenCalledWith('p1'); // the failed action itself stays queued too
	});

	test('two concurrent calls: the second is a no-op while the first is still running', async () => {
		let releaseUpload: () => void = () => {};
		const gate = new Promise<void>((resolve) => { releaseUpload = resolve; });
		photosApi.uploadVisitPhoto.mockImplementation(async () => { await gate; return {}; });
		offlineQueue.getQueue.mockResolvedValue([photoAction()]);

		const first = syncManager.processQueue('tok');
		const second = syncManager.processQueue('tok'); // should return immediately, doing nothing
		await second;
		// `second` resolving only proves its own no-op path finished; `first`
		// still needs a few more microtask turns (getQueue, then processOne)
		// before it actually reaches the gated uploadVisitPhoto call.
		await new Promise((resolve) => setImmediate(resolve));
		await new Promise((resolve) => setImmediate(resolve));
		expect(photosApi.uploadVisitPhoto).toHaveBeenCalledTimes(1);

		releaseUpload();
		await first;
	});
});

describe('subscribeToSyncStatus', () => {
	test('fires immediately with the current pending count', async () => {
		offlineQueue.getQueue.mockResolvedValue([photoAction(), formAction()]);
		const seen: Array<{ syncing: boolean; pendingCount: number }> = [];

		syncManager.subscribeToSyncStatus((status) => seen.push(status));
		await new Promise((resolve) => setImmediate(resolve));

		expect(seen).toEqual([{ syncing: false, pendingCount: 2 }]);
	});

	test('reports syncing:true while draining and syncing:false with the reduced count once done', async () => {
		offlineQueue.getQueue
			.mockResolvedValueOnce([photoAction()]) // initial subscribe snapshot
			.mockResolvedValue([photoAction()]); // still-pending count used at each processQueue step, matched to actual queue length after removal below
		offlineQueue.removeFromQueue.mockImplementation(async () => {
			offlineQueue.getQueue.mockResolvedValue([]); // simulate the item actually being gone now
		});

		const statuses: Array<{ syncing: boolean; pendingCount: number }> = [];
		syncManager.subscribeToSyncStatus((status) => statuses.push(status));
		await new Promise((resolve) => setImmediate(resolve));

		await syncManager.processQueue('tok');

		expect(statuses[0]).toEqual({ syncing: false, pendingCount: 1 });
		expect(statuses.some((s) => s.syncing === true)).toBe(true);
		expect(statuses[statuses.length - 1]).toEqual({ syncing: false, pendingCount: 0 });
	});
});

describe('startAutoSync', () => {
	test('checks connectivity once at start and triggers a sync if already online', async () => {
		offlineQueue.getQueue.mockResolvedValue([photoAction()]);
		netInfo.fetch.mockResolvedValue({ isConnected: true, isInternetReachable: true });

		syncManager.startAutoSync(() => 'tok');
		await new Promise((resolve) => setImmediate(resolve));
		await new Promise((resolve) => setImmediate(resolve));

		expect(netInfo.fetch).toHaveBeenCalledTimes(1);
		expect(photosApi.uploadVisitPhoto).toHaveBeenCalled();
	});

	test('does not sync at start when offline', async () => {
		netInfo.fetch.mockResolvedValue({ isConnected: false, isInternetReachable: false });
		offlineQueue.getQueue.mockResolvedValue([photoAction()]);

		syncManager.startAutoSync(() => 'tok');
		await new Promise((resolve) => setImmediate(resolve));

		expect(photosApi.uploadVisitPhoto).not.toHaveBeenCalled();
	});

	test('registers a NetInfo listener that triggers a sync once connectivity is regained', async () => {
		netInfo.fetch.mockResolvedValue({ isConnected: false, isInternetReachable: false });
		let listener: ((state: { isConnected: boolean; isInternetReachable: boolean | null }) => void) | undefined;
		netInfo.addEventListener.mockImplementation((cb: typeof listener) => { listener = cb; return () => {}; });
		offlineQueue.getQueue.mockResolvedValue([photoAction()]);

		syncManager.startAutoSync(() => 'tok');
		await new Promise((resolve) => setImmediate(resolve));
		expect(photosApi.uploadVisitPhoto).not.toHaveBeenCalled();

		listener?.({ isConnected: true, isInternetReachable: true });
		await new Promise((resolve) => setImmediate(resolve));
		await new Promise((resolve) => setImmediate(resolve));

		expect(photosApi.uploadVisitPhoto).toHaveBeenCalled();
	});

	test('always reads the token through the provided getter, never a stale closed-over value', async () => {
		netInfo.fetch.mockResolvedValue({ isConnected: false, isInternetReachable: false });
		let listener: ((state: { isConnected: boolean; isInternetReachable: boolean | null }) => void) | undefined;
		netInfo.addEventListener.mockImplementation((cb: typeof listener) => { listener = cb; return () => {}; });
		offlineQueue.getQueue.mockResolvedValue([photoAction()]);

		let currentToken: string | null = null;
		syncManager.startAutoSync(() => currentToken);
		currentToken = 'fresh-token';

		listener?.({ isConnected: true, isInternetReachable: true });
		await new Promise((resolve) => setImmediate(resolve));
		await new Promise((resolve) => setImmediate(resolve));

		expect(photosApi.uploadVisitPhoto).toHaveBeenCalledWith('visit-1', 'fresh-token', expect.any(String), expect.any(Object));
	});

	test('calling it twice only attaches one NetInfo listener', () => {
		syncManager.startAutoSync(() => 'tok');
		syncManager.startAutoSync(() => 'tok');

		expect(netInfo.addEventListener).toHaveBeenCalledTimes(1);
	});
});
