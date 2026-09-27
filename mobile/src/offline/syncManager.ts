/**
 * Background sync for the offline queue (phases.md Step 18): listens for
 * connectivity regained and drains offlineQueue.ts against the real API.
 * No queue/worker infra — same in-process, fire-and-forget-on-reconnect
 * spirit as the backend's notification dispatch (backend/src/lib/backgroundTask.js),
 * just triggered by NetInfo instead of an HTTP request.
 */
import NetInfo from '@react-native-community/netinfo';
import { getQueue, removeFromQueue, type QueuedAction } from './offlineQueue';
import { saveVisitForm, submitVisitForm } from '../api/visitForms.api';
import { uploadVisitPhoto } from '../api/photos.api';

type SyncStatus = { syncing: boolean; pendingCount: number };
type Listener = (status: SyncStatus) => void;
const listeners = new Set<Listener>();

let syncing = false;
let started = false;

function notify(pendingCount: number) {
	listeners.forEach((listener) => listener({ syncing, pendingCount }));
}

/** Fires immediately with the current status, then on every change. Returns an unsubscribe function. */
export function subscribeToSyncStatus(listener: Listener): () => void {
	listeners.add(listener);
	void getQueue().then((queue) => listener({ syncing, pendingCount: queue.length }));
	return () => listeners.delete(listener);
}

async function processOne(action: QueuedAction, token: string): Promise<void> {
	if (action.type === 'photo') {
		await uploadVisitPhoto(action.visitId, token, action.localUri, {
			caption: action.caption || undefined,
			geoLat: action.geoLat,
			geoLng: action.geoLng,
			takenAt: action.takenAt,
		});
	} else if (action.submit) {
		await submitVisitForm(action.visitId, action.payload, token);
	} else {
		await saveVisitForm(action.visitId, action.payload, token);
	}
}

/**
 * Drains the queue strictly in FIFO order, stopping at the first failure so
 * a later action for a visit is never applied before an earlier one it
 * depends on (see offlineQueue.ts's header) — a real, ongoing network outage
 * naturally stops the whole drain rather than partially applying it out of
 * order. The next connectivity event or manual "Sync now" retries the
 * remaining queue from the top.
 */
export async function processQueue(token: string | null): Promise<void> {
	if (!token || syncing) return;
	syncing = true;
	notify((await getQueue()).length);
	try {
		const queue = await getQueue();
		for (const action of queue) {
			try {
				await processOne(action, token);
				await removeFromQueue(action.id);
				notify((await getQueue()).length);
			} catch {
				break;
			}
		}
	} finally {
		syncing = false;
		notify((await getQueue()).length);
	}
}

/**
 * Starts listening for connectivity regained and triggers a drain. Call once
 * for the app's lifetime (e.g. from AuthProvider) with a function that
 * always returns the *current* access token — a NetInfo listener outlives
 * any single render, so it can't just close over one token from sign-in.
 * Returns an unsubscribe function; safe to call multiple times (only the
 * first call actually attaches a listener).
 */
export function startAutoSync(getToken: () => string | null): () => void {
	if (started) return () => {};
	started = true;

	void NetInfo.fetch().then((state) => {
		if (state.isConnected && state.isInternetReachable !== false) void processQueue(getToken());
	});

	const unsubscribe = NetInfo.addEventListener((state) => {
		if (state.isConnected && state.isInternetReachable !== false) void processQueue(getToken());
	});

	return () => {
		unsubscribe();
		started = false;
	};
}
