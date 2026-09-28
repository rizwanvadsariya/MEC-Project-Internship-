/**
 * Site visit read access, scoped per actor (RD/DG by division, MEO/Support by
 * team membership — see siteVisit.repo's visibilityClause). Creation itself
 * lives in siteVisit.repo.createForApprovedTeam, called from approval.repo
 * inside the approval-decision transaction, not from here.
 * Business logic only — no HTTP objects, no raw SQL. Calls repositories/ for
 * data and other services/ for cross-cutting actions. Unit-testable in isolation.
 */
'use strict';

const siteVisitRepo = require('../repositories/siteVisit.repo');
const ApiError = require('../lib/ApiError');

function decodeCursor(cursor) {
	if (!cursor) return undefined;
	const separatorIndex = cursor.lastIndexOf('_');
	if (separatorIndex === -1) throw ApiError.badRequest('Invalid cursor');
	return { createdAt: cursor.slice(0, separatorIndex), id: cursor.slice(separatorIndex + 1) };
}

async function list(actor, query) {
	const { cursor, ...rest } = query;
	return siteVisitRepo.listForActor(actor, { ...rest, cursor: decodeCursor(cursor) });
}

async function getById(actor, id) {
	const visit = await siteVisitRepo.findByIdForActor(actor, id);
	if (!visit) throw ApiError.notFound('Site visit not found');
	return visit;
}

const NOT_SCHEDULABLE_STATUSES = new Set(['COMPLETED', 'CANCELLED']);

/**
 * Plan (or clear) a visit's date (phases.md Step 21 — "RD / lead MEO plan
 * upcoming visits"). visibilityClause already restricts which visits an RD
 * can even see to their own division, so once the visit is visible at all, a
 * REGIONAL_DIRECTOR actor is guaranteed to be in-division for it — no second
 * division check needed here. DG is deliberately excluded even though DG can
 * also see the visit, per the step's own "RD / lead MEO" wording; so is any
 * non-lead team member.
 */
async function schedule(actor, id, scheduledDate) {
	const visit = await siteVisitRepo.findByIdForActor(actor, id);
	if (!visit) throw ApiError.notFound('Site visit not found');

	const isLeadMeo = visit.members.some((member) => member.userId === actor.id && member.teamRole === 'LEAD_MEO');
	if (actor.role !== 'REGIONAL_DIRECTOR' && !isLeadMeo) {
		throw ApiError.forbidden('Only the regional director or the lead MEO can schedule this visit');
	}
	if (NOT_SCHEDULABLE_STATUSES.has(visit.status)) {
		throw ApiError.conflict(`Cannot schedule a visit that is already ${visit.status.toLowerCase()}`, undefined, 'VISIT_NOT_SCHEDULABLE');
	}

	return siteVisitRepo.updateScheduledDate(id, scheduledDate);
}

module.exports = { list, getById, schedule };
