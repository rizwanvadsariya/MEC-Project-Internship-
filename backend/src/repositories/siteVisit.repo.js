/**
 * site_visits reads + the auto-creation insert used on team approval.
 * The ONLY layer that talks to Postgres/Supabase. Parameterized queries, proper
 * joins (no N+1), cursor pagination on lists (architecture.md §5.1/§5.3).
 */
'use strict';

const db = require('../config/database');

const ROLES_WITH_DIVISION_SCOPE = new Set(['REGIONAL_DIRECTOR', 'DIRECTOR_GENERAL']);

// scheduled_date::text avoids a real bug hit while testing Step 21: the pg
// driver parses a `date` column into a JS Date at local midnight, and JSON
// serialization then converts to UTC — shifting the date back a day on any
// server whose local timezone is ahead of UTC (e.g. 2026-03-10 became
// "2026-03-09T19:00:00.000Z" at UTC+5). Casting to text sidesteps the whole
// Date round trip and just returns the plain "YYYY-MM-DD" string.
/**
 * `extraSelect` lets a caller append an actor-scoped column (listForActor's
 * "isLeadMeo", for the calendar's per-row "can I plan this" check) without
 * every other caller paying for a join they don't need.
 */
function listSelect(extraSelect = '') {
	return `
		select sv.id, sv.team_id as "teamId", sv.scheme_id as "schemeId", sv.status,
			sv.scheduled_date::text as "scheduledDate", sv.started_at as "startedAt", sv.completed_at as "completedAt",
			sv.created_at as "createdAt",
			s.uid as "schemeUid", s.name as "schemeName"${extraSelect}
		from site_visits sv
		join schemes s on s.id = sv.scheme_id
	`;
}
const LIST_SELECT = listSelect();

/**
 * Mirrors the site_visits_select RLS policy (migration 0007) exactly, since
 * the app connects as `postgres` and bypasses RLS: visible to RD/DG within
 * the scheme's own division, OR to anyone who is a member of the visit's team
 * (covers MEO/Support, and an RD/DG who added themself to the team).
 */
function visibilityClause(actor, params) {
	params.push(ROLES_WITH_DIVISION_SCOPE.has(actor.role));
	const isDivisionScopedIdx = params.length;
	params.push(actor.divisionIds?.length ? actor.divisionIds : (actor.divisionId == null ? [] : [actor.divisionId]));
	const divisionIdx = params.length;
	params.push(actor.id);
	const userIdx = params.length;

	return `(
		($${isDivisionScopedIdx} and exists (
			select 1 from scheme_districts scope_sd
			join districts scope_d on scope_d.id = scope_sd.district_id
			where scope_sd.scheme_id = sv.scheme_id and scope_d.division_id = any($${divisionIdx}::int[])
		))
		or exists (select 1 from visit_team_members vtm where vtm.team_id = sv.team_id and vtm.user_id = $${userIdx})
	)`;
}

async function listForActor(actor, filters) {
	const params = [];
	const clauses = [visibilityClause(actor, params)];
	params.push(actor.id);
	const leadMeoIdx = params.length;

	if (filters.schemeId) {
		params.push(filters.schemeId);
		clauses.push(`sv.scheme_id = $${params.length}`);
	}
	if (filters.status) {
		params.push(filters.status);
		clauses.push(`sv.status = $${params.length}`);
	}
	if (filters.unscheduled) {
		clauses.push(`sv.scheduled_date is null`);
	} else {
		if (filters.scheduledFrom) {
			params.push(filters.scheduledFrom);
			clauses.push(`sv.scheduled_date >= $${params.length}`);
		}
		if (filters.scheduledTo) {
			params.push(filters.scheduledTo);
			clauses.push(`sv.scheduled_date <= $${params.length}`);
		}
	}
	if (filters.cursor) {
		params.push(filters.cursor.createdAt);
		const createdAtIdx = params.length;
		params.push(filters.cursor.id);
		const idIdx = params.length;
		clauses.push(`(sv.created_at, sv.id) < ($${createdAtIdx}, $${idIdx})`);
	}

	const limit = Number.isInteger(filters.limit) ? filters.limit : 20;
	params.push(limit + 1);

	const result = await db.query(
		`${listSelect(`, exists (
			select 1 from visit_team_members ltm
			where ltm.team_id = sv.team_id and ltm.user_id = $${leadMeoIdx} and ltm.team_role = 'LEAD_MEO'
		) as "isLeadMeo"`)} where ${clauses.join(' and ')} order by sv.created_at desc, sv.id desc limit $${params.length}`,
		params,
	);
	const hasMore = result.rows.length > limit;
	const rows = result.rows.slice(0, limit);
	const last = rows[rows.length - 1];
	return {
		rows,
		nextCursor: hasMore && last ? `${last.createdAt.toISOString()}_${last.id}` : null,
	};
}

