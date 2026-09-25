/**
 * notifications CRUD, unread filter, plus the small read-side lookups
 * notification.service's triggers need to resolve who to notify.
 * The ONLY layer that talks to Postgres/Supabase. Parameterized queries,
 * proper joins (no N+1), cursor pagination on lists (architecture.md §5.1/§5.3).
 */
'use strict';

const db = require('../config/database');

async function create(rows) {
	if (!rows.length) return [];
	const params = [];
	const placeholders = rows.map((row) => {
		params.push(row.userId, row.title, row.body ?? null, row.relatedType ?? null, row.relatedId ?? null);
		const last = params.length;
		return `($${last - 4}, $${last - 3}, $${last - 2}, $${last - 1}, $${last})`;
	});
	const result = await db.query(
		`insert into notifications (user_id, title, body, related_type, related_id)
		 values ${placeholders.join(', ')}
		 returning id, user_id as "userId", title, body, related_type as "relatedType", related_id as "relatedId",
			is_read as "isRead", created_at as "createdAt"`,
		params,
	);
	return result.rows;
}

async function listForUser(userId, filters) {
	const params = [userId];
	const clauses = ['user_id = $1'];
	if (filters.unreadOnly) clauses.push('is_read = false');
	if (filters.cursor) {
		params.push(filters.cursor.createdAt);
		const createdAtIdx = params.length;
		params.push(filters.cursor.id);
		const idIdx = params.length;
		clauses.push(`(created_at, id) < ($${createdAtIdx}, $${idIdx})`);
	}
	const limit = Number.isInteger(filters.limit) ? filters.limit : 20;
	params.push(limit + 1);

	const result = await db.query(
		`select id, user_id as "userId", title, body, related_type as "relatedType", related_id as "relatedId",
				is_read as "isRead", created_at as "createdAt"
		 from notifications where ${clauses.join(' and ')}
		 order by created_at desc, id desc limit $${params.length}`,
		params,
	);
	const hasMore = result.rows.length > limit;
	const rows = result.rows.slice(0, limit);
	const last = rows[rows.length - 1];
	return { rows, nextCursor: hasMore && last ? `${last.createdAt.toISOString()}_${last.id}` : null };
}

async function markRead(userId, id) {
	const result = await db.query(
		`update notifications set is_read = true where id = $1 and user_id = $2
		 returning id, user_id as "userId", title, body, related_type as "relatedType", related_id as "relatedId",
			is_read as "isRead", created_at as "createdAt"`,
		[id, userId],
	);
	return result.rows[0] || null;
}

async function countUnread(userId) {
	const result = await db.query('select count(*)::int as count from notifications where user_id = $1 and is_read = false', [userId]);
	return result.rows[0].count;
}

async function findDivisionLeadership(divisionId) {
	if (!divisionId) return [];
	const result = await db.query(
		`select id from users where division_id = $1 and role in ('REGIONAL_DIRECTOR', 'DIRECTOR_GENERAL') and is_active = true`,
		[divisionId],
	);
	return result.rows.map((row) => row.id);
}

async function findSchemeBasics(schemeId) {
	const result = await db.query('select uid, name from schemes where id = $1', [schemeId]);
	return result.rows[0] || null;
}

/**
 * Everything the issue-filed / visit-completed triggers need about a site
 * visit's parent team, in one round trip: the scheme name, the team creator
 * (the RD), every current team member, and that scheme's division
 * leadership (RD/DG) for oversight visibility. A scheme spanning multiple
 * districts picks the first division found — fine for notification routing,
 * which is informational, not a security boundary (unlike the RLS-mirroring
 * EXISTS clauses elsewhere in this codebase).
 */
async function findVisitNotificationContext(siteVisitId) {
	const base = await db.query(
		`select sv.team_id as "teamId", vt.created_by as "createdBy", s.name as "schemeName",
				(select d.division_id from scheme_districts sd join districts d on d.id = sd.district_id
				 where sd.scheme_id = s.id limit 1) as "divisionId"
		 from site_visits sv
		 join visit_teams vt on vt.id = sv.team_id
		 join schemes s on s.id = vt.scheme_id
		 where sv.id = $1`,
		[siteVisitId],
	);
	const row = base.rows[0];
	if (!row) return null;

	const [members, divisionLeadershipIds] = await Promise.all([
		db.query('select user_id as "userId" from visit_team_members where team_id = $1', [row.teamId]),
		findDivisionLeadership(row.divisionId),
	]);

	return {
		schemeName: row.schemeName,
		createdBy: row.createdBy,
		teamMemberIds: members.rows.map((member) => member.userId),
		divisionLeadershipIds,
	};
}

module.exports = {
	create,
	listForUser,
	markRead,
	countUnread,
	findDivisionLeadership,
	findSchemeBasics,
	findVisitNotificationContext,
};
