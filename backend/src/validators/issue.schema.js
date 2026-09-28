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

// Step 24 — lifecycle update: status may only move forward (checked in the
// service, not here — zod can't see the issue's current status), owner may be
// assigned/reassigned/cleared (`null`), due date may be set/cleared (`null`).
// At least one field must be present, or a PATCH with an empty body would
// silently "succeed" without changing anything.
const updateLifecycle = {
	body: z
		.object({
			status: z.enum(['ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED']).optional(),
			ownerId: uuid.nullable().optional(),
			dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dueDate must be YYYY-MM-DD').nullable().optional(),
		})
		.refine((body) => body.status !== undefined || body.ownerId !== undefined || body.dueDate !== undefined, {
			message: 'At least one of status, ownerId, or dueDate is required',
		}),
};

module.exports = {
	idParam: { params: z.object({ id: uuid }) },
	issueParam: { params: z.object({ id: uuid, issueId: uuid }) },
	file,
	updateLifecycle,
};
