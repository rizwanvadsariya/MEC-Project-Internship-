/**
 * Pure-logic tests for src/export/reportFormats.ts (phases.md Step 29) — the
 * HTML/XLSX rendering half of the export feature. Uses the real `xlsx`
 * package (pure JS, no native module) to both write and read back the
 * generated workbook, so the Excel assertions prove the file is actually
 * well-formed and round-trips its data, not just that a base64 string came
 * out the other end.
 */
import * as XLSX from 'xlsx';
import { buildReportFilename, escapeHtml, reportToHtml, reportToWorkbookBase64 } from '../../../src/export/reportFormats';
import type { DivisionReport } from '../../../src/export/divisionReport';

const sampleReport: DivisionReport = {
	title: 'Karachi — Division Report',
	divisionName: 'Karachi',
	generatedAtIso: '2026-03-10T12:00:00.000Z',
	generatedAtLabel: '10 March 2026, 12:00 PM',
	sections: [
		{
			heading: 'Overall progress',
			rows: [
				{ label: 'Overall division progress', value: '38%' },
				{ label: 'Schemes reported', value: '4 of 16 schemes reported' },
			],
		},
		{
			heading: 'Progress by department',
			rows: [
				{ label: 'Agriculture', value: '43% (4 of 10 schemes reported)' },
				{ label: 'Health', value: 'Not yet reported (0 of 6 schemes reported)' },
			],
		},
	],
};

describe('escapeHtml', () => {
	test('escapes the five HTML-significant characters', () => {
		expect(escapeHtml(`<script>"&'`)).toBe('&lt;script&gt;&quot;&amp;&#39;');
	});

	test('leaves ordinary text untouched', () => {
		expect(escapeHtml('Agriculture Department')).toBe('Agriculture Department');
	});
});

describe('reportToHtml', () => {
	test('embeds the report title, generated-at label, and every section heading', () => {
		const html = reportToHtml(sampleReport);
		expect(html).toContain('Karachi — Division Report');
		expect(html).toContain('10 March 2026, 12:00 PM');
		expect(html).toContain('Overall progress');
		expect(html).toContain('Progress by department');
	});

	test('embeds every row\'s label and value', () => {
		const html = reportToHtml(sampleReport);
		expect(html).toContain('Agriculture');
		expect(html).toContain('43% (4 of 10 schemes reported)');
	});

	test('a scheme/department name containing HTML-significant characters is escaped, never injected raw', () => {
		const maliciousReport: DivisionReport = {
			...sampleReport,
			sections: [{ heading: 'Test', rows: [{ label: '<img src=x onerror=alert(1)>', value: 'ok' }] }],
		};
		const html = reportToHtml(maliciousReport);
		expect(html).not.toContain('<img src=x onerror=alert(1)>');
		expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
	});

	test('produces a well-formed HTML document expo-print can hand to its WebView renderer', () => {
		const html = reportToHtml(sampleReport);
		expect(html).toContain('<!DOCTYPE html>');
		expect(html).toContain('<html>');
		expect(html).toContain('</html>');
	});
});

describe('reportToWorkbookBase64', () => {
	test('produces a base64 string that XLSX can parse back into a workbook with the real data', () => {
		const base64 = reportToWorkbookBase64(sampleReport);
		expect(typeof base64).toBe('string');
		expect(base64.length).toBeGreaterThan(0);

		const workbook = XLSX.read(base64, { type: 'base64' });
		expect(workbook.SheetNames).toEqual(['Division Report']);

		const sheet = workbook.Sheets['Division Report'];
		const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });

		const flattened = rows.map((row) => row.join('|')).join('\n');
		expect(flattened).toContain('Karachi — Division Report');
		expect(flattened).toContain('Overall progress');
		expect(flattened).toContain('Overall division progress|38%');
		expect(flattened).toContain('Agriculture|43% (4 of 10 schemes reported)');
	});

	test('two different reports produce two different workbooks (not a cached/stale sheet)', () => {
		const other: DivisionReport = { ...sampleReport, title: 'Jacobabad — Division Report', divisionName: 'Jacobabad' };
		const base64A = reportToWorkbookBase64(sampleReport);
		const base64B = reportToWorkbookBase64(other);
		expect(base64A).not.toBe(base64B);
	});
});

describe('buildReportFilename', () => {
	test('slugifies the division name and appends a date + extension', () => {
		const filename = buildReportFilename('Karachi', 'pdf', new Date('2026-03-10T12:00:00.000Z').getTime());
		expect(filename).toBe('karachi-division-report-2026-03-10.pdf');
	});

	test('a division name with spaces and punctuation collapses to single hyphens', () => {
		const filename = buildReportFilename('Hyderabad & Mirpurkhas', 'xlsx', new Date('2026-01-05T00:00:00.000Z').getTime());
		expect(filename).toBe('hyderabad-mirpurkhas-division-report-2026-01-05.xlsx');
	});

	test('an empty/unusable division name falls back to "division" rather than producing a malformed filename', () => {
		const filename = buildReportFilename('   ', 'pdf', new Date('2026-01-05T00:00:00.000Z').getTime());
		expect(filename).toBe('division-division-report-2026-01-05.pdf');
	});
});
