/**
 * List/detail query validation. Status matches the site_visits.status values
 * documented in migration 0002 (plain text column, not an enum, so this is
 * the only place the allowed set is enforced).
 */
'use strict';

const { z } = require('zod');

const positiveInt = z.coerce.number().int().positive();

const query = {
	query: z.object({
		schemeId: positiveInt.optional(),
		status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
		cursor: z.string().max(80).optional(),
		limit: z.coerce.number().int().min(1).max(50).default(20),
	}),
};

const idParam = { params: z.object({ id: z.string().uuid() }) };

module.exports = { query, idParam };
