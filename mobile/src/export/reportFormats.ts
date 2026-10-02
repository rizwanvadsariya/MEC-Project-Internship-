/**
 * Renders a `DivisionReport` (divisionReport.ts) into the two offline-sharable
 * formats phases.md Step 29 asks for: an HTML document (handed to expo-print
 * to rasterize into a PDF) and an .xlsx workbook (via the pure-JS `xlsx`
 * package — no native module, so it carries none of this project's standing
 * "can't verify a native module without a device" risk, same reasoning
 * `AnalyticsScreen.tsx` already gives for staying chart-library-free).
 *
 * Both functions are pure (data in, string out) and deliberately kept
 * separate from exportDivisionReport.ts's actual file-write/share/print I/O,
 * so this half — the part that can actually go wrong in a subtle,
 * reviewable way (a missing escape, a malformed sheet) — is fully unit
 * testable without mocking a single Expo module.
 */
import * as XLSX from 'xlsx';
import type { DivisionReport } from './divisionReport';

/** Minimal HTML-escaping for values that ultimately come from user/DB
 *  content (scheme/department names) — this string is handed to expo-print's
 *  WebView-based renderer, so an unescaped `<`/`&` could corrupt the layout
 *  or (in the worst case) inject markup into the generated PDF. */
export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

export function reportToHtml(report: DivisionReport): string {
	const sectionsHtml = report.sections
		.map((section) => {
			const rowsHtml = section.rows
				.map((row) => `<tr><td class="label">${escapeHtml(row.label)}</td><td class="value">${escapeHtml(row.value)}</td></tr>`)
				.join('');
			return `
				<section>
					<h2>${escapeHtml(section.heading)}</h2>
					<table>${rowsHtml}</table>
				</section>
			`;
		})
		.join('');

	return `
		<!DOCTYPE html>
		<html>
			<head>
				<meta charset="utf-8" />
				<style>
					body { font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; color: #212529; padding: 24px; }
					h1 { font-size: 22px; margin-bottom: 4px; }
					.generatedAt { color: #495057; font-size: 12px; margin-bottom: 24px; }
					h2 { font-size: 15px; margin-top: 20px; margin-bottom: 8px; color: #2E7D32; }
					table { width: 100%; border-collapse: collapse; }
					td { padding: 6px 8px; border-bottom: 1px solid #DEE2E6; font-size: 13px; }
					td.label { color: #495057; }
					td.value { color: #212529; font-weight: 600; text-align: right; }
				</style>
			</head>
			<body>
				<h1>${escapeHtml(report.title)}</h1>
				<div class="generatedAt">${escapeHtml(report.generatedAtLabel)}</div>
				${sectionsHtml}
			</body>
		</html>
	`;
}

/** One worksheet, sections stacked with a blank separator row — kept to a
 *  single sheet (rather than one sheet per section) so the exported file
 *  reads top-to-bottom exactly like the PDF/on-screen report does. */
export function reportToWorkbookBase64(report: DivisionReport): string {
	const aoa: (string | number)[][] = [[report.title], [report.generatedAtLabel], []];

	for (const section of report.sections) {
		aoa.push([section.heading]);
		for (const row of section.rows) {
			aoa.push([row.label, row.value]);
		}
		aoa.push([]);
	}

	const worksheet = XLSX.utils.aoa_to_sheet(aoa);
	worksheet['!cols'] = [{ wch: 36 }, { wch: 24 }];
	const workbook = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(workbook, worksheet, 'Division Report');
	return XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
}

/** "karachi-division-report-2026-09-30.pdf" — stable, filesystem-safe,
 *  collision-resistant-enough-for-a-single-export-at-a-time filename. */
export function buildReportFilename(divisionName: string, extension: 'pdf' | 'xlsx', now: number = Date.now()): string {
	const slug = divisionName
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'division';
	const datePart = new Date(now).toISOString().slice(0, 10);
	return `${slug}-division-report-${datePart}.${extension}`;
}
