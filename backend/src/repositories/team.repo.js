/**
 * visit_teams + visit_team_members CRUD, partial-unique LEAD_MEO guard.
 * The ONLY layer that talks to Postgres/Supabase. Parameterized queries, proper
 * joins (no N+1), cursor pagination on lists (architecture.md §5.1/§5.3).
 */
'use strict';

const db = require('../config/database');

async function findSchemeDivision(schemeId) {
	const { rows } = await db.query(
		`select distinct d.division_id as "divisionId"
		 from schemes s
		 join scheme_districts sd on sd.scheme_id = s.id
		 join districts d on d.id = sd.district_id
		 where s.id = $1`,
		[schemeId],
	);
	return rows[0] || null;
}

/**
 * MEOs must belong to this division. Support users may either belong to it
 * or have no division at all — the users table's own CHECK constraint
 * (schema.md §4.1) explicitly allows a NULL division_id for SUPPORT_USER,
 * so those accounts are division-agnostic and eligible everywhere.
 */
async function findEligibleMembers(divisionId) {
	const { rows } = await db.query(
		`select id, full_name as "fullName", email, role, department_id as "departmentId"
		 from users
		 where is_active = true and (
			 (role = 'MEO' and division_id = $1)
			 or (role = 'SUPPORT_USER' and (division_id = $1 or division_id is null))
		 )
		 order by role, full_name`,
		[divisionId],
	);
	return rows;
}

async function createDraft({ schemeId, createdBy, leadMeoId, supportingMembers }) {
	const client = await db.pool.connect();
	try {
		await client.query('begin');
		const team = (await client.query(
			`insert into visit_teams (scheme_id, created_by, status)
			 values ($1, $2, 'DRAFT') returning id, scheme_id as "schemeId", status, version`,
			[schemeId, createdBy],
		)).rows[0];
		const members = [
			[team.id, leadMeoId, 'LEAD_MEO'],
			...supportingMembers.map((member) => [team.id, member.id, member.teamRole]),
		];
		for (const member of members) {
			await client.query(
				`insert into visit_team_members (team_id, user_id, team_role)
				 values ($1, $2, $3)`,
				member,
			);
		}
		await client.query('commit');
		return getById(team.id);
	} catch (error) {
		await client.query('rollback');
		throw error;
	} finally {
		client.release();
	}
}

async function getById(teamId) {
	const teamResult = await db.query(
		`select id, scheme_id as "schemeId", created_by as "createdBy", status, version, created_at as "createdAt"
		 from visit_teams where id = $1`,
		[teamId],
	);
	if (!teamResult.rows[0]) return null;
	const members = await db.query(
		`select vtm.id, vtm.user_id as "userId", vtm.team_role as "teamRole",
						u.full_name as "fullName", u.email
		 from visit_team_members vtm join users u on u.id = vtm.user_id
		 where vtm.team_id = $1 order by vtm.team_role, u.full_name`,
		[teamId],
	);
	return { ...teamResult.rows[0], members: members.rows };
}

async function submit(teamId, userId) {
	const client = await db.pool.connect();
	try {
		await client.query('begin');
		const team = (await client.query(
			`update visit_teams set status = 'PENDING_APPROVAL'
			 where id = $1 and created_by = $2 and status = 'DRAFT'
			 returning id, scheme_id as "schemeId", created_by as "createdBy", status, version`,
			[teamId, userId],
		)).rows[0];
		if (!team) return null;
		await client.query(
			`insert into team_approval_requests (team_id, team_version, submitted_by)
			 values ($1, $2, $3)`,
			[teamId, team.version, userId],
		);
		await client.query('commit');
		return getById(teamId);
	} catch (error) {
		await client.query('rollback');
		throw error;
	} finally {
		client.release();
	}
}

async function resubmit(teamId, userId) {
	const client = await db.pool.connect();
	try {
		await client.query('begin');
		const team = (await client.query(
			`update visit_teams set status = 'PENDING_APPROVAL', version = version + 1
			 where id = $1 and created_by = $2 and status = 'REJECTED'
			 returning id, scheme_id as "schemeId", created_by as "createdBy", status, version`,
			[teamId, userId],
		)).rows[0];
		if (!team) return null;
		await client.query(
			`insert into team_approval_requests (team_id, team_version, submitted_by)
			 values ($1, $2, $3)`,
			[teamId, team.version, userId],
		);
		await client.query('commit');
		return getById(teamId);
	} catch (error) {
		await client.query('rollback');
		throw error;
	} finally {
		client.release();
	}
}

module.exports = { findSchemeDivision, findEligibleMembers, createDraft, getById, submit, resubmit };
