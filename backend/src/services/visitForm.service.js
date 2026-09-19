/**
 * Resolve the department's active form_template, validate responses against form_template_fields, persist visit_forms.
 * Business logic only — no HTTP objects, no raw SQL. Calls repositories/ for
 * data and other services/ for cross-cutting actions. Unit-testable in isolation.
 */
'use strict';

const visitFormRepo = require('../repositories/visitForm.repo');
const ApiError = require('../lib/ApiError');

function validateResponses(template, responses, requireRequired) {
	const fields = new Map(template.fields.map((field) => [field.fieldKey, field]));
	const unknownKeys = Object.keys(responses).filter((key) => !fields.has(key));
	if (unknownKeys.length) throw ApiError.badRequest('Responses contain unknown fields', { fields: unknownKeys });

	const missing = template.fields
		.filter((field) => requireRequired && field.isRequired && (responses[field.fieldKey] === undefined || responses[field.fieldKey] === null || responses[field.fieldKey] === ''))
		.map((field) => field.fieldKey);
	if (missing.length) throw ApiError.badRequest('Required form fields are missing', { fields: missing });

	for (const [key, value] of Object.entries(responses)) {
		const field = fields.get(key);
		if (value === null || value === undefined || value === '') continue;
		const valid = field.fieldType === 'text' ? typeof value === 'string'
			: field.fieldType === 'number' ? typeof value === 'number' && Number.isFinite(value)
			: field.fieldType === 'boolean' ? typeof value === 'boolean'
			: field.fieldType === 'date' ? typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
			: field.fieldType === 'select' ? typeof value === 'string' && (!field.options || field.options.includes(value))
			: field.fieldType === 'multiselect' ? Array.isArray(value) && value.every((item) => typeof item === 'string' && (!field.options || field.options.includes(item)))
			: true;
		if (!valid) throw ApiError.badRequest(`Invalid value for form field: ${key}`, { field: key });
	}
}

async function get(actor, siteVisitId) {
	const context = await visitFormRepo.findContext(siteVisitId, actor);
	if (!context) throw ApiError.notFound('Site visit not found');
	const template = await visitFormRepo.findTemplate(context.departmentId);
	if (!template) throw ApiError.conflict('No active form template is configured for this department');
	const form = await visitFormRepo.findForm(siteVisitId);
	// A draft-in-progress is the lead MEO's own working copy — nobody else
	// (not even a division RD/DG or a fellow team member) sees any of the
	// report's contents until the lead MEO actually submits it.
	const visibleForm = context.isLeadMeo || form?.status === 'SUBMITTED' ? form : null;
	return { siteVisitId, template, form: visibleForm, canEdit: context.isLeadMeo };
}

async function save(actor, siteVisitId, payload, status) {
	const context = await visitFormRepo.findContext(siteVisitId, actor);
	if (!context) throw ApiError.notFound('Site visit not found');
	if (!context.isLeadMeo) throw ApiError.forbidden('Only the lead MEO can edit this visit form');
	const template = await visitFormRepo.findTemplate(context.departmentId);
	if (!template) throw ApiError.conflict('No active form template is configured for this department');
	const existing = await visitFormRepo.findForm(siteVisitId);
	if (existing?.status === 'SUBMITTED') throw ApiError.conflict('This visit form has already been submitted');
	validateResponses(template, payload.responses, status === 'SUBMITTED');
	return visitFormRepo.save(siteVisitId, actor.id, template.id, payload, status);
}

module.exports = { get, save, validateResponses };
