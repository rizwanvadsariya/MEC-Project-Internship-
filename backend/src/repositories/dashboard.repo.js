/**
 * Division-scoped rollups (RD/DG) and team-membership-scoped rollups
 * (MEO/Support) over visit_teams / site_visits / visit_forms / issue_reports
 * for the dashboards. The ONLY layer that talks to Postgres/Supabase.
 * Parameterized queries, proper joins (no N+1).
 */
'use strict';

const db = require('../config/database');

/** Actor is a member (any team_role) of the visit's team — same membership
 *  test siteVisit.repo/visitForm.repo/issue.repo already use for MEO/Support
 *  read access. */
const ACTOR_IS_MEMBER = `exists (
	select 1 from visit_team_members vtm
	where vtm.team_id = %TEAM_ID% and vtm.user_id = $1
)`;

/** Actor is specifically the LEAD_MEO of the visit's team — the only role
 *  that can fill the form / file issues, so "my reported issues" and
 *  "forms due" are both scoped through this. */
const ACTOR_IS_LEAD = `exists (
	select 1 from visit_team_members vtm
	where vtm.team_id = %TEAM_ID% and vtm.user_id = $1 and vtm.team_role = 'LEAD_MEO'
)`;

/**
 * A scheme is "in the caller's division" if any of its linked districts
 * belongs to that division — the same EXISTS pattern approval.repo and
 * siteVisit.repo use, so a scheme spanning multiple districts in one
 * division is still counted once per team/visit/issue row.
 */
const SCHEME_IN_DIVISION = `exists (
	select 1 from scheme_districts sd
	join districts d on d.id = sd.district_id
	where sd.scheme_id = %SCHEME_ID% and d.division_id = $1
)`;

async function findDivision(divisionId) {
	const { rows } = await db.query(`select id, name from divisions where id = $1`, [divisionId]);
	return rows[0] || null;
}

async function countTeamsByStatus(divisionId) {
	const { rows } = await db.query(
		`select status, count(*)::int as count
		 from visit_teams vt
		 where ${SCHEME_IN_DIVISION.replace('%SCHEME_ID%', 'vt.scheme_id')}
		 group by status`,
		[divisionId],
	);
	return rows;
}

async function countVisitsByStatus(divisionId) {
	const { rows } = await db.query(
		`select status, count(*)::int as count
		 from site_visits sv
		 where ${SCHEME_IN_DIVISION.replace('%SCHEME_ID%', 'sv.scheme_id')}
		 group by status`,
		[divisionId],
	);
	return rows;
}

async function countIssuesByStatusAndSeverity(divisionId) {
	const { rows } = await db.query(
		`select ir.status, ir.severity, count(*)::int as count
		 from issue_reports ir
		 join site_visits sv on sv.id = ir.site_visit_id
		 where ${SCHEME_IN_DIVISION.replace('%SCHEME_ID%', 'sv.scheme_id')}
		 group by ir.status, ir.severity`,
		[divisionId],
	);
	return rows;
}

async function listRecentVisits(divisionId, limit) {
	const { rows } = await db.query(
		`select sv.id, sv.status, sv.scheduled_date as "scheduledDate", sv.created_at as "createdAt",
				s.uid as "schemeUid", s.name as "schemeName"
		 from site_visits sv
		 join schemes s on s.id = sv.scheme_id
		 where ${SCHEME_IN_DIVISION.replace('%SCHEME_ID%', 'sv.scheme_id')}
		 order by sv.created_at desc
		 limit $2`,
		[divisionId, limit],
	);
	return rows;
}

async function listRecentOpenIssues(divisionId, limit) {
	const { rows } = await db.query(
		`select ir.id, ir.site_visit_id as "siteVisitId", ir.issue_type as "issueType",
				ir.severity, ir.status, ir.created_at as "createdAt",
				s.uid as "schemeUid", s.name as "schemeName"
		 from issue_reports ir
		 join site_visits sv on sv.id = ir.site_visit_id
		 join schemes s on s.id = sv.scheme_id
		 where ir.status <> 'RESOLVED' and ${SCHEME_IN_DIVISION.replace('%SCHEME_ID%', 'sv.scheme_id')}
		 order by ir.created_at desc
		 limit $2`,
		[divisionId, limit],
	);
	return rows;
}

async function countVisitsByStatusForMember(userId) {
	const { rows } = await db.query(
		`select status, count(*)::int as count
		 from site_visits sv
		 where ${ACTOR_IS_MEMBER.replace('%TEAM_ID%', 'sv.team_id')}
		 group by status`,
		[userId],
	);
	return rows;
}

