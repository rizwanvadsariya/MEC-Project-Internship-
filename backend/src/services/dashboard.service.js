/**
 * Aggregate teams/visits/issues within the caller's division into dashboard + analytics payloads.
 * Business logic only — no HTTP objects, no raw SQL. Calls repositories/ for
 * data and other services/ for cross-cutting actions. Unit-testable in isolation.
 */
'use strict';

const dashboardRepo = require('../repositories/dashboard.repo');
const notificationService = require('./notification.service');
const ApiError = require('../lib/ApiError');

const RECENT_LIMIT = 5;

const TEAM_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'];
const VISIT_STATUSES = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const ISSUE_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED'];
const ISSUE_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

function zeroFilled(statuses) {
	return Object.fromEntries(statuses.map((status) => [status, 0]));
}

function byStatus(rows, statuses) {
	const counts = zeroFilled(statuses);
	let total = 0;
	for (const row of rows) {
		counts[row.status] = row.count;
		total += row.count;
	}
	return { total, byStatus: counts };
}

function issueBreakdown(rows) {
	const byStatusCounts = zeroFilled(ISSUE_STATUSES);
	const bySeverityCounts = zeroFilled(ISSUE_SEVERITIES);
	let total = 0;
	let open = 0;
	for (const row of rows) {
		byStatusCounts[row.status] += row.count;
		bySeverityCounts[row.severity] += row.count;
		total += row.count;
		if (row.status !== 'RESOLVED') open += row.count;
	}
	return { total, open, byStatus: byStatusCounts, bySeverity: bySeverityCounts };
}

/**
 * Aggregates the per-department progress rows into one division-wide figure,
 * weighted by each department's own schemesReported count (not a naive
 * average-of-averages) — a department with 40 reported schemes should count
 * for more than one with 2. Departments with zero reported schemes
 * contribute schemesTotal but no weight to the average. avgProgressPct is
 * null (not 0) when nothing in the whole division has been reported yet.
 */
function overallProgress(departmentRows) {
	let schemesTotal = 0;
	let schemesReported = 0;
	let weightedSum = 0;
	for (const row of departmentRows) {
		schemesTotal += row.schemesTotal;
		schemesReported += row.schemesReported;
		if (row.avgProgressPct != null) weightedSum += row.avgProgressPct * row.schemesReported;
	}
	return {
		avgProgressPct: schemesReported > 0 ? weightedSum / schemesReported : null,
		schemesReported,
		schemesTotal,
	};
}

async function getDivisionSummary(actor) {
	if (actor.divisionId == null) {
		throw ApiError.badRequest('This account has no division assigned');
	}

	const [division, teamRows, visitRows, issueRows, progressByDepartment, recentVisits, recentIssues] = await Promise.all([
		dashboardRepo.findDivision(actor.divisionId),
		dashboardRepo.countTeamsByStatus(actor.divisionId),
		dashboardRepo.countVisitsByStatus(actor.divisionId),
		dashboardRepo.countIssuesByStatusAndSeverity(actor.divisionId),
		dashboardRepo.countProgressByDepartment(actor.divisionId),
		dashboardRepo.listRecentVisits(actor.divisionId, RECENT_LIMIT),
		dashboardRepo.listRecentOpenIssues(actor.divisionId, RECENT_LIMIT),
	]);

	if (!division) throw ApiError.notFound('Division not found');

	// Step 25 escalation rule #2 — fire-and-forget, never delays this response.
	// Lazily checked here (both RD and DG hit this endpoint) since this
	// project has no cron/queue infra; see notification.service's own comment.
	notificationService.escalateOverdueIssues(actor.divisionId);

	return {
		division,
		teams: byStatus(teamRows, TEAM_STATUSES),
		visits: byStatus(visitRows, VISIT_STATUSES),
		issues: issueBreakdown(issueRows),
		progressByDepartment,
		overallProgress: overallProgress(progressByDepartment),
		recentVisits,
		recentIssues,
	};
}

/**
 * MEO/Support dashboard: scoped by team membership, not division (their
 * visibility everywhere else in the app — siteVisit/visitForm/issue repos —
 * is already team-membership-based, never division-based). "Forms due" and
 * "reported by me" are meaningful only for a LEAD_MEO and come back 0 for
 * anyone who never holds that role on any team, with no role branching
 * needed here — the repo queries already encode that.
 */
async function getMemberSummary(actor) {
	const [visitRows, formsDue, reportedByMe, openVisible, schemesMonitored, recentVisits, recentIssues] = await Promise.all([
		dashboardRepo.countVisitsByStatusForMember(actor.id),
		dashboardRepo.countFormsDueForLead(actor.id),
		dashboardRepo.countIssuesReportedByActor(actor.id),
		dashboardRepo.countVisibleOpenIssuesForMember(actor.id),
		dashboardRepo.countDistinctSchemesForMember(actor.id),
		dashboardRepo.listRecentVisitsForMember(actor.id, RECENT_LIMIT),
		dashboardRepo.listRecentVisibleIssuesForMember(actor.id, RECENT_LIMIT),
	]);

	return {
		visits: byStatus(visitRows, VISIT_STATUSES),
		formsDue,
		issues: { reportedByMe, open: openVisible },
		schemesMonitored,
		recentVisits,
		recentIssues,
	};
}

module.exports = { getDivisionSummary, getMemberSummary };
