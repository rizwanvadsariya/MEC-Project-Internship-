/**
 * DG approve/reject: write a new append-only team_approval_requests row, flip visit_teams.status, trigger site-visit creation on APPROVE.
 * Business logic only — no HTTP objects, no raw SQL. Calls repositories/ for
 * data and other services/ for cross-cutting actions. Unit-testable in isolation.
 */
'use strict';

const approvalRepo = require('../repositories/approval.repo');
const notificationService = require('./notification.service');
const ApiError = require('../lib/ApiError');

async function listPending(actor) {
	return approvalRepo.listPending(actor.divisionId);
}

function decodeCursor(cursor) {
	if (!cursor) return undefined;
	const separatorIndex = cursor.lastIndexOf('_');
	if (separatorIndex === -1) throw ApiError.badRequest('Invalid cursor');
	return { submittedAt: cursor.slice(0, separatorIndex), id: cursor.slice(separatorIndex + 1) };
}

/**
 * Step 26 — full audit trail. Division-scoped for both RD and DG (same rule
 * as every other list endpoint in this app — not restricted to "requests I
 * personally submitted/reviewed"), unlike listPending/decide above which stay
 * DG-only (see approvals.routes.js's per-route authorize).
 */
async function history(actor, query) {
	if (actor.divisionId == null) throw ApiError.badRequest('This account has no division assigned');
	const { cursor, ...rest } = query;
	return approvalRepo.listHistory(actor.divisionId, { ...rest, cursor: decodeCursor(cursor) });
}

async function decide(actor, teamId, input) {
	const result = await approvalRepo.decide(teamId, actor.id, actor.divisionId, input.decision, input.remarks);
	if (!result) throw ApiError.notFound('Pending approval not found');
	// Fire-and-forget (phases.md Step 17) — never delays this response.
	notificationService.notifyTeamDecision(teamId, input.decision);
	return result;
}

module.exports = { listPending, history, decide };
