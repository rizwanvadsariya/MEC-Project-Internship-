/**
 * issue_reports CRUD + status.
 * The ONLY layer that talks to Postgres/Supabase. Parameterized queries, proper
 * joins (no N+1), cursor pagination on lists (architecture.md §5.1/§5.3).
 */
'use strict';
const db = require('../config/database');

const DIVISION_ROLES = new Set(['REGIONAL_DIRECTOR', 'DIRECTOR_GENERAL']);

const ISSUE_COLUMNS = `id, site_visit_id as "siteVisitId", reported_by as "reportedBy", issue_type as "issueType",
	severity, description, status, owner_id as "ownerId", due_date::text as "dueDate",
	acknowledged_at as "acknowledgedAt", in_progress_at as "inProgressAt", resolved_at as "resolvedAt",
	escalated_at as "escalatedAt", created_at as "createdAt", updated_at as "updatedAt"`;

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

/**
 * Step 24: is `actor` the Regional Director of the division this site visit's
 * scheme belongs to? Mirrors the is_rd_for_site_visit RLS helper (migration
 * 0013) — issue lifecycle writes (status/owner/due date) are RD-only, DG is
 * read-only, same "RD manages, DG oversees" split as Step 21's scheduling.
 */
async function isRdForSiteVisit(siteVisitId, actor) {
	if (actor.role !== 'REGIONAL_DIRECTOR' || !actor.divisionId) return false;
	const result = await db.query(
		`select exists (
			select 1 from site_visits sv
			join scheme_districts sd on sd.scheme_id = sv.scheme_id
			join districts d on d.id = sd.district_id
			where sv.id = $1 and d.division_id = $2
		) as "isRd"`,
		[siteVisitId, actor.divisionId],
	);
	return result.rows[0]?.isRd ?? false;
}

async function create(siteVisitId, reportedBy, payload) {
	const result = await db.query(
		`insert into issue_reports (site_visit_id, reported_by, issue_type, severity, description)
		 values ($1, $2, $3, $4, $5)
		 returning ${ISSUE_COLUMNS}`,
		[siteVisitId, reportedBy, payload.issueType, payload.severity, payload.description],
	);
	return result.rows[0];
}

async function list(siteVisitId) {
	const result = await db.query(
		`select ${ISSUE_COLUMNS} from issue_reports where site_visit_id = $1 order by created_at desc`,
		[siteVisitId],
	);
	return result.rows;
}

async function findById(siteVisitId, issueId) {
	const result = await db.query(
		`select ${ISSUE_COLUMNS} from issue_reports where id = $1 and site_visit_id = $2`,
		[issueId, siteVisitId],
	);
	return result.rows[0] || null;
}

async function remove(issueId) {
	await db.query('delete from issue_reports where id = $1', [issueId]);
}

/**
 * Step 24 lifecycle update. `fields` may contain any of status/ownerId/
 * dueDate (already validated/authorized by the service) and `timestamps` any
 * of acknowledgedAt/inProgressAt/resolvedAt — both built dynamically so a
 * partial update (e.g. only assigning an owner, leaving status untouched)
 * never overwrites the columns it wasn't given.
 */
async function updateLifecycle(issueId, fields, timestamps) {
	const columns = { status: 'status', ownerId: 'owner_id', dueDate: 'due_date' };
	const timestampColumns = { acknowledgedAt: 'acknowledged_at', inProgressAt: 'in_progress_at', resolvedAt: 'resolved_at' };
	const sets = [];
	const params = [];

	for (const [key, column] of Object.entries(columns)) {
		if (fields[key] === undefined) continue;
		params.push(fields[key]);
		sets.push(`${column} = $${params.length}`);
	}
	for (const [key, column] of Object.entries(timestampColumns)) {
		if (timestamps[key] === undefined) continue;
		params.push(timestamps[key]);
		sets.push(`${column} = $${params.length}`);
	}

	params.push(issueId);
	const result = await db.query(
		`update issue_reports set ${sets.join(', ')} where id = $${params.length} returning ${ISSUE_COLUMNS}`,
		params,
	);
	return result.rows[0];
}

/**
 * Step 25, escalation rule #2: unresolved issues in `divisionId` whose due
 * date has already passed and that haven't been escalated yet. Scoped the
 * same way every other division rollup in this app is (dashboard.repo's
 * SCHEME_IN_DIVISION pattern) — a scheme spanning multiple districts in one
 * division is still counted once.
 */
async function findOverdueUnescalated(divisionId) {
	const result = await db.query(
		`select ir.id, ir.site_visit_id as "siteVisitId", ir.reported_by as "reportedBy", ir.issue_type as "issueType",
				ir.severity, ir.description, ir.status, ir.owner_id as "ownerId", ir.due_date::text as "dueDate",
				ir.acknowledged_at as "acknowledgedAt", ir.in_progress_at as "inProgressAt", ir.resolved_at as "resolvedAt",
				ir.escalated_at as "escalatedAt", ir.created_at as "createdAt", ir.updated_at as "updatedAt"
		 from issue_reports ir
		 join site_visits sv on sv.id = ir.site_visit_id
		 where ir.status <> 'RESOLVED' and ir.escalated_at is null and ir.due_date < current_date
			 and exists (
				 select 1 from scheme_districts sd join districts d on d.id = sd.district_id
				 where sd.scheme_id = sv.scheme_id and d.division_id = $1
			 )
		 order by ir.due_date asc`,
		[divisionId],
	);
	return result.rows;
}

async function markEscalated(issueId) {
	await db.query('update issue_reports set escalated_at = now() where id = $1', [issueId]);
}

module.exports = { findVisitContext, isRdForSiteVisit, create, list, findById, remove, updateLifecycle, findOverdueUnescalated, markEscalated };
