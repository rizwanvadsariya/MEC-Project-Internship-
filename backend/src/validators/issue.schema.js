/**
 * File an issue report: type (free text, schema.md §4.4), severity enum, description.
 */
'use strict';

const { z } = require('zod');

const uuid = z.string().uuid();

const file = {
	body: z.object({
		issueType: z.string().trim().min(1).max(200),
		severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
		description: z.string().trim().min(1).max(5000),
	}),
};

module.exports = {
	idParam: { params: z.object({ id: uuid }) },
	issueParam: { params: z.object({ id: uuid, issueId: uuid }) },
	file,
};
