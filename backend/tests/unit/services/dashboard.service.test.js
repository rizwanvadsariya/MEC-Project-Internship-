/** Unit: dashboard.service shapes dashboard.repo's grouped rows into
 *  zero-filled status/severity breakdowns and totals. Mocks dashboard.repo, so
 *  this covers the service's shaping contract, not the SQL itself — that's
 *  tests/integration/routes/dashboards.routes.test.js. */
'use strict';

jest.mock('../../../src/repositories/dashboard.repo', () => ({
	findDivision: jest.fn(),
	countTeamsByStatus: jest.fn(),
	countVisitsByStatus: jest.fn(),
	countIssuesByStatusAndSeverity: jest.fn(),
	listRecentVisits: jest.fn(),
	listRecentOpenIssues: jest.fn(),
	countVisitsByStatusForMember: jest.fn(),
	countFormsDueForLead: jest.fn(),
	countIssuesReportedByActor: jest.fn(),
	countVisibleOpenIssuesForMember: jest.fn(),
	countDistinctSchemesForMember: jest.fn(),
	listRecentVisitsForMember: jest.fn(),
	listRecentVisibleIssuesForMember: jest.fn(),
}));

const dashboardRepo = require('../../../src/repositories/dashboard.repo');
const dashboardService = require('../../../src/services/dashboard.service');
const ApiError = require('../../../src/lib/ApiError');

const actor = { id: 'rd-1', divisionId: 1 };

function stubDefaults() {
	dashboardRepo.findDivision.mockResolvedValue({ id: 1, name: 'Karachi' });
	dashboardRepo.countTeamsByStatus.mockResolvedValue([]);
	dashboardRepo.countVisitsByStatus.mockResolvedValue([]);
	dashboardRepo.countIssuesByStatusAndSeverity.mockResolvedValue([]);
	dashboardRepo.listRecentVisits.mockResolvedValue([]);
	dashboardRepo.listRecentOpenIssues.mockResolvedValue([]);
}

afterEach(() => jest.clearAllMocks());

test('getDivisionSummary queries every rollup scoped by the actor\'s division', async () => {
	stubDefaults();

	await dashboardService.getDivisionSummary(actor);

	expect(dashboardRepo.findDivision).toHaveBeenCalledWith(1);
	expect(dashboardRepo.countTeamsByStatus).toHaveBeenCalledWith(1);
	expect(dashboardRepo.countVisitsByStatus).toHaveBeenCalledWith(1);
	expect(dashboardRepo.countIssuesByStatusAndSeverity).toHaveBeenCalledWith(1);
	expect(dashboardRepo.listRecentVisits).toHaveBeenCalledWith(1, 5);
	expect(dashboardRepo.listRecentOpenIssues).toHaveBeenCalledWith(1, 5);
});

test('teams/visits are zero-filled across every known status, not just the ones with rows', async () => {
	stubDefaults();
	dashboardRepo.countTeamsByStatus.mockResolvedValue([{ status: 'PENDING_APPROVAL', count: 3 }]);
	dashboardRepo.countVisitsByStatus.mockResolvedValue([{ status: 'COMPLETED', count: 2 }]);

	const result = await dashboardService.getDivisionSummary(actor);

	expect(result.teams).toEqual({
		total: 3,
		byStatus: { DRAFT: 0, PENDING_APPROVAL: 3, APPROVED: 0, REJECTED: 0 },
	});
	expect(result.visits).toEqual({
		total: 2,
		byStatus: { SCHEDULED: 0, IN_PROGRESS: 0, COMPLETED: 2, CANCELLED: 0 },
	});
});

test('issues roll up into total, open (everything not RESOLVED), byStatus, and bySeverity', async () => {
	stubDefaults();
	dashboardRepo.countIssuesByStatusAndSeverity.mockResolvedValue([
		{ status: 'OPEN', severity: 'HIGH', count: 2 },
		{ status: 'OPEN', severity: 'LOW', count: 1 },
		{ status: 'RESOLVED', severity: 'HIGH', count: 4 },
	]);

	const result = await dashboardService.getDivisionSummary(actor);

	expect(result.issues.total).toBe(7);
	expect(result.issues.open).toBe(3);
	expect(result.issues.byStatus).toEqual({ OPEN: 3, ACKNOWLEDGED: 0, IN_PROGRESS: 0, RESOLVED: 4 });
	expect(result.issues.bySeverity).toEqual({ LOW: 1, MEDIUM: 0, HIGH: 6, CRITICAL: 0 });
});

