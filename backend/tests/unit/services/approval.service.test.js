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
	listHistory: jest.fn(),
	decide: jest.fn(),
}));
// notification.service transitively requires src/config/database (fatal with
// no backend/.env) — never actually loaded here, same rationale as the repo mock above.
jest.mock('../../../src/services/notification.service', () => ({
	notifyTeamDecision: jest.fn(),
}));

const approvalRepo = require('../../../src/repositories/approval.repo');
const notificationService = require('../../../src/services/notification.service');
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
	expect(notificationService.notifyTeamDecision).toHaveBeenCalledWith('team-1', 'APPROVED');
});

test('reject writes an append-only team_approval_requests row and flips visit_teams.status to REJECTED, with remarks passed through', async () => {
	approvalRepo.decide.mockResolvedValue({ teamId: 'team-1', decision: 'REJECTED', remarks: 'missing lead MEO' });

	const result = await approvalService.decide(actor, 'team-1', { decision: 'REJECTED', remarks: 'missing lead MEO' });

	expect(approvalRepo.decide).toHaveBeenCalledWith('team-1', actor.id, actor.divisionId, 'REJECTED', 'missing lead MEO');
	expect(result.decision).toBe('REJECTED');
	expect(notificationService.notifyTeamDecision).toHaveBeenCalledWith('team-1', 'REJECTED');
});

test('decide throws 404 when approval.repo finds no pending request for that team in the actor\'s division (RLS-equivalent scoping already applied inside the repo query), and never fires a notification for a decision that didn\'t happen', async () => {
	approvalRepo.decide.mockResolvedValue(null);

	await expect(approvalService.decide(actor, 'team-404', { decision: 'APPROVED' })).rejects.toMatchObject({
		statusCode: 404,
	});
	await expect(approvalService.decide(actor, 'team-404', { decision: 'APPROVED' })).rejects.toBeInstanceOf(ApiError);
	expect(notificationService.notifyTeamDecision).not.toHaveBeenCalled();
});

describe('history (Step 26 — full audit trail)', () => {
	test('delegates to approval.repo.listHistory scoped by the actor\'s division, with an undecoded cursor passed through as undefined', async () => {
		approvalRepo.listHistory.mockResolvedValue({ rows: [{ requestId: 'r1' }], nextCursor: null });

		const result = await approvalService.history(actor, { limit: 20 });

		expect(approvalRepo.listHistory).toHaveBeenCalledWith(actor.divisionId, { limit: 20, cursor: undefined });
		expect(result).toEqual({ rows: [{ requestId: 'r1' }], nextCursor: null });
	});

	test('passes teamId/decision filters through untouched', async () => {
		approvalRepo.listHistory.mockResolvedValue({ rows: [], nextCursor: null });

		await approvalService.history(actor, { teamId: 'team-1', decision: 'REJECTED', limit: 20 });

		expect(approvalRepo.listHistory).toHaveBeenCalledWith(actor.divisionId, {
			teamId: 'team-1',
			decision: 'REJECTED',
			limit: 20,
			cursor: undefined,
		});
	});

	test('decodes a cursor into {submittedAt, id} on the last "_"', async () => {
		approvalRepo.listHistory.mockResolvedValue({ rows: [], nextCursor: null });

		await approvalService.history(actor, { cursor: '2026-01-05T10:00:00.000Z_req-1', limit: 20 });

		expect(approvalRepo.listHistory).toHaveBeenCalledWith(actor.divisionId, {
			limit: 20,
			cursor: { submittedAt: '2026-01-05T10:00:00.000Z', id: 'req-1' },
		});
	});

	test('throws 400 on a malformed cursor with no separator', async () => {
		await expect(approvalService.history(actor, { cursor: 'not-a-cursor', limit: 20 })).rejects.toMatchObject({ statusCode: 400 });
		expect(approvalRepo.listHistory).not.toHaveBeenCalled();
	});

	test('throws 400 when the actor has no division assigned', async () => {
		await expect(approvalService.history({ id: 'x', divisionId: null }, { limit: 20 })).rejects.toMatchObject({ statusCode: 400 });
		expect(approvalRepo.listHistory).not.toHaveBeenCalled();
	});
});
