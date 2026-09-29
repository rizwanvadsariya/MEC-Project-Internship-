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
	countProgressByDepartment: jest.fn(),
	listRecentVisits: jest.fn(),
	listRecentOpenIssues: jest.fn(),
	countVisitsByStatusForMember: jest.fn(),
	countFormsDueForLead: jest.fn(),
	countIssuesReportedByActor: jest.fn(),
	countVisibleOpenIssuesForMember: jest.fn(),
	countDistinctSchemesForMember: jest.fn(),
	listRecentVisitsForMember: jest.fn(),
	listRecentVisibleIssuesForMember: jest.fn(),
	countProgressReconciliationSummary: jest.fn(),
	listProgressReconciliation: jest.fn(),
}));
// Step 25: getDivisionSummary fires the overdue-escalation trigger — mocked
// here so this stays a pure unit test of dashboard.service's own shaping
// logic (no real repos/db.config touched), same as every other service test
// in this suite. notification.service's own trigger logic is covered by
// tests/unit/services/notification.service.test.js.
jest.mock('../../../src/services/notification.service', () => ({ escalateOverdueIssues: jest.fn() }));

const dashboardRepo = require('../../../src/repositories/dashboard.repo');
const notificationService = require('../../../src/services/notification.service');
const dashboardService = require('../../../src/services/dashboard.service');
const ApiError = require('../../../src/lib/ApiError');

const actor = { id: 'rd-1', divisionId: 1 };

function stubDefaults() {
	dashboardRepo.findDivision.mockResolvedValue({ id: 1, name: 'Karachi' });
	dashboardRepo.countTeamsByStatus.mockResolvedValue([]);
	dashboardRepo.countVisitsByStatus.mockResolvedValue([]);
	dashboardRepo.countIssuesByStatusAndSeverity.mockResolvedValue([]);
	dashboardRepo.countProgressByDepartment.mockResolvedValue([]);
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
	expect(dashboardRepo.countProgressByDepartment).toHaveBeenCalledWith(1);
	expect(dashboardRepo.listRecentVisits).toHaveBeenCalledWith(1, 5);
	expect(dashboardRepo.listRecentOpenIssues).toHaveBeenCalledWith(1, 5);
});

