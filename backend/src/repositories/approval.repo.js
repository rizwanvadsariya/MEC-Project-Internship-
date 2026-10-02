/**
 * team_approval_requests — insert only, list by team.
 * The ONLY layer that talks to Postgres/Supabase. Parameterized queries, proper
 * joins (no N+1), cursor pagination on lists (architecture.md §5.1/§5.3).
 */
'use strict';

const db = require('../config/database');
const siteVisitRepo = require('./siteVisit.repo');

async function listPending(divisionId) {
	const divisionIds = Array.isArray(divisionId) ? divisionId : [divisionId];
	const { rows } = await db.query(
		`select tar.id as "requestId", tar.team_id as "teamId", tar.team_version as "teamVersion",
						tar.submitted_at as "submittedAt", tar.remarks,
						vt.scheme_id as "schemeId", s.uid as "schemeUid", s.name as "schemeName",
						u.full_name as "submittedByName",
						coalesce(json_agg(json_build_object(
							'userId', vtm.user_id, 'teamRole', vtm.team_role,
							'fullName', member.full_name, 'email', member.email
						) order by vtm.team_role, member.full_name) filter (where vtm.id is not null), '[]') as members
		 from team_approval_requests tar
		 join visit_teams vt on vt.id = tar.team_id
		 join schemes s on s.id = vt.scheme_id
		 join users u on u.id = tar.submitted_by
		 left join visit_team_members vtm on vtm.team_id = vt.id
		 left join users member on member.id = vtm.user_id
		 where tar.decision = 'PENDING' and vt.status = 'PENDING_APPROVAL'
			 and exists (
				 select 1 from scheme_districts scope_sd
				 join districts scope_d on scope_d.id = scope_sd.district_id
				 where scope_sd.scheme_id = vt.scheme_id and scope_d.division_id = any($1::int[])
			 )
		 group by tar.id, vt.id, s.id, u.id
		 order by tar.submitted_at asc`,
		[divisionIds],
	);
	return rows;
}

/**
 * Step 26 — full audit trail: every team_approval_requests row ever written
 * (submit, reject, resubmit, approve), not just the still-PENDING ones
 * listPending returns. Division-scoped the same way as every other list
 * endpoint in this app (RD/DG see their own division, not just their own
 * submissions) — reuses the exact scheme_districts/districts EXISTS-clause
 * template listPending/decide already use, applied without listPending's own
 * `tar.decision = 'PENDING'` restriction. Newest first, same convention as
 * comments (Step 20) and notifications (Step 17).
 */
async function listHistory(divisionId, filters) {
	const params = [Array.isArray(divisionId) ? divisionId : [divisionId]];
	const clauses = [
		`exists (
			select 1 from scheme_districts scope_sd
			join districts scope_d on scope_d.id = scope_sd.district_id
			where scope_sd.scheme_id = vt.scheme_id and scope_d.division_id = any($1::int[])
		)`,
	];

	if (filters.teamId) {
		params.push(filters.teamId);
		clauses.push(`tar.team_id = $${params.length}`);
	}
	if (filters.decision) {
		params.push(filters.decision);
		clauses.push(`tar.decision = $${params.length}`);
	}
	if (filters.cursor) {
		params.push(filters.cursor.submittedAt);
		const submittedAtIdx = params.length;
		params.push(filters.cursor.id);
		const idIdx = params.length;
		clauses.push(`(tar.submitted_at, tar.id) < ($${submittedAtIdx}, $${idIdx})`);
	}

	const limit = Number.isInteger(filters.limit) ? filters.limit : 20;
	params.push(limit + 1);

	const result = await db.query(
		`select tar.id as "requestId", tar.team_id as "teamId", tar.team_version as "teamVersion",
						tar.decision, tar.remarks, tar.submitted_at as "submittedAt", tar.reviewed_at as "reviewedAt",
						vt.status as "teamStatus",
						s.id as "schemeId", s.uid as "schemeUid", s.name as "schemeName",
						submitter.full_name as "submittedByName",
						reviewer.full_name as "reviewedByName"
		 from team_approval_requests tar
		 join visit_teams vt on vt.id = tar.team_id
		 join schemes s on s.id = vt.scheme_id
		 join users submitter on submitter.id = tar.submitted_by
		 left join users reviewer on reviewer.id = tar.reviewed_by
		 where ${clauses.join(' and ')}
		 order by tar.submitted_at desc, tar.id desc
		 limit $${params.length}`,
		params,
	);

	const hasMore = result.rows.length > limit;
	const rows = result.rows.slice(0, limit);
	const last = rows[rows.length - 1];
	return {
		rows,
		nextCursor: hasMore && last ? `${last.submittedAt.toISOString()}_${last.requestId}` : null,
	};
}

async function decide(teamId, reviewerId, divisionId, decision, remarks) {
	const divisionIds = Array.isArray(divisionId) ? divisionId : [divisionId];
	const client = await db.pool.connect();
	try {
		await client.query('begin');
		const request = (await client.query(
			`select tar.id from team_approval_requests tar
			 join visit_teams vt on vt.id = tar.team_id
			 where tar.team_id = $1 and tar.decision = 'PENDING'
				 and exists (
					 select 1 from scheme_districts scope_sd
					 join districts scope_d on scope_d.id = scope_sd.district_id
					 where scope_sd.scheme_id = vt.scheme_id and scope_d.division_id = any($2::int[])
				 )
			 order by tar.submitted_at desc limit 1 for update`,
			[teamId, divisionIds],
		)).rows[0];
		if (!request) return null;
		await client.query(
			`update team_approval_requests
			 set decision = $2, remarks = $3, reviewed_by = $4, reviewed_at = now()
			 where id = $1`,
			[request.id, decision, remarks || null, reviewerId],
		);
		await client.query(`update visit_teams set status = $2 where id = $1`, [teamId, decision]);
		if (decision === 'APPROVED') {
			await siteVisitRepo.createForApprovedTeam(client, teamId);
		}
		await client.query('commit');
		return { teamId, decision, remarks: remarks || null };
	} catch (error) {
		await client.query('rollback');
		throw error;
	} finally {
		client.release();
	}
}

module.exports = { listPending, listHistory, decide };
