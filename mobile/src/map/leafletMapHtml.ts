/**
 * Step 30 — GIS map view. Builds the HTML document rendered inside a
 * react-native-webview `WebView` — a real, pannable/zoomable OpenStreetMap
 * (via Leaflet.js), not a hand-drawn schematic. This is the second design
 * for this step: the first (a dependency-free schematic canvas) was
 * replaced after direct user feedback that it "looked like lines instead of
 * a proper map," and the user explicitly asked for OpenStreetMap with real
 * zoom/pan and a bounded zoom-out limit.
 *
 * Deliberately NOT `react-native-maps`: on Android, react-native-maps'
 * MapView is built on the native Google Maps SDK even when only used to
 * overlay custom (e.g. OSM) tiles — it needs a Google Maps API key baked
 * into the native build to render at all, which Expo Go's fixed binary
 * doesn't have (the same class of risk Step 30's own original design
 * rejected react-native-maps over). `react-native-webview` + Leaflet
 * sidesteps this entirely: Leaflet is plain HTML/CSS/JS running inside a
 * normal WebView, loading its own JS/CSS from a CDN and OSM's public tile
 * servers over ordinary HTTPS — no native map SDK, no API key, officially
 * Expo-supported and Expo-Go-compatible.
 *
 * Kept as a pure function (data in, HTML string out) specifically so the
 * part that can go subtly wrong — marker data embedded into the page,
 * zoom/bounds configuration — is unit-testable without a WebView, a
 * browser, or a device, matching this project's "test the pure logic,
 * accept the on-device rendering itself as an honest real-device caveat"
 * precedent used throughout this app (AnalyticsScreen, qrScan.ts, etc).
 */
import { SINDH_BOUNDS, SINDH_CENTER, DEFAULT_ZOOM, MIN_ZOOM, MAX_ZOOM, type LatLng } from './sindhGeography';

export type MapMarker = {
	districtId: number;
	districtName: string;
	lat: number;
	lng: number;
	color: string;
};

/** Minimal escaping for a district name interpolated into an HTML popup —
 *  these come from our own trusted DB, but a double-quote or `<` in a
 *  future renamed district shouldn't be able to break the popup markup. */
function escapeForHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

export function buildLeafletMapHtml(
	markers: MapMarker[],
	options: {
		bounds?: typeof SINDH_BOUNDS;
		center?: LatLng;
		defaultZoom?: number;
		minZoom?: number;
		maxZoom?: number;
	} = {},
): string {
	const bounds = options.bounds ?? SINDH_BOUNDS;
	const center = options.center ?? SINDH_CENTER;
	const defaultZoom = options.defaultZoom ?? DEFAULT_ZOOM;
	const minZoom = options.minZoom ?? MIN_ZOOM;
	const maxZoom = options.maxZoom ?? MAX_ZOOM;

	const safeMarkers = markers.map((marker) => ({
		...marker,
		districtName: escapeForHtml(marker.districtName),
	}));

	return `<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
	<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css" />
	<style>
		html, body, #map { height: 100%; margin: 0; padding: 0; }
		.district-marker { border: 2px solid #ffffff; border-radius: 50%; box-shadow: 0 0 2px rgba(0,0,0,0.5); }
	</style>
</head>
<body>
	<div id="map"></div>
	<script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js"></script>
	<script>
		var sindhBounds = L.latLngBounds(
			L.latLng(${bounds.south}, ${bounds.west}),
			L.latLng(${bounds.north}, ${bounds.east})
		);

		var map = L.map('map', {
			center: [${center.lat}, ${center.lng}],
			zoom: ${defaultZoom},
			minZoom: ${minZoom},
			maxZoom: ${maxZoom},
			maxBounds: sindhBounds,
			maxBoundsViscosity: 1.0
		});

		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '&copy; OpenStreetMap contributors',
			maxZoom: ${maxZoom}
		}).addTo(map);

		map.fitBounds(sindhBounds);

		var markers = ${JSON.stringify(safeMarkers)};
		markers.forEach(function (marker) {
			var circle = L.circleMarker([marker.lat, marker.lng], {
				radius: 11,
				color: '#ffffff',
				weight: 2,
				fillColor: marker.color,
				fillOpacity: 0.9,
				className: 'district-marker'
			}).addTo(map);
			circle.bindTooltip(marker.districtName, { direction: 'top' });
			circle.on('click', function () {
				if (window.ReactNativeWebView) {
					window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'districtSelected', districtId: marker.districtId }));
				}
			});
		});
	</script>
</body>
</html>`;
}

export type MapMessage = { type: 'districtSelected'; districtId: number };

/** Parses a `WebView`'s `onMessage` event data — the page running inside
 *  the WebView is our own generated HTML, not third-party/user content, but
 *  this still never trusts it blindly: a malformed payload (a stray
 *  Leaflet-internal postMessage, a future page bug) returns `null` rather
 *  than throwing and crashing the screen. */
export function parseMapMessage(raw: string): MapMessage | null {
	try {
		const parsed = JSON.parse(raw);
		if (parsed && parsed.type === 'districtSelected' && typeof parsed.districtId === 'number') {
			return { type: 'districtSelected', districtId: parsed.districtId };
		}
		return null;
	} catch {
		return null;
	}
}
