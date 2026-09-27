/** requestUploadUrl, confirmUpload, listPhotoUrls. */
import { apiBaseUrl, apiRequest } from './client';
import { File } from 'expo-file-system';

export type VisitPhoto = {
	id: string;
	siteVisitId: string;
	storagePath: string;
	caption: string | null;
	geoLat: number | null;
	geoLng: number | null;
	takenAt: string | null;
	createdAt: string;
	signedUrl: string;
};

export type UploadVisitPhotoOptions = {
	caption?: string;
	/** Device GPS at capture time (phases.md Step 19) — omitted when location permission was denied or unavailable. */
	geoLat?: number;
	geoLng?: number;
	takenAt?: string;
};

export async function uploadVisitPhoto(visitId: string, token: string, uri: string, options: UploadVisitPhotoOptions = {}) {
	const imageFile = new File(uri);
	if (!imageFile.exists) throw new Error('Could not read the captured photo.');
	const form = new FormData();
	form.append('photo', imageFile, imageFile.name || `visit-${Date.now()}.jpg`);
	if (options.caption) form.append('caption', options.caption);
	if (options.geoLat != null) form.append('geoLat', String(options.geoLat));
	if (options.geoLng != null) form.append('geoLng', String(options.geoLng));
	if (options.takenAt) form.append('takenAt', options.takenAt);
	const response = await fetch(`${apiBaseUrl}/site-visits/${visitId}/photos`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}` },
		body: form,
	});
	const json = await response.json().catch(() => null);
	if (!response.ok) throw new Error(json?.error?.message ?? `Photo upload failed (${response.status})`);
	return json.data as VisitPhoto;
}

export function listVisitPhotos(visitId: string, token: string) {
	return apiRequest<VisitPhoto[]>(`/site-visits/${visitId}/photos`, { token });
}

export function deleteVisitPhoto(visitId: string, photoId: string, token: string) {
	return apiRequest<void>(`/site-visits/${visitId}/photos/${photoId}`, { method: 'DELETE', token });
}
