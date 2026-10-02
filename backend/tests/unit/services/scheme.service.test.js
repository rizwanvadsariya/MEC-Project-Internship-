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
	mapDivisionSummary: jest.fn(),
	mapDistrictSummary: jest.fn(),
}));

jest.mock('../../../src/repositories/dashboard.repo', () => ({
	countIssuesByDistrict: jest.fn(),
}));

const schemeRepo = require('../../../src/repositories/scheme.repo');
const dashboardRepo = require('../../../src/repositories/dashboard.repo');
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

describe('getMapSummary (Step 30 — GIS map view)', () => {
	beforeEach(() => {
		schemeRepo.mapDivisionSummary.mockResolvedValue([{ divisionId: 1, divisionName: 'Karachi', schemesTotal: 10, schemesReported: 4, avgPhysicalProgressPct: 40 }]);
		schemeRepo.mapDistrictSummary.mockResolvedValue([{ districtId: 1, districtName: 'Malir', divisionId: 1, schemesTotal: 3, schemesReported: 1, avgPhysicalProgressPct: 20 }]);
	});

	test('always returns division/district progress rollups, province-wide, regardless of role', async () => {
		const result = await schemeService.getMapSummary({ id: 'support-1', role: 'SUPPORT_USER', divisionId: null });

		expect(schemeRepo.mapDivisionSummary).toHaveBeenCalled();
		expect(schemeRepo.mapDistrictSummary).toHaveBeenCalled();
		expect(result.divisions).toEqual([{ divisionId: 1, divisionName: 'Karachi', schemesTotal: 10, schemesReported: 4, avgPhysicalProgressPct: 40 }]);
		expect(result.districts).toEqual([{ districtId: 1, districtName: 'Malir', divisionId: 1, schemesTotal: 3, schemesReported: 1, avgPhysicalProgressPct: 20 }]);
	});

	test('RD with a division gets issuesByDistrict scoped to their own division', async () => {
		dashboardRepo.countIssuesByDistrict.mockResolvedValue([{ districtId: 1, districtName: 'Malir', openIssues: 2, critical: 1, high: 0, medium: 1, low: 0 }]);

		const result = await schemeService.getMapSummary({ id: 'rd-1', role: 'REGIONAL_DIRECTOR', divisionId: 1 });

		expect(dashboardRepo.countIssuesByDistrict).toHaveBeenCalledWith(1);
		expect(result.issuesByDistrict).toEqual([{ districtId: 1, districtName: 'Malir', openIssues: 2, critical: 1, high: 0, medium: 1, low: 0 }]);
	});

	test('DG with a division also gets issuesByDistrict', async () => {
		dashboardRepo.countIssuesByDistrict.mockResolvedValue([]);

		await schemeService.getMapSummary({ id: 'dg-1', role: 'DIRECTOR_GENERAL', divisionId: 2 });

		expect(dashboardRepo.countIssuesByDistrict).toHaveBeenCalledWith(2);
	});

	test('MEO/Support get an empty issuesByDistrict without ever calling dashboard.repo (not a 403 — the base map still works)', async () => {
		const meoResult = await schemeService.getMapSummary({ id: 'meo-1', role: 'MEO', divisionId: 1 });
		const supportResult = await schemeService.getMapSummary({ id: 'support-1', role: 'SUPPORT_USER', divisionId: null });

		expect(dashboardRepo.countIssuesByDistrict).not.toHaveBeenCalled();
		expect(meoResult.issuesByDistrict).toEqual([]);
		expect(supportResult.issuesByDistrict).toEqual([]);
	});

	test('an RD/DG with no division assigned also gets an empty issuesByDistrict, never throws', async () => {
		const result = await schemeService.getMapSummary({ id: 'rd-no-division', role: 'REGIONAL_DIRECTOR', divisionId: null });

		expect(dashboardRepo.countIssuesByDistrict).not.toHaveBeenCalled();
		expect(result.issuesByDistrict).toEqual([]);
	});
});
