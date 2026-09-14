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

module.exports = { teamId, decision };
