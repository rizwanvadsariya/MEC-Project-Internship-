/**
 * create-comment body. Comments are only supported on SCHEME and SITE_VISIT
 * (phases.md Step 20 — TEAM/ISSUE_REPORT stay in the commentable_type enum
 * for future use but have no route surface yet). commentable_id is a
 * polymorphic text column (schemes use bigint ids, site visits use uuids),
 * so the format is checked per-type rather than with one shared pattern.
 */
'use strict';

const { z } = require('zod');

const COMMENTABLE_TYPES = ['SCHEME', 'SITE_VISIT'];
const SCHEME_ID_RE = /^\d+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refineCommentableId(val, ctx) {
	const valid = val.commentableType === 'SCHEME' ? SCHEME_ID_RE.test(val.commentableId) : UUID_RE.test(val.commentableId);
	if (!valid) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['commentableId'], message: `Invalid commentableId for ${val.commentableType}` });
	}
}

const list = {
	query: z.object({
		commentableType: z.enum(COMMENTABLE_TYPES),
		commentableId: z.string().trim().min(1).max(64),
		cursor: z.string().max(80).optional(),
		limit: z.coerce.number().int().min(1).max(50).default(20),
	}).superRefine(refineCommentableId),
};

const create = {
	body: z.object({
		commentableType: z.enum(COMMENTABLE_TYPES),
		commentableId: z.string().trim().min(1).max(64),
		body: z.string().trim().min(1).max(2000),
	}).superRefine(refineCommentableId),
};

const update = {
	params: z.object({ id: z.string().uuid() }),
	body: z.object({ body: z.string().trim().min(1).max(2000) }),
};

const idParam = { params: z.object({ id: z.string().uuid() }) };

module.exports = { list, create, update, idParam };
