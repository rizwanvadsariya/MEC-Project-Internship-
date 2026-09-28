/**
 * File/list/remove issue reports for a site visit (type, severity, description),
 * plus Step 24's lifecycle tracking (status, owner, due date).
 * Business logic only — no HTTP objects, no raw SQL. Calls repositories/ for
 * data and other services/ for cross-cutting actions. Unit-testable in isolation.
 */
'use strict';
const issueRepo = require('../repositories/issue.repo');
const userRepo = require('../repositories/user.repo');
const notificationService = require('./notification.service');
const ApiError = require('../lib/ApiError');
const { ROLES } = require('../constants/roles');

// PRD.md's own wording is a straight line (open -> acknowledged -> in
// progress -> resolved); a status may only ever move forward along it, never
// sideways or back, but a later stage may be set directly (e.g. straight to
// RESOLVED) without forcing every intermediate stage through a separate call.
const STATUS_ORDER = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED'];
const OWNER_ELIGIBLE_ROLES = [ROLES.MEO, ROLES.SUPPORT_USER];

async function file(actor, siteVisitId, payload) {
	const context = await issueRepo.findVisitContext(siteVisitId, actor);
	if (!context) throw ApiError.notFound('Site visit not found');
	if (!context.isLeadMeo) throw ApiError.forbidden('Only the lead MEO can file issue reports');
	if (context.formSubmitted) throw ApiError.conflict('The submitted visit report is locked and cannot be edited', undefined, 'VISIT_REPORT_LOCKED');
	// No general "issue filed" notification here — an issue filed before the
	// report is submitted is still the lead MEO's own invisible working copy
	// (Step 15's rule). notification.service fires it once the report is
	// actually SUBMITTED, from visitForm.service, alongside "visit completed".
	const issue = await issueRepo.create(siteVisitId, actor.id, payload);
	// Step 25 escalation rule #1: CRITICAL is the one exception — it notifies
	// division leadership immediately, deliberately bypassing the rule above.
	if (issue.severity === 'CRITICAL') notificationService.notifyCriticalIssueFiled(issue);
	return issue;
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

function assertForwardTransition(currentStatus, nextStatus) {
	if (nextStatus === undefined) return;
	const currentIndex = STATUS_ORDER.indexOf(currentStatus);
	const nextIndex = STATUS_ORDER.indexOf(nextStatus);
	if (nextIndex <= currentIndex) {
		throw ApiError.conflict(`Cannot move an issue from ${currentStatus} to ${nextStatus}`, undefined, 'ISSUE_INVALID_TRANSITION');
	}
}

/**
 * An owner must be an active MEO or support user in the RD's own division —
 * the same eligible pool team.service.assertMember draws from for team
 * assembly (the people who actually do fieldwork), not an arbitrary user id.
 * `null` (unassign) always passes without a lookup.
 */
async function assertOwnerEligible(ownerId, divisionId) {
	if (ownerId === null) return;
	const profile = await userRepo.findById(ownerId);
	const inDivision = !!profile && (profile.division_id === divisionId || (profile.role === ROLES.SUPPORT_USER && profile.division_id === null));
	if (!profile || !profile.is_active || !inDivision || !OWNER_ELIGIBLE_ROLES.includes(profile.role)) {
		throw ApiError.badRequest('Issue owner must be an active MEO or support user in your division', undefined, 'INVALID_ISSUE_OWNER');
	}
}

/**
 * Step 24: advance status, and/or (re)assign an owner, and/or set/clear a due
 * date. RD-only (see migration 0013's own note on why DG is excluded) — the
 * RD's own division match is already implied by issueRepo.isRdForSiteVisit,
 * so no separate division check is needed here, same reasoning as
 * siteVisit.service.schedule for Step 21.
 */
async function updateLifecycle(actor, siteVisitId, issueId, payload) {
	const context = await issueRepo.findVisitContext(siteVisitId, actor);
	if (!context) throw ApiError.notFound('Site visit not found');
	if (!(await issueRepo.isRdForSiteVisit(siteVisitId, actor))) {
		throw ApiError.forbidden("Only the division's Regional Director can update an issue's lifecycle");
	}
	const issue = await issueRepo.findById(siteVisitId, issueId);
	if (!issue) throw ApiError.notFound('Issue report not found');
	if (issue.status === 'RESOLVED') throw ApiError.conflict('A resolved issue can no longer be changed', undefined, 'ISSUE_RESOLVED_LOCKED');

	assertForwardTransition(issue.status, payload.status);
	if (payload.ownerId !== undefined) await assertOwnerEligible(payload.ownerId, actor.divisionId);

	const timestamps = {};
	if (payload.status === 'ACKNOWLEDGED') timestamps.acknowledgedAt = new Date();
	else if (payload.status === 'IN_PROGRESS') timestamps.inProgressAt = new Date();
	else if (payload.status === 'RESOLVED') timestamps.resolvedAt = new Date();

	const updated = await issueRepo.updateLifecycle(issueId, payload, timestamps);
	if (payload.ownerId && payload.ownerId !== issue.ownerId) {
		notificationService.notifyIssueOwnerAssigned(updated);
	}
	return updated;
}

module.exports = { file, list, remove, updateLifecycle };
