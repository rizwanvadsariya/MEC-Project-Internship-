/**
 * Pure-logic tests for src/utils/qrScheme.ts (Step 28 QR scan-to-open) — no
 * rendering, no camera, matching this project's established tests/unit/
 * precedent (see dateTime.test.ts).
 */
import { normalizeScannedSchemeCode } from '../../../src/utils/qrScheme';

describe('normalizeScannedSchemeCode', () => {
	test('trims surrounding whitespace from a real scanned code', () => {
		expect(normalizeScannedSchemeCode('  AGRAE-PP-16-0003  ')).toBe('AGRAE-PP-16-0003');
	});

	test('passes through an already-clean code unchanged', () => {
		expect(normalizeScannedSchemeCode('AGRAE-PP-16-0003')).toBe('AGRAE-PP-16-0003');
	});

	test('preserves case — the backend lookup is case-insensitive, not this helper', () => {
		expect(normalizeScannedSchemeCode('agrae-pp-16-0003')).toBe('agrae-pp-16-0003');
	});

	test('returns null for an empty string', () => {
		expect(normalizeScannedSchemeCode('')).toBeNull();
	});

	test('returns null for a whitespace-only scan', () => {
		expect(normalizeScannedSchemeCode('   ')).toBeNull();
		expect(normalizeScannedSchemeCode('\n\t')).toBeNull();
	});

	test('a single non-whitespace character is still a valid code', () => {
		expect(normalizeScannedSchemeCode('X')).toBe('X');
	});

	describe('real ADP booklet QR payload — a government portal URL with uid as a query param', () => {
		test('extracts the uid from the real confirmed booklet URL format', () => {
			expect(normalizeScannedSchemeCode('https://bbms.sferp.gos.pk/public/scheme?uid=AZUAQ-PP-19-0015')).toBe('AZUAQ-PP-19-0015');
		});

		test('extracts uid when it is not the first query parameter', () => {
			expect(normalizeScannedSchemeCode('https://bbms.sferp.gos.pk/public/scheme?ref=abc&uid=AZUAQ-PP-19-0015')).toBe('AZUAQ-PP-19-0015');
		});

		test('extracts uid and ignores a trailing query parameter or fragment', () => {
			expect(normalizeScannedSchemeCode('https://bbms.sferp.gos.pk/public/scheme?uid=AZUAQ-PP-19-0015&lang=en')).toBe('AZUAQ-PP-19-0015');
			expect(normalizeScannedSchemeCode('https://bbms.sferp.gos.pk/public/scheme?uid=AZUAQ-PP-19-0015#details')).toBe('AZUAQ-PP-19-0015');
		});

		test('decodes a percent-encoded uid value', () => {
			expect(normalizeScannedSchemeCode('https://bbms.sferp.gos.pk/public/scheme?uid=AZUAQ%2DPP%2D19%2D0015')).toBe('AZUAQ-PP-19-0015');
		});

		test('trims whitespace around the whole scanned URL', () => {
			expect(normalizeScannedSchemeCode('  https://bbms.sferp.gos.pk/public/scheme?uid=AZUAQ-PP-19-0015  ')).toBe('AZUAQ-PP-19-0015');
		});

		test('is case-insensitive about the "uid=" parameter name itself', () => {
			expect(normalizeScannedSchemeCode('https://bbms.sferp.gos.pk/public/scheme?UID=AZUAQ-PP-19-0015')).toBe('AZUAQ-PP-19-0015');
		});

		test('falls back to the raw trimmed text when there is no uid= parameter at all (bare uid, or some other format)', () => {
			expect(normalizeScannedSchemeCode('https://bbms.sferp.gos.pk/public/scheme?id=123')).toBe('https://bbms.sferp.gos.pk/public/scheme?id=123');
		});
	});
});