test('passes through the division and recent-activity lists as-is', async () => {
	stubDefaults();
	dashboardRepo.findDivision.mockResolvedValue({ id: 1, name: 'Karachi' });
	dashboardRepo.listRecentVisits.mockResolvedValue([{ id: 'v1' }]);
	dashboardRepo.listRecentOpenIssues.mockResolvedValue([{ id: 'i1' }]);

	const result = await dashboardService.getDivisionSummary(actor);

	expect(result.division).toEqual({ id: 1, name: 'Karachi' });
	expect(result.recentVisits).toEqual([{ id: 'v1' }]);
	expect(result.recentIssues).toEqual([{ id: 'i1' }]);
});

test('throws 400 when the actor has no division assigned', async () => {
	stubDefaults();

	await expect(dashboardService.getDivisionSummary({ id: 'x', divisionId: null })).rejects.toMatchObject({ statusCode: 400 });
	expect(dashboardRepo.findDivision).not.toHaveBeenCalled();
});

test('throws 404 if the division row itself cannot be found', async () => {
	stubDefaults();
	dashboardRepo.findDivision.mockResolvedValue(null);

	await expect(dashboardService.getDivisionSummary(actor)).rejects.toMatchObject({ statusCode: 404 });
	await expect(dashboardService.getDivisionSummary(actor)).rejects.toBeInstanceOf(ApiError);
});

describe('getMemberSummary (MEO/Support, team-membership scoped)', () => {
	const memberActor = { id: 'meo-1' };

	function stubMemberDefaults() {
		dashboardRepo.countVisitsByStatusForMember.mockResolvedValue([]);
		dashboardRepo.countFormsDueForLead.mockResolvedValue(0);
		dashboardRepo.countIssuesReportedByActor.mockResolvedValue(0);
		dashboardRepo.countVisibleOpenIssuesForMember.mockResolvedValue(0);
		dashboardRepo.countDistinctSchemesForMember.mockResolvedValue(0);
		dashboardRepo.listRecentVisitsForMember.mockResolvedValue([]);
		dashboardRepo.listRecentVisibleIssuesForMember.mockResolvedValue([]);
	}

	test('queries every rollup scoped by the actor\'s own id, not a division', async () => {
		stubMemberDefaults();

		await dashboardService.getMemberSummary(memberActor);

		expect(dashboardRepo.countVisitsByStatusForMember).toHaveBeenCalledWith('meo-1');
		expect(dashboardRepo.countFormsDueForLead).toHaveBeenCalledWith('meo-1');
		expect(dashboardRepo.countIssuesReportedByActor).toHaveBeenCalledWith('meo-1');
		expect(dashboardRepo.countVisibleOpenIssuesForMember).toHaveBeenCalledWith('meo-1');
		expect(dashboardRepo.countDistinctSchemesForMember).toHaveBeenCalledWith('meo-1');
		expect(dashboardRepo.listRecentVisitsForMember).toHaveBeenCalledWith('meo-1', 5);
		expect(dashboardRepo.listRecentVisibleIssuesForMember).toHaveBeenCalledWith('meo-1', 5);
	});

	test('visits are zero-filled across every known status', async () => {
		stubMemberDefaults();
		dashboardRepo.countVisitsByStatusForMember.mockResolvedValue([{ status: 'SCHEDULED', count: 2 }]);

		const result = await dashboardService.getMemberSummary(memberActor);

		expect(result.visits).toEqual({
			total: 2,
			byStatus: { SCHEDULED: 2, IN_PROGRESS: 0, COMPLETED: 0, CANCELLED: 0 },
		});
	});

	test('passes formsDue, issues {reportedByMe, open}, schemesMonitored, and recent lists straight through', async () => {
		stubMemberDefaults();
		dashboardRepo.countFormsDueForLead.mockResolvedValue(3);
		dashboardRepo.countIssuesReportedByActor.mockResolvedValue(2);
		dashboardRepo.countVisibleOpenIssuesForMember.mockResolvedValue(4);
		dashboardRepo.countDistinctSchemesForMember.mockResolvedValue(5);
		dashboardRepo.listRecentVisitsForMember.mockResolvedValue([{ id: 'v1' }]);
		dashboardRepo.listRecentVisibleIssuesForMember.mockResolvedValue([{ id: 'i1' }]);

		const result = await dashboardService.getMemberSummary(memberActor);

		expect(result.formsDue).toBe(3);
		expect(result.issues).toEqual({ reportedByMe: 2, open: 4 });
		expect(result.schemesMonitored).toBe(5);
		expect(result.recentVisits).toEqual([{ id: 'v1' }]);
		expect(result.recentIssues).toEqual([{ id: 'i1' }]);
	});

	test('never throws for an actor with no division (SUPPORT_USER commonly has divisionId: null)', async () => {
		stubMemberDefaults();
		await expect(dashboardService.getMemberSummary({ id: 'support-1', divisionId: null })).resolves.toBeDefined();
	});
});
