/**
 * Pure-logic tests for src/map/mapColors.ts (phases.md Step 30) — no
 * rendering, matching this project's established tests/unit/ precedent.
 */
import { colorForProgress, colorForSeverity } from '../../../src/map/mapColors';

const theme = { success: 'GREEN', warning: 'AMBER', error: 'RED', border: 'GRAY' };

describe('colorForProgress', () => {
	test('null (no data reported yet) is neutral gray, never implies 0%', () => {
		expect(colorForProgress(null, theme)).toBe('GRAY');
	});

	test('>=75% is green', () => {
		expect(colorForProgress(75, theme)).toBe('GREEN');
		expect(colorForProgress(100, theme)).toBe('GREEN');
	});

	test('40-74% is amber', () => {
		expect(colorForProgress(40, theme)).toBe('AMBER');
		expect(colorForProgress(74.9, theme)).toBe('AMBER');
	});

	test('under 40% is red', () => {
		expect(colorForProgress(0, theme)).toBe('RED');
		expect(colorForProgress(39.9, theme)).toBe('RED');
	});
});

describe('colorForSeverity', () => {
	test('no breakdown at all (role/division can\'t see it) is neutral gray, never implies zero issues', () => {
		expect(colorForSeverity(null, theme)).toBe('GRAY');
		expect(colorForSeverity(undefined, theme)).toBe('GRAY');
	});

	test('zero open issues is a deliberately reassuring green, distinct from "no data"', () => {
		expect(colorForSeverity({ openIssues: 0, critical: 0, high: 0 }, theme)).toBe('GREEN');
	});

	test('any critical open issue is red, regardless of high count', () => {
		expect(colorForSeverity({ openIssues: 3, critical: 1, high: 0 }, theme)).toBe('RED');
	});

	test('any high open issue (no critical) is also red', () => {
		expect(colorForSeverity({ openIssues: 2, critical: 0, high: 1 }, theme)).toBe('RED');
	});

	test('open issues present but only low/medium severity is amber', () => {
		expect(colorForSeverity({ openIssues: 4, critical: 0, high: 0 }, theme)).toBe('AMBER');
	});
});
