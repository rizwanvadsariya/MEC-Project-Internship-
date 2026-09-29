/**
 * approve / reject (decision + remarks) bodies.
 */
'use strict';

const { z } = require('zod');

const teamId = { params: z.object({ teamId: z.string().uuid() }) };
const decision = {
	body: z.object({
		decision: z.enum(['APPROVED', 'REJECTED']),
		remarks: z.string().trim().max(2000).optional(),
	}).superRefine((value, context) => {
		if (value.decision === 'REJECTED' && !value.remarks) {
			context.addIssue({ code: z.ZodIssueCode.custom, path: ['remarks'], message: 'Remarks are required when rejecting a team' });
		}
	}),
};

// Step 26 — full audit trail query. teamId narrows to one team's full
// submit/reject/resubmit/approve chain; decision filters by outcome. Same
// cursor/limit shape as every other list endpoint in this app.
const history = {
	query: z.object({
		teamId: z.string().uuid().optional(),
		decision: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
		cursor: z.string().max(80).optional(),
		limit: z.coerce.number().int().min(1).max(50).default(20),
	}),
};

module.exports = { teamId, decision, history };
