/** Unit: scheme.service delegates list/getById/getByUid/getFilterOptions to
 *  scheme.repo and translates a missing row into a 404. Mocks scheme.repo, so
 *  this covers the service's contract, not the SQL itself — that's
 *  tests/integration/routes/schemes.routes.test.js. */
'use strict';

jest.mock('../../../src/repositories/scheme.repo', () => ({
	list: jest.fn(),
	findById: jest.fn(),
	findByUid: jest.fn(),
	filterOptions: jest.fn(),
}));

const schemeRepo = require('../../../src/repositories/scheme.repo');
const schemeService = require('../../../src/services/scheme.service');
const ApiError = require('../../../src/lib/ApiError');

const user = { id: 'rd-1', divisionId: 1 };

afterEach(() => jest.clearAllMocks());

test('list delegates the filters straight through to scheme.repo (province-wide, no actor scoping)', async () => {
	schemeRepo.list.mockResolvedValue({ rows: [{ id: 1 }], nextCursor: null });

	const result = await schemeService.list({ search: 'AGRAE' });

	expect(schemeRepo.list).toHaveBeenCalledWith({ search: 'AGRAE' });
	expect(result).toEqual({ rows: [{ id: 1 }], nextCursor: null });
});

test('getById returns the scheme scheme.repo finds', async () => {
	schemeRepo.findById.mockResolvedValue({ id: 1, uid: 'AGRAE-PP-16-0003' });

	const result = await schemeService.getById(user, 1);

	expect(schemeRepo.findById).toHaveBeenCalledWith(1);
	expect(result).toEqual({ id: 1, uid: 'AGRAE-PP-16-0003' });
});

test('getById throws 404 when scheme.repo finds nothing', async () => {
	schemeRepo.findById.mockResolvedValue(null);

	await expect(schemeService.getById(user, 999)).rejects.toMatchObject({ statusCode: 404 });
	await expect(schemeService.getById(user, 999)).rejects.toBeInstanceOf(ApiError);
});

describe('getByUid (Step 28 — QR scan-to-open)', () => {
	test('returns the scheme scheme.repo finds by uid', async () => {
		schemeRepo.findByUid.mockResolvedValue({ id: 42, uid: 'AGRAE-PP-16-0003', name: 'Test Scheme' });

		const result = await schemeService.getByUid(user, 'AGRAE-PP-16-0003');

		expect(schemeRepo.findByUid).toHaveBeenCalledWith('AGRAE-PP-16-0003');
		expect(result).toEqual({ id: 42, uid: 'AGRAE-PP-16-0003', name: 'Test Scheme' });
	});

	test('throws 404 when no scheme matches the scanned/typed uid', async () => {
		schemeRepo.findByUid.mockResolvedValue(null);

		await expect(schemeService.getByUid(user, 'NOT-A-REAL-UID')).rejects.toMatchObject({ statusCode: 404 });
		await expect(schemeService.getByUid(user, 'NOT-A-REAL-UID')).rejects.toBeInstanceOf(ApiError);
	});

	test('is open to any authenticated user, not division-scoped (mirrors getById)', async () => {
		schemeRepo.findByUid.mockResolvedValue({ id: 1, uid: 'X' });

		await schemeService.getByUid({ id: 'support-1', divisionId: null }, 'X');

		expect(schemeRepo.findByUid).toHaveBeenCalledWith('X');
	});
});

test('getFilterOptions delegates to scheme.repo', async () => {
	schemeRepo.filterOptions.mockResolvedValue({ divisions: [], districts: [], departments: [], subSectors: [], statuses: [] });

	const result = await schemeService.getFilterOptions();

	expect(schemeRepo.filterOptions).toHaveBeenCalled();
	expect(result).toEqual({ divisions: [], districts: [], departments: [], subSectors: [], statuses: [] });
});
