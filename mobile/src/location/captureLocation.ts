/**
 * Captures the device's current GPS coordinates for geo-tagging a progress
 * photo (phases.md Step 19 — extends the existing photo capture flow, no
 * separate "visit-level" location field exists in the schema). Deliberately
 * never throws — a phone with location permission denied, GPS disabled, or a
 * timeout should still let the photo be captured and uploaded, just without
 * coordinates, same "degrade gracefully" precedent as
 * registerForPushNotifications.ts.
 */
import * as Location from 'expo-location';

export type CapturedLocation = { geoLat: number; geoLng: number };

export async function captureCurrentLocation(): Promise<CapturedLocation | null> {
	try {
		const existing = await Location.getForegroundPermissionsAsync();
		let status = existing.status;
		if (status !== 'granted') {
			const requested = await Location.requestForegroundPermissionsAsync();
			status = requested.status;
		}
		if (status !== 'granted') return null;

		const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
		return { geoLat: position.coords.latitude, geoLng: position.coords.longitude };
	} catch (err) {
		console.warn('[location] Could not capture GPS coordinates (non-fatal):', err instanceof Error ? err.message : err);
		return null;
	}
}
