/**
 * Persistent local queue for MEO form saves/submits and photo uploads made
 * while offline (phases.md Step 18). Backed by AsyncStorage for the queue
 * itself; a queued photo's picked file is copied out of the OS-managed cache
 * into the app's own document directory first, since the cache can be
 * evicted by the OS at any time while a queue entry is waiting to sync —
 * the original picker URI is not safe to hold onto across an app restart.
 *
 * Ordering matters: `enqueueFormSave` always replaces any still-queued form
 * action for the same visit (only the latest draft/submit should ever apply,
 * never a stale earlier one), and syncManager.ts drains this queue strictly
 * FIFO so a photo queued before a submit for the same visit always uploads
 * before that submit runs — submitting first would permanently lock the
 * report (VISIT_REPORT_LOCKED) before the photo could ever attach.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import type { VisitFormPayload } from '../api/visitForms.api';

const STORAGE_KEY = '@mec/offline-queue';
const PHOTO_DIR_NAME = 'offline-photos';

export type QueuedFormAction = {
	id: string;
	type: 'form';
	visitId: string;
	payload: VisitFormPayload;
	submit: boolean;
	createdAt: number;
};

export type QueuedPhotoAction = {
	id: string;
	type: 'photo';
	visitId: string;
	localUri: string;
	caption: string;
	/** Device GPS at capture time (phases.md Step 19) — undefined when location permission was denied or unavailable. */
	geoLat?: number;
	geoLng?: number;
	takenAt?: string;
	createdAt: number;
};

export type QueuedAction = QueuedFormAction | QueuedPhotoAction;

type Listener = (queue: QueuedAction[]) => void;
const listeners = new Set<Listener>();

let cache: QueuedAction[] | null = null;

function makeId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function readQueue(): Promise<QueuedAction[]> {
	if (cache) return cache;
	try {
		const raw = await AsyncStorage.getItem(STORAGE_KEY);
		cache = raw ? (JSON.parse(raw) as QueuedAction[]) : [];
	} catch {
		cache = [];
	}
	return cache;
}

async function writeQueue(queue: QueuedAction[]): Promise<void> {
	cache = queue;
	await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
	listeners.forEach((listener) => listener(queue));
}

/** Fires immediately with the current queue, then on every change. Returns an unsubscribe function. */
export function subscribeToQueue(listener: Listener): () => void {
	listeners.add(listener);
	void readQueue().then((queue) => listener(queue));
	return () => listeners.delete(listener);
}

export async function getQueue(): Promise<QueuedAction[]> {
	return [...(await readQueue())];
}

export async function getQueueForVisit(visitId: string): Promise<QueuedAction[]> {
	return (await readQueue()).filter((item) => item.visitId === visitId);
}

async function persistPhotoFile(uri: string): Promise<string> {
	const source = new File(uri);
	const dir = new Directory(Paths.document, PHOTO_DIR_NAME);
	if (!dir.exists) dir.create({ intermediates: true });
	const destination = new File(dir, `${makeId()}${source.extension || '.jpg'}`);
	await source.copy(destination, { overwrite: true });
	return destination.uri;
}

export async function enqueuePhoto(
	visitId: string,
	uri: string,
	caption: string,
	geo?: { geoLat: number; geoLng: number; takenAt: string },
): Promise<void> {
	const persistedUri = await persistPhotoFile(uri);
	const queue = await readQueue();
	queue.push({
		id: makeId(),
		type: 'photo',
		visitId,
		localUri: persistedUri,
		caption,
		geoLat: geo?.geoLat,
		geoLng: geo?.geoLng,
		takenAt: geo?.takenAt,
		createdAt: Date.now(),
	});
	await writeQueue(queue);
}

export async function enqueueFormSave(visitId: string, payload: VisitFormPayload, submit: boolean): Promise<void> {
	const queue = await readQueue();
	const withoutExistingFormAction = queue.filter((item) => !(item.type === 'form' && item.visitId === visitId));
	withoutExistingFormAction.push({ id: makeId(), type: 'form', visitId, payload, submit, createdAt: Date.now() });
	await writeQueue(withoutExistingFormAction);
}

export async function removeFromQueue(id: string): Promise<void> {
	const queue = await readQueue();
	const item = queue.find((entry) => entry.id === id);
	if (item?.type === 'photo') {
		try {
			const file = new File(item.localUri);
			if (file.exists) file.delete();
		} catch {
			// Best-effort cleanup — a leftover file in offline-photos/ is harmless.
		}
	}
	await writeQueue(queue.filter((entry) => entry.id !== id));
}

export async function hasPendingActionsForVisit(visitId: string): Promise<boolean> {
	return (await getQueueForVisit(visitId)).length > 0;
}
