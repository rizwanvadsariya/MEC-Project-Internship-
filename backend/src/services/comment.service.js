/**
 * Post/list comments; enforce 'support users cannot comment' here as well as at RLS.
 * Business logic only — no HTTP objects, no raw SQL. Calls repositories/ for
 * data and other services/ for cross-cutting actions. Unit-testable in isolation.
 *
 * SUPPORT_USER is kept out entirely (not just posting) by the route's own
 * authorize(RD, DG, MEO) allow-list (phases.md Step 20's own wording) — this
 * layer never has to special-case that role.
 */
'use strict';

const commentRepo = require('../repositories/comment.repo');
const schemeRepo = require('../repositories/scheme.repo');
const siteVisitRepo = require('../repositories/siteVisit.repo');
const ApiError = require('../lib/ApiError');

function decodeCursor(cursor) {
	if (!cursor) return undefined;
	const separatorIndex = cursor.lastIndexOf('_');
	if (separatorIndex === -1) throw ApiError.badRequest('Invalid cursor');
	return { createdAt: cursor.slice(0, separatorIndex), id: cursor.slice(separatorIndex + 1) };
}

/**
 * A comment thread never grants broader access than the thing it's attached
 * to: schemes are province-wide read for any authenticated role (Step 7),
 * site visits reuse siteVisit.repo's own division/team-membership visibility
 * clause (Step 10) — so an RD/DG/MEO who can't see a given site visit can't
 * see or post in its comment thread either.
 */
async function assertCanView(actor, commentableType, commentableId) {
	if (commentableType === 'SCHEME') {
		const scheme = await schemeRepo.findById(commentableId);
		if (!scheme) throw ApiError.notFound('Scheme not found');
		return;
	}
	const visit = await siteVisitRepo.findByIdForActor(actor, commentableId);
	if (!visit) throw ApiError.notFound('Site visit not found');
}

async function list(actor, query) {
	const { commentableType, commentableId, cursor, limit } = query;
	await assertCanView(actor, commentableType, commentableId);
	return commentRepo.listForCommentable(commentableType, commentableId, { cursor: decodeCursor(cursor), limit });
}

async function create(actor, input) {
	const { commentableType, commentableId, body } = input;
	await assertCanView(actor, commentableType, commentableId);
	const comment = await commentRepo.create(commentableType, commentableId, actor.id, body);
	return { ...comment, authorName: actor.fullName, authorRole: actor.role };
}

async function update(actor, id, body) {
	const existing = await commentRepo.findById(id);
	if (!existing) throw ApiError.notFound('Comment not found');
	if (existing.authorId !== actor.id) throw ApiError.forbidden('You can only edit your own comment');
	const comment = await commentRepo.update(id, body);
	return { ...comment, authorName: actor.fullName, authorRole: actor.role };
}

async function remove(actor, id) {
	const existing = await commentRepo.findById(id);
	if (!existing) throw ApiError.notFound('Comment not found');
	if (existing.authorId !== actor.id) throw ApiError.forbidden('You can only delete your own comment');
	await commentRepo.remove(id);
}

module.exports = { list, create, update, remove };
