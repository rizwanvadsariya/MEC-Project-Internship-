/**
 * List/detail query validation. Status matches the site_visits.status values
 * documented in migration 0002 (plain text column, not an enum, so this is
 * the only place the allowed set is enforced).
 */
'use strict';

const { z } = require('zod');

const positiveInt = z.coerce.number().int().positive();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
// z.coerce.boolean() would turn the STRING "false" into `true` — same
// footgun documented in config/index.js's boolFromEnv; read "true"/"false" as words instead.
const boolFromQuery = z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() === 'true' : v), z.boolean()).optional();

const query = {
	query: z.object({
		schemeId: positiveInt.optional(),
		status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
		// Calendar filters (phases.md Step 21) — scheduledFrom/scheduledTo bound
		// site_visits.scheduled_date (inclusive); unscheduled=true instead finds
		// approved visits that still need a date picked, ignoring the range.
		scheduledFrom: isoDate.optional(),
		scheduledTo: isoDate.optional(),
		unscheduled: boolFromQuery,
		cursor: z.string().max(80).optional(),
		limit: z.coerce.number().int().min(1).max(50).default(20),
	}),
};

const idParam = { params: z.object({ id: z.string().uuid() }) };

const schedule = {
	params: z.object({ id: z.string().uuid() }),
	body: z.object({ scheduledDate: isoDate.nullable() }),
};

module.exports = { query, idParam, schedule };
