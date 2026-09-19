/**
 * issue_reports CRUD + status.
 * The ONLY layer that talks to Postgres/Supabase. Parameterized queries, proper
 * joins (no N+1), cursor pagination on lists (architecture.md §5.1/§5.3).
 */
'use strict';
const db = require('../config/database');

const DIVISION_ROLES = new Set(['REGIONAL_DIRECTOR', 'DIRECTOR_GENERAL']);

/**
 * Mirrors the issue_reports_select RLS policy (migration 0006, via
 * can_view_site_visit): visible to RD/DG within the scheme's own division, or
 * to anyone who is a member of the visit's team. Also reports whether the
 * caller is the team's lead MEO and whether the visit form is already
 * SUBMITTED, so the service can enforce write access and the same
 * report-is-locked-as-one-unit rule Step 13 applies to photos.
 */
async function findVisitContext(siteVisitId, actor) {
	const result = await db.query(
		`select sv.id as "siteVisitId", exists (
			select 1 from visit_team_members vtm where vtm.team_id = sv.team_id
			and vtm.user_id = $2 and vtm.team_role = 'LEAD_MEO'
		) as "isLeadMeo", coalesce(vf.status = 'SUBMITTED', false) as "formSubmitted"
		from site_visits sv
		join schemes s on s.id = sv.scheme_id
		left join visit_forms vf on vf.site_visit_id = sv.id
		where sv.id = $1 and (
			exists (select 1 from visit_team_members member_vtm where member_vtm.team_id = sv.team_id and member_vtm.user_id = $2)
			or ($3 and exists (select 1 from scheme_districts sd join districts d on d.id = sd.district_id where sd.scheme_id = sv.scheme_id and d.division_id = $4))
		)`,
		[siteVisitId, actor.id, DIVISION_ROLES.has(actor.role), actor.divisionId ?? null],
	);
	return result.rows[0] || null;
}

async function create(siteVisitId, reportedBy, payload) {
	const result = await db.query(
		`insert into issue_reports (site_visit_id, reported_by, issue_type, severity, description)
		 values ($1, $2, $3, $4, $5)
		 returning id, site_visit_id as "siteVisitId", reported_by as "reportedBy", issue_type as "issueType",
			severity, description, status, resolved_at as "resolvedAt", created_at as "createdAt", updated_at as "updatedAt"`,
		[siteVisitId, reportedBy, payload.issueType, payload.severity, payload.description],
	);
	return result.rows[0];
}

async function list(siteVisitId) {
	const result = await db.query(
		`select id, site_visit_id as "siteVisitId", reported_by as "reportedBy", issue_type as "issueType",
				severity, description, status, resolved_at as "resolvedAt", created_at as "createdAt", updated_at as "updatedAt"
		 from issue_reports where site_visit_id = $1 order by created_at desc`,
		[siteVisitId],
	);
	return result.rows;
}

async function findById(siteVisitId, issueId) {
	const result = await db.query(
		`select id, site_visit_id as "siteVisitId" from issue_reports where id = $1 and site_visit_id = $2`,
		[issueId, siteVisitId],
	);
	return result.rows[0] || null;
}

async function remove(issueId) {
	await db.query('delete from issue_reports where id = $1', [issueId]);
}

module.exports = { findVisitContext, create, list, findById, remove };
