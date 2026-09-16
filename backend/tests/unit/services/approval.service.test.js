/** Unit: approve/reject writes an append-only request row and flips team status;
 *  APPROVE creates exactly one site_visit. Mocks approval.repo, so this covers
 *  the service's contract (delegation + not-found handling), not the SQL
 *  itself — that's tests/integration/db/siteVisitCreation.test.js. */
'use strict';

// Factory form (not bare jest.mock(path)) so the real module — which requires
// src/config/database, fatal at require-time with no backend/.env — is never
// actually loaded; this test needs to run in CI with no .env too.
jest.mock('../../../src/repositories/approval.repo', () => ({
	listPending: jest.fn(),
	decide: jest.fn(),
}));

const approvalRepo = require('../../../src/repositories/approval.repo');
const approvalService = require('../../../src/services/approval.service');
const ApiError = require('../../../src/lib/ApiError');

const actor = { id: 'dg-1', divisionId: 1 };

afterEach(() => jest.clearAllMocks());

test('listPending delegates to approval.repo scoped by the actor\'s division', async () => {
	approvalRepo.listPending.mockResolvedValue([{ requestId: 'r1' }]);

	const result = await approvalService.listPending(actor);

	expect(approvalRepo.listPending).toHaveBeenCalledWith(actor.divisionId);
	expect(result).toEqual([{ requestId: 'r1' }]);
});

test('approve writes an append-only team_approval_requests row and flips visit_teams.status to APPROVED — creating exactly one site_visit is approval.repo.decide\'s job, exercised here as a single atomic call', async () => {
	approvalRepo.decide.mockResolvedValue({ teamId: 'team-1', decision: 'APPROVED', remarks: null });

	const result = await approvalService.decide(actor, 'team-1', { decision: 'APPROVED' });

	expect(approvalRepo.decide).toHaveBeenCalledWith('team-1', actor.id, actor.divisionId, 'APPROVED', undefined);
	expect(result).toEqual({ teamId: 'team-1', decision: 'APPROVED', remarks: null });
});

test('reject writes an append-only team_approval_requests row and flips visit_teams.status to REJECTED, with remarks passed through', async () => {
	approvalRepo.decide.mockResolvedValue({ teamId: 'team-1', decision: 'REJECTED', remarks: 'missing lead MEO' });

	const result = await approvalService.decide(actor, 'team-1', { decision: 'REJECTED', remarks: 'missing lead MEO' });

	expect(approvalRepo.decide).toHaveBeenCalledWith('team-1', actor.id, actor.divisionId, 'REJECTED', 'missing lead MEO');
	expect(result.decision).toBe('REJECTED');
});

test('decide throws 404 when approval.repo finds no pending request for that team in the actor\'s division (RLS-equivalent scoping already applied inside the repo query)', async () => {
	approvalRepo.decide.mockResolvedValue(null);

	await expect(approvalService.decide(actor, 'team-404', { decision: 'APPROVED' })).rejects.toMatchObject({
		statusCode: 404,
	});
	await expect(approvalService.decide(actor, 'team-404', { decision: 'APPROVED' })).rejects.toBeInstanceOf(ApiError);
});
