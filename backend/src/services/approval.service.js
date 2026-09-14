/**
 * DG approve/reject: write a new append-only team_approval_requests row, flip visit_teams.status, trigger site-visit creation on APPROVE.
 * Business logic only — no HTTP objects, no raw SQL. Calls repositories/ for
 * data and other services/ for cross-cutting actions. Unit-testable in isolation.
 */
'use strict';

const approvalRepo = require('../repositories/approval.repo');
const ApiError = require('../lib/ApiError');

async function listPending(actor) {
	return approvalRepo.listPending(actor.divisionId);
}

async function decide(actor, teamId, input) {
	const result = await approvalRepo.decide(teamId, actor.id, actor.divisionId, input.decision, input.remarks);
	if (!result) throw ApiError.notFound('Pending approval not found');
	return result;
}

module.exports = { listPending, decide };
