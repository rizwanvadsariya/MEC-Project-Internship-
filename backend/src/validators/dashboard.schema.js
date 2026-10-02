/**
 * Step 27 reconciliation list query validation.
 */
'use strict';

const { z } = require('zod');

// z.coerce.boolean() would turn the STRING "false" into `true` — same
// footgun documented in config/index.js's boolFromEnv; read "true"/"false" as words instead.
const boolFromQuery = z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() === 'true' : v), z.boolean()).optional();

const reconciliationQuery = {
	query: z.object({
		flaggedOnly: boolFromQuery,
		cursor: z.string().max(80).optional(),
		limit: z.coerce.number().int().min(1).max(50).default(20),
	}),
};

/** Step 31 — delay/anomaly detection. Not cursor-paginated (these are
 *  short "flagged problem" lists, not a full browse view) — just a
 *  caller-overridable cap, default 50, capped at 200 so a division with a
 *  very sparse/early-stage visit history can't request an unbounded
 *  response. */
const anomaliesQuery = {
	query: z.object({
		limit: z.coerce.number().int().min(1).max(200).default(50),
	}),
};

module.exports = { reconciliationQuery, anomaliesQuery };