describe('progressByDepartment / overallProgress (Step 23 analytics)', () => {
	test('passes the per-department rows straight through as progressByDepartment', async () => {
		stubDefaults();
		const rows = [
			{ departmentId: 1, departmentName: 'Health', schemesTotal: 10, schemesReported: 4, avgProgressPct: 50 },
			{ departmentId: 2, departmentName: 'Education', schemesTotal: 5, schemesReported: 0, avgProgressPct: null },
		];
		dashboardRepo.countProgressByDepartment.mockResolvedValue(rows);

		const result = await dashboardService.getDivisionSummary(actor);

		expect(result.progressByDepartment).toEqual(rows);
	});

	test('a department with zero reported schemes shows avgProgressPct: null, never 0 or NaN', async () => {
		stubDefaults();
		dashboardRepo.countProgressByDepartment.mockResolvedValue([
			{ departmentId: 1, departmentName: 'Health', schemesTotal: 3, schemesReported: 0, avgProgressPct: null },
		]);

		const result = await dashboardService.getDivisionSummary(actor);

		expect(result.progressByDepartment[0].avgProgressPct).toBeNull();
	});

	test('overallProgress is a weighted average by schemesReported, not a naive average-of-averages', async () => {
		stubDefaults();
		dashboardRepo.countProgressByDepartment.mockResolvedValue([
			{ departmentId: 1, departmentName: 'Health', schemesTotal: 10, schemesReported: 8, avgProgressPct: 90 },
			{ departmentId: 2, departmentName: 'Education', schemesTotal: 5, schemesReported: 2, avgProgressPct: 10 },
		]);

		const result = await dashboardService.getDivisionSummary(actor);

		// naive average-of-averages would be (90+10)/2 = 50; weighted by
		// schemesReported (8 vs 2) is (90*8 + 10*2) / 10 = 74.
		expect(result.overallProgress).toEqual({ avgProgressPct: 74, schemesReported: 10, schemesTotal: 15 });
	});

	test('overallProgress.avgProgressPct is null when no scheme in the division has been reported on yet', async () => {
		stubDefaults();
		dashboardRepo.countProgressByDepartment.mockResolvedValue([
			{ departmentId: 1, departmentName: 'Health', schemesTotal: 3, schemesReported: 0, avgProgressPct: null },
			{ departmentId: 2, departmentName: 'Education', schemesTotal: 2, schemesReported: 0, avgProgressPct: null },
		]);

		const result = await dashboardService.getDivisionSummary(actor);

		expect(result.overallProgress).toEqual({ avgProgressPct: null, schemesReported: 0, schemesTotal: 5 });
	});

	test('overallProgress on a division with no schemes at all is all zeros/null', async () => {
		stubDefaults();
		dashboardRepo.countProgressByDepartment.mockResolvedValue([]);

		const result = await dashboardService.getDivisionSummary(actor);

		expect(result.overallProgress).toEqual({ avgProgressPct: null, schemesReported: 0, schemesTotal: 0 });
	});
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

describe('overdue-escalation trigger (Step 25)', () => {
	test('fires escalateOverdueIssues for the actor\'s division on a successful load', async () => {
		stubDefaults();

		await dashboardService.getDivisionSummary(actor);

		expect(notificationService.escalateOverdueIssues).toHaveBeenCalledWith(1);
		expect(notificationService.escalateOverdueIssues).toHaveBeenCalledTimes(1);
	});

	test('never fires when the division cannot be found', async () => {
		stubDefaults();
		dashboardRepo.findDivision.mockResolvedValue(null);

		await expect(dashboardService.getDivisionSummary(actor)).rejects.toMatchObject({ statusCode: 404 });

		expect(notificationService.escalateOverdueIssues).not.toHaveBeenCalled();
	});
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

describe('getProgressReconciliation (Step 27 — physical vs. financial progress)', () => {
	function stubReconciliationDefaults() {
		dashboardRepo.countProgressReconciliationSummary.mockResolvedValue({ schemesTotal: 10, schemesWithBothValues: 6, schemesFlagged: 2 });
		dashboardRepo.listProgressReconciliation.mockResolvedValue({ rows: [], nextCursor: null });
	}

	test('queries the summary and the list both scoped by the actor\'s division, with the fixed flag threshold', async () => {
		stubReconciliationDefaults();

		await dashboardService.getProgressReconciliation(actor, { limit: 20 });

		expect(dashboardRepo.countProgressReconciliationSummary).toHaveBeenCalledWith(1, 25);
		expect(dashboardRepo.listProgressReconciliation).toHaveBeenCalledWith(1, { limit: 20, minGap: undefined, cursor: undefined });
	});

	test('flaggedOnly=true passes the flag threshold as minGap; omitted/false passes minGap: undefined (no filter)', async () => {
		stubReconciliationDefaults();

		await dashboardService.getProgressReconciliation(actor, { flaggedOnly: true, limit: 20 });
		expect(dashboardRepo.listProgressReconciliation).toHaveBeenCalledWith(1, { limit: 20, minGap: 25, cursor: undefined });

		jest.clearAllMocks();
		stubReconciliationDefaults();
		await dashboardService.getProgressReconciliation(actor, { flaggedOnly: false, limit: 20 });
		expect(dashboardRepo.listProgressReconciliation).toHaveBeenCalledWith(1, { limit: 20, minGap: undefined, cursor: undefined });
	});

	test('decodes a cursor into {absGap, id} on the last "_", parsing absGap as a number', async () => {
		stubReconciliationDefaults();

		await dashboardService.getProgressReconciliation(actor, { cursor: '17.5_scheme-1', limit: 20 });

		expect(dashboardRepo.listProgressReconciliation).toHaveBeenCalledWith(1, { limit: 20, minGap: undefined, cursor: { absGap: 17.5, id: 'scheme-1' } });
	});

	test('throws 400 on a malformed cursor with no separator or a non-numeric absGap', async () => {
		stubReconciliationDefaults();

		await expect(dashboardService.getProgressReconciliation(actor, { cursor: 'not-a-cursor', limit: 20 })).rejects.toMatchObject({ statusCode: 400 });
		await expect(dashboardService.getProgressReconciliation(actor, { cursor: 'abc_scheme-1', limit: 20 })).rejects.toMatchObject({ statusCode: 400 });
		expect(dashboardRepo.listProgressReconciliation).not.toHaveBeenCalled();
	});

	test('throws 400 when the actor has no division assigned', async () => {
		stubReconciliationDefaults();

		await expect(dashboardService.getProgressReconciliation({ id: 'x', divisionId: null }, { limit: 20 })).rejects.toMatchObject({ statusCode: 400 });
		expect(dashboardRepo.countProgressReconciliationSummary).not.toHaveBeenCalled();
	});

	test('merges the summary counts with the flag threshold and the paginated rows into one flat result', async () => {
		dashboardRepo.countProgressReconciliationSummary.mockResolvedValue({ schemesTotal: 10, schemesWithBothValues: 6, schemesFlagged: 2 });
		dashboardRepo.listProgressReconciliation.mockResolvedValue({ rows: [{ id: 1, gap: 30 }], nextCursor: '30_1' });

		const result = await dashboardService.getProgressReconciliation(actor, { limit: 20 });

		expect(result).toEqual({
			schemesTotal: 10,
			schemesWithBothValues: 6,
			schemesFlagged: 2,
			flagThresholdPct: 25,
			rows: [{ id: 1, gap: 30 }],
			nextCursor: '30_1',
		});
	});
});
