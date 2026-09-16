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

module.exports = { list, getById };
