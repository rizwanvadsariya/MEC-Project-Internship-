/**
 * Orchestrates the actual PDF/Excel export (phases.md Step 29): renders a
 * DivisionReport (reportFormats.ts) to a real file via expo-print (PDF) or a
 * direct expo-file-system write (Excel), then hands it to expo-sharing so the
 * user can save/send it — this is the "offline reporting" half of the step's
 * own name, giving an RD/DG a file they can keep or forward without a live
 * connection to the app.
 *
 * Sharing isn't guaranteed available on every device/build (expo-sharing's
 * own isAvailableAsync() contract) — never throws for that case, matches
 * this project's established "can't verify without a real device, degrade
 * gracefully" pattern (Step 17's push registration, Step 19's location
 * capture): the file is still generated and its on-device URI is returned,
 * `shared: false` just tells the caller sharing wasn't offered.
 *
 * Real on-device bugs found and fixed, in order:
 *
 * 1. `expo-print`'s own `printToFileAsync` writes its output into a
 *    `cache/Print/…` subfolder that Expo Go's bundled-in Android
 *    FileProvider config doesn't grant read access to — `Sharing.shareAsync()`
 *    on that raw URI failed with "Not allowed to read file under given URL",
 *    even though the identical share call against the Excel export (written
 *    directly into this module's own `cache/exports/` directory) worked.
 * 2. The first fix attempt — `new File(printedUri).copy(destination)`,
 *    mirroring the offline-photo queue's own cache-to-document copy
 *    (offlineQueue.ts's `persistPhotoFile`, Step 18) — hit a *second*,
 *    different wall: expo-file-system's new File/Directory API failed with
 *    "Missing 'READ' permission for accessing the file." The photo-queue
 *    precedent copies a file the OS image picker already granted this app
 *    read access to; `expo-print`'s output was never granted that way, and
 *    reconstructing a `File` from its raw string URI doesn't retroactively
 *    acquire it.
 *
 * The actual fix needs no cross-boundary file read at all: `printToFileAsync`
 * can return the PDF as a base64 string directly (`{ base64: true }`), which
 * is then written into our own `cache/exports/` file the exact same way the
 * Excel export already does — the one path already proven to share
 * successfully.
 */
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Directory, File, Paths } from 'expo-file-system';
import type { DivisionReport } from './divisionReport';
import { buildReportFilename, reportToHtml, reportToWorkbookBase64 } from './reportFormats';

export type ExportResult = { uri: string; shared: boolean };

const EXPORT_DIR_NAME = 'exports';

async function shareFile(uri: string, mimeType: string, dialogTitle: string): Promise<boolean> {
	const available = await Sharing.isAvailableAsync();
	if (!available) return false;
	await Sharing.shareAsync(uri, { mimeType, dialogTitle });
	return true;
}

function exportDir(): Directory {
	const dir = new Directory(Paths.cache, EXPORT_DIR_NAME);
	if (!dir.exists) dir.create({ intermediates: true });
	return dir;
}

function writeToExportDir(filename: string, base64Content: string): File {
	const file = new File(exportDir(), filename);
	if (file.exists) file.delete();
	file.create();
	file.write(base64Content, { encoding: 'base64' });
	return file;
}

export async function exportDivisionReportAsPdf(report: DivisionReport): Promise<ExportResult> {
	const html = reportToHtml(report);
	const { base64 } = await Print.printToFileAsync({ html, base64: true });
	if (!base64) throw new Error('expo-print did not return base64 PDF data.');
	const filename = buildReportFilename(report.divisionName, 'pdf');
	const file = writeToExportDir(filename, base64);
	const shared = await shareFile(file.uri, 'application/pdf', report.title);
	return { uri: file.uri, shared };
}

export async function exportDivisionReportAsExcel(report: DivisionReport): Promise<ExportResult> {
	const base64 = reportToWorkbookBase64(report);
	const filename = buildReportFilename(report.divisionName, 'xlsx');
	const file = writeToExportDir(filename, base64);
	const shared = await shareFile(
		file.uri,
		'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		report.title,
	);
	return { uri: file.uri, shared };
}
