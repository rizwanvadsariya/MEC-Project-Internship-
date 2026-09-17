/**
 * save-draft / submit — base fields + dynamic responses shape.
 */
'use strict';

const { z } = require('zod');

const uuid = z.string().uuid();
const responses = z.record(z.string(), z.unknown()).default({});
const body = {
	body: z.object({
		physicalProgressPct: z.coerce.number().min(0).max(100),
		remarks: z.string().max(10_000).nullable().optional(),
		responses,
	}),
};

module.exports = {
	idParam: { params: z.object({ id: uuid }) },
	save: body,
};
