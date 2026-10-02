/**
 * Step 30 — GIS map view. Real-world (WGS84) coordinates for Sindh's 30
 * districts, used to place markers on a real OpenStreetMap tile map
 * (leafletMapHtml.ts) rather than a schematic/hand-drawn layout — this
 * replaces an earlier schematic-canvas version of this step after direct
 * user feedback that it "looked like lines instead of a proper map."
 *
 * The ADP source data (schema.md, adp-database-seed-csv/) still carries no
 * lat/lng anywhere for schemes/districts/divisions — only
 * visit_photos.geo_lat/geo_lng exists (real GPS from an actual site-visit
 * photo, Step 19), a completely different kind of data. These coordinates
 * are each district's approximate headquarters-town centroid, from general
 * public geographic knowledge (the same footing as Step 25/27/28's own
 * documented judgment calls, e.g. Step 28's QR-payload-format assumption) —
 * NOT a surveyed/authoritative source, and city-level precision, not
 * parcel-level. Good enough to drop a pin recognizably inside the right
 * district on a real map; not good enough to claim exact administrative
 * boundaries from. Worth refining against an authoritative source if this
 * app ever needs survey-grade accuracy.
 *
 * Keyed by the exact district name strings from
 * adp-database-seed-csv/districts.csv (the same names the backend's
 * district.name column holds) — deliberately not by id, so this table stays
 * readable/auditable against the source CSV without cross-referencing ids.
 */

export type LatLng = { lat: number; lng: number };

export const DISTRICT_COORDINATES: Record<string, LatLng> = {
	// Larkana division (northwest)
	Jacobabad: { lat: 28.2769, lng: 68.4383 },
	Kashmore: { lat: 28.4339, lng: 69.5872 },
	Larkana: { lat: 27.5590, lng: 68.2120 },
	'Qambar Shahdadkot': { lat: 27.8486, lng: 67.9067 },
	Shikarpur: { lat: 27.9560, lng: 68.6382 },

	// Sukkur division (north, along the Indus)
	Ghotki: { lat: 28.0073, lng: 69.3153 },
	Khairpur: { lat: 27.5295, lng: 68.7589 },
	Sukkur: { lat: 27.7052, lng: 68.8574 },

	// Shaheed Benazirabad division (mid-Sindh)
	'Naushahro Feroze': { lat: 26.8405, lng: 68.1259 },
	'Shaheed Benazirabad': { lat: 26.2442, lng: 68.4100 },

	// Hyderabad division (central/south)
	Badin: { lat: 24.6560, lng: 68.8380 },
	Dadu: { lat: 26.7306, lng: 67.7750 },
	Hyderabad: { lat: 25.3960, lng: 68.3578 },
	Jamshoro: { lat: 25.4300, lng: 68.2800 },
	Matiari: { lat: 25.5950, lng: 68.4430 },
	Sujawal: { lat: 24.5950, lng: 68.0670 },
	'Tando Allahyar': { lat: 25.4600, lng: 68.7170 },
	'Tando Muhammad Khan': { lat: 25.1250, lng: 68.5370 },
	Thatta: { lat: 24.7460, lng: 67.9220 },

	// Mirpur Khas division (southeast desert)
	'Mirpur Khas': { lat: 25.5260, lng: 69.0120 },
	Sanghar: { lat: 26.0460, lng: 68.9480 },
	Tharparkar: { lat: 24.7340, lng: 69.7960 },
	Umerkot: { lat: 25.3620, lng: 69.7360 },

	// Karachi division (far south, coastal)
	'Karachi Central (Nazimabad)': { lat: 24.9056, lng: 67.0822 },
	'Karachi East (Gulshan)': { lat: 24.8966, lng: 67.1364 },
	Keamari: { lat: 24.8470, lng: 66.9900 },
	Korangi: { lat: 24.8320, lng: 67.1330 },
	'Karachi South (Karachi)': { lat: 24.8536, lng: 67.0280 },
	'Karachi West (Orangi)': { lat: 24.9200, lng: 66.9780 },
	Malir: { lat: 24.8920, lng: 67.2080 },
};

export function getDistrictCoordinates(districtName: string): LatLng | null {
	return DISTRICT_COORDINATES[districtName] ?? null;
}

/**
 * A bounding box loosely around the whole of Sindh province, used as
 * Leaflet's `maxBounds` (the user can't pan/zoom out past this) — the
 * user's own explicit request: "set a limit to zoom out ... till whole
 * sindh region being visible." Deliberately generous (a few tenths of a
 * degree of margin beyond the real provincial border) so a district near
 * the edge (Kashmore in the north, Tharparkar in the southeast) is never
 * pinned right at the boundary with no breathing room.
 */
export const SINDH_BOUNDS = {
	south: 23.5,
	west: 66.5,
	north: 28.8,
	east: 71.2,
};

export const SINDH_CENTER: LatLng = { lat: 26.0, lng: 68.8 };

/** Leaflet zoom levels: `MIN_ZOOM` is the farthest out the user can go
 *  (combined with `SINDH_BOUNDS` as `maxBounds`, this is what keeps "whole
 *  Sindh visible" as the zoomed-out limit the user asked for);
 *  `MAX_ZOOM` is the closest in, roughly town/district-headquarters level —
 *  deliberately not street-level, since this map's whole job is placing a
 *  district, not navigating within one. */
export const DEFAULT_ZOOM = 7;
export const MIN_ZOOM = 6;
export const MAX_ZOOM = 13;
