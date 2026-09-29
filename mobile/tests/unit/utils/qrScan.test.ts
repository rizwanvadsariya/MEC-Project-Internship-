/**
 * Pure-logic tests for src/utils/qrScan.ts (Step 28's zoom-control fix for
 * multiple nearby QR codes being captured at once) — no rendering, no camera.
 */
import { clampZoom, DEFAULT_ZOOM, MAX_ZOOM, MIN_ZOOM, ZOOM_STEP } from '../../../src/utils/qrScan';

describe('clampZoom', () => {
	test('passes an in-range value through unchanged', () => {
		expect(clampZoom(0.5)).toBe(0.5);
	});

	test('clamps a value above MAX_ZOOM down to MAX_ZOOM', () => {
		expect(clampZoom(1.5)).toBe(MAX_ZOOM);
		expect(clampZoom(MAX_ZOOM + ZOOM_STEP)).toBe(MAX_ZOOM);
	});

	test('clamps a value below MIN_ZOOM up to MIN_ZOOM', () => {
		expect(clampZoom(-0.5)).toBe(MIN_ZOOM);
		expect(clampZoom(MIN_ZOOM - ZOOM_STEP)).toBe(MIN_ZOOM);
	});

	test('boundary values are returned unchanged', () => {
		expect(clampZoom(MIN_ZOOM)).toBe(MIN_ZOOM);
		expect(clampZoom(MAX_ZOOM)).toBe(MAX_ZOOM);
	});

	test('DEFAULT_ZOOM itself is always a valid, in-range value', () => {
		expect(clampZoom(DEFAULT_ZOOM)).toBe(DEFAULT_ZOOM);
		expect(DEFAULT_ZOOM).toBeGreaterThanOrEqual(MIN_ZOOM);
		expect(DEFAULT_ZOOM).toBeLessThanOrEqual(MAX_ZOOM);
	});

	test('repeatedly stepping up from DEFAULT_ZOOM never exceeds MAX_ZOOM', () => {
		let zoom = DEFAULT_ZOOM;
		for (let i = 0; i < 20; i += 1) zoom = clampZoom(zoom + ZOOM_STEP);
		expect(zoom).toBe(MAX_ZOOM);
	});

	test('repeatedly stepping down from DEFAULT_ZOOM never goes below MIN_ZOOM', () => {
		let zoom = DEFAULT_ZOOM;
		for (let i = 0; i < 20; i += 1) zoom = clampZoom(zoom - ZOOM_STEP);
		expect(zoom).toBe(MIN_ZOOM);
	});
});
