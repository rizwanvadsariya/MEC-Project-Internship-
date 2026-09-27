'use strict';

jest.mock('../../../src/repositories/photo.repo', () => ({
	findVisitContext: jest.fn(),
	create: jest.fn(),
	list: jest.fn(),
}));
jest.mock('../../../src/lib/storage', () => ({
	upload: jest.fn(),
	remove: jest.fn(),
	createSignedUrl: jest.fn(),
}));
// photo.service.js (unlike most other services) reads config directly, not
// just through its repo — mock it the same way tests/unit/lib/pushSender.test.js
// already does, so this test never touches a real backend/.env (it crashes
// the whole `--runInBand` Jest process via config/index.js's fail-fast
// process.exit(1) otherwise, which is exactly what broke backend-ci: no
// .env/secrets are configured there).
jest.mock('../../../src/config', () => ({
	config: { STORAGE_BUCKET_VISIT_PHOTOS: 'visit-photos' },
}));

const photoRepo = require('../../../src/repositories/photo.repo');
const storage = require('../../../src/lib/storage');
const photoService = require('../../../src/services/photo.service');

const actor = { id: 'meo-1', role: 'MEO', divisionId: 1 };
const file = { mimetype: 'image/png', size: 100, buffer: Buffer.from('png') };

beforeEach(() => {
	jest.clearAllMocks();
	storage.remove.mockResolvedValue(undefined);
	photoRepo.findVisitContext.mockResolvedValue({ isLeadMeo: true });
	photoRepo.create.mockResolvedValue({ id: 'photo-1' });
	photoRepo.list.mockResolvedValue([{ id: 'photo-1', storagePath: 'visit-1/photo.png' }]);
	storage.createSignedUrl.mockResolvedValue('https://signed.example/photo.png');
});

test('lead MEO uploads an allowed photo and registers its storage path', async () => {
	await expect(photoService.upload(actor, 'visit-1', file, { caption: 'Front elevation' })).resolves.toEqual({ id: 'photo-1' });
	expect(storage.upload).toHaveBeenCalledWith(expect.any(String), expect.stringMatching(/^visit-1\/meo-1\/.+\.png$/), file);
	expect(photoRepo.create).toHaveBeenCalledWith('visit-1', actor.id, expect.any(String), { caption: 'Front elevation' });
});

test('geo-tag metadata (phases.md Step 19) passes through to the repo untouched, coordinates included', async () => {
	const metadata = { caption: 'Front elevation', geoLat: 24.8607, geoLng: 67.0011, takenAt: '2026-01-01T12:00:00.000Z' };

	await photoService.upload(actor, 'visit-1', file, metadata);

	expect(photoRepo.create).toHaveBeenCalledWith('visit-1', actor.id, expect.any(String), metadata);
});

test('uploading with no geo metadata at all still succeeds — coordinates are optional, not required', async () => {
	await expect(photoService.upload(actor, 'visit-1', file)).resolves.toEqual({ id: 'photo-1' });
	expect(photoRepo.create).toHaveBeenCalledWith('visit-1', actor.id, expect.any(String), {});
});

test('rejects non-image and oversized uploads before touching storage', async () => {
	await expect(photoService.upload(actor, 'visit-1', { ...file, mimetype: 'application/pdf' })).rejects.toMatchObject({ statusCode: 400 });
	await expect(photoService.upload(actor, 'visit-1', { ...file, size: photoService.MAX_BYTES + 1 })).rejects.toMatchObject({ statusCode: 400 });
	expect(storage.upload).not.toHaveBeenCalled();
});

test('only the lead MEO can upload, and other visible users can list signed photos once the report is submitted', async () => {
	photoRepo.findVisitContext.mockResolvedValueOnce({ isLeadMeo: false });
	await expect(photoService.upload(actor, 'visit-1', file)).rejects.toMatchObject({ statusCode: 403 });

	photoRepo.findVisitContext.mockResolvedValueOnce({ isLeadMeo: false, formSubmitted: true });
	await expect(photoService.list({ ...actor, role: 'SUPPORT_USER' }, 'visit-1')).resolves.toEqual([
		{ id: 'photo-1', storagePath: 'visit-1/photo.png', signedUrl: 'https://signed.example/photo.png' },
	]);
});

test('a non-lead viewer sees no photos before the report is submitted', async () => {
	photoRepo.findVisitContext.mockResolvedValueOnce({ isLeadMeo: false, formSubmitted: false });
	await expect(photoService.list({ ...actor, role: 'SUPPORT_USER' }, 'visit-1')).resolves.toEqual([]);
	expect(photoRepo.list).not.toHaveBeenCalled();
});

test('removes the object when database registration fails', async () => {
	photoRepo.create.mockRejectedValue(new Error('database unavailable'));
	await expect(photoService.upload(actor, 'visit-1', file)).rejects.toThrow('database unavailable');
	expect(storage.remove).toHaveBeenCalledWith(expect.any(String), expect.stringMatching(/^visit-1\/meo-1\//));
});

test('maps Storage RLS failures to a machine-readable configuration error', async () => {
	storage.upload.mockRejectedValue({ statusCode: '403', code: 'AccessDenied', namespace: 'storage', name: 'StorageApiError' });

	await expect(photoService.upload(actor, 'visit-1', file)).rejects.toMatchObject({
		statusCode: 409,
		code: 'PHOTO_STORAGE_UNAVAILABLE',
	});
});