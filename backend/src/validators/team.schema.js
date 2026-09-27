/**
 * create-team, update-members, submit-for-approval bodies.
 */
'use strict';

const { z } = require('zod');

const uuid = z.string().uuid();
const create = {
	body: z.object({
		schemeId: z.coerce.number().int().positive(),
		leadMeoId: uuid,
		supportingMemberIds: z.array(uuid).max(20).default([]),
		// RD self-inclusion (schema.md's own team_member_role enum has
		// RD_OBSERVER for exactly this) — optional, defaults to not included.
		includeSelf: z.boolean().default(false),
	}),
};

const idParam = { params: z.object({ id: uuid }) };

module.exports = { create, idParam };