/**
 * "Forms due" for a lead MEO: visits they lead that either have no
 * visit_forms row yet (not started) or one still in DRAFT — i.e. their
 * actual remaining fieldwork. Always 0 for an actor who is never a
 * LEAD_MEO (e.g. every SUPPORT_USER), with no special-casing needed.
 */
async function countFormsDueForLead(userId) {
	const { rows } = await db.query(
		`select count(*)::int as count
		 from site_visits sv
		 left join visit_forms vf on vf.site_visit_id = sv.id
		 where ${ACTOR_IS_LEAD.replace('%TEAM_ID%', 'sv.team_id')}
			 and (vf.id is null or vf.status = 'DRAFT')`,
		[userId],
	);
	return rows[0].count;
}

async function countIssuesReportedByActor(userId) {
	const { rows } = await db.query(`select count(*)::int as count from issue_reports where reported_by = $1`, [userId]);
	return rows[0].count;
}

/**
 * Open issues the actor may actually see: on a visit they're a member of,
 * and — mirroring visitForm.service/issue.service's Step 15 rule — only
 * once the report is SUBMITTED, unless the actor is that visit's own lead
 * MEO (who always sees their own in-progress work). Pushes a second copy of
 * userId onto params (the membership check already consumed the first) and
 * returns the clause referencing that new placeholder.
 */
function visibleIssueClause(userId, params) {
	params.push(userId);
	const leadUserIdx = params.length;
	return `(
		exists (
			select 1 from visit_team_members vtm
			where vtm.team_id = sv.team_id and vtm.user_id = $${leadUserIdx} and vtm.team_role = 'LEAD_MEO'
		)
		or coalesce(vf.status = 'SUBMITTED', false)
	)`;
}

async function countVisibleOpenIssuesForMember(userId) {
	const params = [userId];
	const visible = visibleIssueClause(userId, params);
	const { rows } = await db.query(
		`select count(*)::int as count
		 from issue_reports ir
		 join site_visits sv on sv.id = ir.site_visit_id
		 left join visit_forms vf on vf.site_visit_id = sv.id
		 where ir.status <> 'RESOLVED'
			 and ${ACTOR_IS_MEMBER.replace('%TEAM_ID%', 'sv.team_id')}
			 and ${visible}`,
		params,
	);
	return rows[0].count;
}

async function countDistinctSchemesForMember(userId) {
	const { rows } = await db.query(
		`select count(distinct sv.scheme_id)::int as count
		 from site_visits sv
		 where ${ACTOR_IS_MEMBER.replace('%TEAM_ID%', 'sv.team_id')}`,
		[userId],
	);
	return rows[0].count;
}

async function listRecentVisitsForMember(userId, limit) {
	const { rows } = await db.query(
		`select sv.id, sv.status, sv.scheduled_date as "scheduledDate", sv.created_at as "createdAt",
				s.uid as "schemeUid", s.name as "schemeName"
		 from site_visits sv
		 join schemes s on s.id = sv.scheme_id
		 where ${ACTOR_IS_MEMBER.replace('%TEAM_ID%', 'sv.team_id')}
		 order by sv.created_at desc
		 limit $2`,
		[userId, limit],
	);
	return rows;
}

async function listRecentVisibleIssuesForMember(userId, limit) {
	const params = [userId];
	const visible = visibleIssueClause(userId, params);
	params.push(limit);
	const limitIdx = params.length;
	const { rows } = await db.query(
		`select ir.id, ir.site_visit_id as "siteVisitId", ir.issue_type as "issueType",
				ir.severity, ir.status, ir.created_at as "createdAt",
				s.uid as "schemeUid", s.name as "schemeName"
		 from issue_reports ir
		 join site_visits sv on sv.id = ir.site_visit_id
		 join schemes s on s.id = sv.scheme_id
		 left join visit_forms vf on vf.site_visit_id = sv.id
		 where ir.status <> 'RESOLVED'
			 and ${ACTOR_IS_MEMBER.replace('%TEAM_ID%', 'sv.team_id')}
			 and ${visible}
		 order by ir.created_at desc
		 limit $${limitIdx}`,
		params,
	);
	return rows;
}

module.exports = {
	findDivision,
	countTeamsByStatus,
	countVisitsByStatus,
	countIssuesByStatusAndSeverity,
	listRecentVisits,
	listRecentOpenIssues,
	countVisitsByStatusForMember,
	countFormsDueForLead,
	countIssuesReportedByActor,
	countVisibleOpenIssuesForMember,
	countDistinctSchemesForMember,
	listRecentVisitsForMember,
	listRecentVisibleIssuesForMember,
};
