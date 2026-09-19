/**
 * File/list/remove issue reports for a site visit (type, severity, description).
 * Business logic only — no HTTP objects, no raw SQL. Calls repositories/ for
 * data and other services/ for cross-cutting actions. Unit-testable in isolation.
 */
'use strict';
const issueRepo = require('../repositories/issue.repo');
const ApiError = require('../lib/ApiError');

async function file(actor, siteVisitId, payload) {
	const context = await issueRepo.findVisitContext(siteVisitId, actor);
	if (!context) throw ApiError.notFound('Site visit not found');
	if (!context.isLeadMeo) throw ApiError.forbidden('Only the lead MEO can file issue reports');
	if (context.formSubmitted) throw ApiError.conflict('The submitted visit report is locked and cannot be edited', undefined, 'VISIT_REPORT_LOCKED');
	return issueRepo.create(siteVisitId, actor.id, payload);
}

async function list(actor, siteVisitId) {
	const context = await issueRepo.findVisitContext(siteVisitId, actor);
	if (!context) throw ApiError.notFound('Site visit not found');
	// Same rule as the form itself: an issue filed before the report is
	// submitted is the lead MEO's own working copy, invisible to everyone
	// else until submitted.
	if (!context.isLeadMeo && !context.formSubmitted) return [];
	return issueRepo.list(siteVisitId);
}

async function remove(actor, siteVisitId, issueId) {
	const context = await issueRepo.findVisitContext(siteVisitId, actor);
	if (!context) throw ApiError.notFound('Site visit not found');
	if (!context.isLeadMeo) throw ApiError.forbidden('Only the lead MEO can remove issue reports');
	if (context.formSubmitted) throw ApiError.conflict('The submitted visit report is locked and cannot be edited', undefined, 'VISIT_REPORT_LOCKED');
	const issue = await issueRepo.findById(siteVisitId, issueId);
	if (!issue) throw ApiError.notFound('Issue report not found');
	await issueRepo.remove(issue.id);
}

module.exports = { file, list, remove };
