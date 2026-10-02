/**
 * Unit tests for src/export/exportDivisionReport.ts (phases.md Step 29) — the
 * I/O orchestration half: expo-print, expo-sharing, and expo-file-system are
 * all mocked (matching this project's established mocking style, see
 * offlineQueue.test.ts's own expo-file-system fake), so these tests never
 * touch a real device filesystem or printer and run the same under Jest as
 * every other pure-logic suite in this app.
 */
'use strict';

let mockWrittenFiles: Map<string, string>;
let mockDeletedFileUris: string[];
let mockSharingAvailable: boolean;
let mockShareCalls: Array<{ uri: string; options: unknown }>;
let mockPrintResultUri: string;
let mockPrintBase64: string;

jest.mock('expo-print', () => ({
	printToFileAsync: jest.fn(async () => ({ uri: mockPrintResultUri, numberOfPages: 1, base64: mockPrintBase64 })),
}));

jest.mock('expo-sharing', () => ({
	isAvailableAsync: jest.fn(async () => mockSharingAvailable),
	shareAsync: jest.fn(async (uri: string, options: unknown) => {
		mockShareCalls.push({ uri, options });
	}),
}));

jest.mock('expo-file-system', () => {
	class MockFile {
		uri: string;
		constructor(...parts: Array<string | { uri: string }>) {
			this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
		}
		get exists() {
			return mockWrittenFiles.has(this.uri) && !mockDeletedFileUris.includes(this.uri);
		}
		create() {
			mockWrittenFiles.set(this.uri, '');
			const index = mockDeletedFileUris.indexOf(this.uri);
			if (index !== -1) mockDeletedFileUris.splice(index, 1);
		}
		write(content: string) {
			mockWrittenFiles.set(this.uri, content);
		}
		delete() {
			mockDeletedFileUris.push(this.uri);
		}
	}

	class MockDirectory {
		uri: string;
		exists = true;
		constructor(...parts: Array<string | { uri: string }>) {
			this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
		}
		create() {}
	}

	return { File: MockFile, Directory: MockDirectory, Paths: { cache: { uri: 'file:///cache' }, document: { uri: 'file:///document' } } };
});

import { exportDivisionReportAsExcel, exportDivisionReportAsPdf } from '../../../src/export/exportDivisionReport';
import type { DivisionReport } from '../../../src/export/divisionReport';

const sampleReport: DivisionReport = {
	title: 'Karachi — Division Report',
	divisionName: 'Karachi',
	generatedAtIso: '2026-03-10T12:00:00.000Z',
	generatedAtLabel: '10 March 2026, 12:00 PM',
	sections: [{ heading: 'Overall progress', rows: [{ label: 'Overall division progress', value: '38%' }] }],
};

beforeEach(() => {
	mockWrittenFiles = new Map();
	mockDeletedFileUris = [];
	mockSharingAvailable = true;
	mockShareCalls = [];
	mockPrintResultUri = 'file:///cache/Print/generated.pdf';
	mockPrintBase64 = 'ZmFrZS1wZGYtYnl0ZXM='; // "fake-pdf-bytes"
	jest.clearAllMocks();
});

describe('exportDivisionReportAsPdf', () => {
	test('requests base64 PDF data and writes it into the app\'s own export directory, never sharing expo-print\'s raw cache URI', async () => {
		const Print = require('expo-print');
		const result = await exportDivisionReportAsPdf(sampleReport);

		// Real on-device bug: sharing expo-print's own output URI fails under
		// Expo Go's Android FileProvider config ("Not allowed to read file
		// under given URL"), and a follow-up fix attempt that copied that URI
		// via expo-file-system's File#copy failed too ("Missing READ
		// permission"). The actual fix avoids reading that file at all —
		// expo-print is asked for base64 content directly, which is then
		// written into this module's own exports/ directory, the one path
		// already proven to share successfully (same as the Excel export).
		expect((Print.printToFileAsync as jest.Mock).mock.calls[0][0]).toMatchObject({ base64: true });
		expect(result.uri).not.toBe(mockPrintResultUri);
		expect(result.uri).toContain('exports');
		expect(result.uri).toContain('karachi-division-report-');
		expect(result.uri.endsWith('.pdf')).toBe(true);
		expect(mockWrittenFiles.get(result.uri)).toBe(mockPrintBase64);
	});

	test('shares the written file, not the original printToFileAsync URI, when sharing is available', async () => {
		const result = await exportDivisionReportAsPdf(sampleReport);

		expect(result.shared).toBe(true);
		expect(mockShareCalls).toHaveLength(1);
		expect(mockShareCalls[0].uri).toBe(result.uri);
		expect(mockShareCalls[0].options).toMatchObject({ mimeType: 'application/pdf', dialogTitle: sampleReport.title });
	});

	test('the printed HTML actually contains the report content', async () => {
		const Print = require('expo-print');
		await exportDivisionReportAsPdf(sampleReport);
		const htmlPassed = (Print.printToFileAsync as jest.Mock).mock.calls[0][0].html as string;
		expect(htmlPassed).toContain('Karachi — Division Report');
		expect(htmlPassed).toContain('Overall division progress');
	});

	test('when expo-print returns no base64 data, throws rather than silently writing an empty/corrupt file', async () => {
		mockPrintBase64 = '';
		await expect(exportDivisionReportAsPdf(sampleReport)).rejects.toThrow();
	});

	test('when sharing is unavailable, the written file still exists and shared is false (never throws)', async () => {
		mockSharingAvailable = false;
		const result = await exportDivisionReportAsPdf(sampleReport);
		expect(result.shared).toBe(false);
		expect(mockWrittenFiles.has(result.uri)).toBe(true);
		expect(mockShareCalls).toHaveLength(0);
	});

	test('exporting the same report twice overwrites the file rather than erroring on an existing one', async () => {
		const first = await exportDivisionReportAsPdf(sampleReport);
		const second = await exportDivisionReportAsPdf(sampleReport);
		expect(first.uri).toBe(second.uri);
		expect(mockWrittenFiles.has(first.uri)).toBe(true);
	});
});

describe('exportDivisionReportAsExcel', () => {
	test('writes a base64-encoded workbook to the exports directory and shares it', async () => {
		const result = await exportDivisionReportAsExcel(sampleReport);

		expect(result.uri).toContain('exports');
		expect(result.uri).toContain('karachi-division-report-');
		expect(result.shared).toBe(true);
		expect(mockWrittenFiles.get(result.uri)).toEqual(expect.any(String));
		expect(mockWrittenFiles.get(result.uri)!.length).toBeGreaterThan(0);
	});

	test('shares the file with the Excel mime type and the report title as the dialog title', async () => {
		await exportDivisionReportAsExcel(sampleReport);
		expect(mockShareCalls[0].options).toMatchObject({
			mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			dialogTitle: sampleReport.title,
		});
	});

	test('when sharing is unavailable, the file is still written and shared is false (never throws)', async () => {
		mockSharingAvailable = false;
		const result = await exportDivisionReportAsExcel(sampleReport);
		expect(result.shared).toBe(false);
		expect(mockWrittenFiles.has(result.uri)).toBe(true);
	});

	test('exporting the same report twice overwrites rather than erroring on an existing file', async () => {
		const first = await exportDivisionReportAsExcel(sampleReport);
		const second = await exportDivisionReportAsExcel(sampleReport);
		expect(first.uri).toBe(second.uri);
		expect(mockWrittenFiles.has(first.uri)).toBe(true);
	});
});