async function findByIdForActor(actor, id) {
	const params = [];
	const visibility = visibilityClause(actor, params);
	params.push(id);
	const idIdx = params.length;

	const visitResult = await db.query(`${LIST_SELECT} where sv.id = $${idIdx} and ${visibility}`, params);
	const visit = visitResult.rows[0];
	if (!visit) return null;

	const members = await db.query(
		`select vtm.id, vtm.user_id as "userId", vtm.team_role as "teamRole",
						u.full_name as "fullName", u.email
		 from visit_team_members vtm join users u on u.id = vtm.user_id
		 where vtm.team_id = $1 order by vtm.team_role, u.full_name`,
		[visit.teamId],
	);

	return { ...visit, members: members.rows };
}

/**
 * Sets/clears a visit's planned date (phases.md Step 21). Authorization
 * (RD-in-division or the visit's own lead MEO, not already COMPLETED/
 * CANCELLED) lives in siteVisit.service.schedule — this is a plain write.
 */
async function updateScheduledDate(id, scheduledDate) {
	const result = await db.query(
		`update site_visits set scheduled_date = $2 where id = $1
		 returning id, team_id as "teamId", scheme_id as "schemeId", status,
			scheduled_date::text as "scheduledDate", started_at as "startedAt", completed_at as "completedAt",
			created_at as "createdAt"`,
		[id, scheduledDate],
	);
	return result.rows[0];
}

/**
 * Creates the one site_visit a newly-APPROVED team gets. Idempotent — a
 * second call for the same team is a no-op — so callers don't need their own
 * "have we already done this" guard. Takes an already-open transaction client
 * so approval.repo's decide() can run it inside the same atomic transaction
 * as the status flip.
 */
async function createForApprovedTeam(client, teamId) {
	await client.query(
		`select pg_advisory_xact_lock(vt.scheme_id)
		 from visit_teams vt where vt.id = $1`,
		[teamId],
	);
	await client.query(
		`insert into site_visits (team_id, scheme_id)
		 select vt.id, vt.scheme_id from visit_teams vt
		 where vt.id = $1
		   and not exists (select 1 from site_visits sv where sv.team_id = vt.id)
		   and not exists (select 1 from site_visits active_sv
			 where active_sv.scheme_id = vt.scheme_id and active_sv.status in ('SCHEDULED', 'IN_PROGRESS'))`,
		[teamId],
	);
}

/**
 * Promote the oldest approved team waiting for a scheme after its previous
 * visit completes. The transaction caller already owns the completion write;
 * the advisory lock makes approval and promotion serialize per scheme.
 */
async function createNextForScheme(client, schemeId) {
	await client.query('select pg_advisory_xact_lock($1)', [schemeId]);
	await client.query(
		`insert into site_visits (team_id, scheme_id)
		 select vt.id, vt.scheme_id
		 from visit_teams vt
		 where vt.scheme_id = $1 and vt.status = 'APPROVED'
		   and not exists (select 1 from site_visits team_visit where team_visit.team_id = vt.id)
		   and not exists (select 1 from site_visits active_sv
			 where active_sv.scheme_id = vt.scheme_id and active_sv.status in ('SCHEDULED', 'IN_PROGRESS'))
		 order by vt.created_at asc
		 limit 1`,
		[schemeId],
	);
}

module.exports = { listForActor, findByIdForActor, createForApprovedTeam, createNextForScheme, updateScheduledDate };
