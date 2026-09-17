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

export async function uploadVisitPhoto(visitId: string, token: string, uri: string, caption?: string) {
	const imageFile = new File(uri);
	if (!imageFile.exists) throw new Error('Could not read the captured photo.');
	const form = new FormData();
	form.append('photo', imageFile, imageFile.name || `visit-${Date.now()}.jpg`);
	if (caption) form.append('caption', caption);
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
