/**
 * Pure-logic tests for src/map/leafletMapHtml.ts (phases.md Step 30, OSM
 * redesign) — the HTML/JS string this module builds is what actually runs
 * inside the WebView, so these tests assert on its literal content (the
 * strongest check available without a WebView/browser/device, matching this
 * project's established "test the pure logic, accept on-device rendering as
 * an honest real-device caveat" precedent).
 */
import { buildLeafletMapHtml, parseMapMessage, type MapMarker } from '../../../src/map/leafletMapHtml';
import { SINDH_BOUNDS, SINDH_CENTER, MIN_ZOOM, MAX_ZOOM } from '../../../src/map/sindhGeography';

const sampleMarkers: MapMarker[] = [
	{ districtId: 1, districtName: 'Hyderabad', lat: 25.396, lng: 68.3578, color: '#198754' },
	{ districtId: 2, districtName: 'Tharparkar', lat: 24.734, lng: 69.796, color: '#DC3545' },
];

describe('buildLeafletMapHtml', () => {
	test('loads Leaflet and the real public OSM tile server, not a placeholder/mocked URL', () => {
		const html = buildLeafletMapHtml(sampleMarkers);
		expect(html).toContain('leaflet.js');
		expect(html).toContain('leaflet.css');
		expect(html).toContain('tile.openstreetmap.org');
		expect(html).toContain('OpenStreetMap contributors'); // OSM's own required attribution
	});

	test('embeds maxBounds from SINDH_BOUNDS by default — the user\'s own "can\'t zoom out past whole Sindh" request', () => {
		const html = buildLeafletMapHtml(sampleMarkers);
		expect(html).toContain(`L.latLng(${SINDH_BOUNDS.south}, ${SINDH_BOUNDS.west})`);
		expect(html).toContain(`L.latLng(${SINDH_BOUNDS.north}, ${SINDH_BOUNDS.east})`);
		expect(html).toContain('maxBoundsViscosity: 1.0');
	});

	test('embeds the default min/max zoom limits', () => {
		const html = buildLeafletMapHtml(sampleMarkers);
		expect(html).toContain(`minZoom: ${MIN_ZOOM}`);
		expect(html).toContain(`maxZoom: ${MAX_ZOOM}`);
	});

	test('custom bounds/zoom options override the sindhGeography.ts defaults', () => {
		const html = buildLeafletMapHtml(sampleMarkers, { minZoom: 9, maxZoom: 15, center: { lat: 1, lng: 2 } });
		expect(html).toContain('minZoom: 9');
		expect(html).toContain('maxZoom: 15');
		expect(html).toContain('center: [1, 2]');
	});

	test('embeds every marker\'s id, coordinates, and color', () => {
		const html = buildLeafletMapHtml(sampleMarkers);
		expect(html).toContain('"districtId":1');
		expect(html).toContain('"lat":25.396');
		expect(html).toContain('"color":"#198754"');
		expect(html).toContain('"districtId":2');
		expect(html).toContain('"color":"#DC3545"');
	});

	test('an empty marker list still produces a valid page (no schemes with any district match yet)', () => {
		const html = buildLeafletMapHtml([]);
		expect(html).toContain('var markers = [];');
		expect(html).toContain('tile.openstreetmap.org');
	});

	test('a district name with HTML-significant characters is escaped before being embedded in a popup', () => {
		const malicious: MapMarker[] = [{ districtId: 1, districtName: '<img src=x onerror=alert(1)>', lat: 25, lng: 68, color: '#000' }];
		const html = buildLeafletMapHtml(malicious);
		expect(html).not.toContain('<img src=x onerror=alert(1)>');
		expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
	});

	test('wires each marker\'s click handler to postMessage its own districtId back to React Native', () => {
		const html = buildLeafletMapHtml(sampleMarkers);
		expect(html).toContain('window.ReactNativeWebView.postMessage');
		expect(html).toContain("'districtSelected'");
	});
});

describe('parseMapMessage', () => {
	test('parses a well-formed districtSelected message', () => {
		expect(parseMapMessage(JSON.stringify({ type: 'districtSelected', districtId: 7 }))).toEqual({ type: 'districtSelected', districtId: 7 });
	});

	test('returns null for malformed JSON, never throws', () => {
		expect(parseMapMessage('not json at all {{{')).toBeNull();
	});

	test('returns null for valid JSON with the wrong shape (e.g. a stray Leaflet-internal message)', () => {
		expect(parseMapMessage(JSON.stringify({ foo: 'bar' }))).toBeNull();
		expect(parseMapMessage(JSON.stringify({ type: 'districtSelected', districtId: 'not-a-number' }))).toBeNull();
		expect(parseMapMessage(JSON.stringify({ type: 'somethingElse', districtId: 1 }))).toBeNull();
	});

	test('returns null for an empty string', () => {
		expect(parseMapMessage('')).toBeNull();
	});
});
