/**
 * comments (polymorphic commentable_type/id).
 * The ONLY layer that talks to Postgres/Supabase. Parameterized queries, proper
 * joins (no N+1), cursor pagination on lists (architecture.md §5.1/§5.3).
 */
'use strict';
const db = require('../config/database');

const LIST_SELECT = `
	select c.id, c.commentable_type as "commentableType", c.commentable_id as "commentableId",
		c.author_id as "authorId", u.full_name as "authorName", u.role as "authorRole",
		c.body, c.created_at as "createdAt", c.updated_at as "updatedAt"
	from comments c
	join users u on u.id = c.author_id
`;

async function listForCommentable(commentableType, commentableId, { cursor, limit }) {
	const params = [commentableType, commentableId];
	const clauses = ['c.commentable_type = $1', 'c.commentable_id = $2'];

	if (cursor) {
		params.push(cursor.createdAt);
		const createdAtIdx = params.length;
		params.push(cursor.id);
		const idIdx = params.length;
		clauses.push(`(c.created_at, c.id) < ($${createdAtIdx}, $${idIdx})`);
	}

	params.push(limit + 1);
	const result = await db.query(
		`${LIST_SELECT} where ${clauses.join(' and ')} order by c.created_at desc, c.id desc limit $${params.length}`,
		params,
	);
	const hasMore = result.rows.length > limit;
	const rows = result.rows.slice(0, limit);
	const last = rows[rows.length - 1];
	return { rows, nextCursor: hasMore && last ? `${last.createdAt.toISOString()}_${last.id}` : null };
}

async function create(commentableType, commentableId, authorId, body) {
	const result = await db.query(
		`insert into comments (commentable_type, commentable_id, author_id, body)
		 values ($1, $2, $3, $4)
		 returning id, commentable_type as "commentableType", commentable_id as "commentableId",
			author_id as "authorId", body, created_at as "createdAt", updated_at as "updatedAt"`,
		[commentableType, commentableId, authorId, body],
	);
	return result.rows[0];
}

async function findById(id) {
	const result = await db.query(
		`select id, commentable_type as "commentableType", commentable_id as "commentableId",
			author_id as "authorId", body, created_at as "createdAt", updated_at as "updatedAt"
		 from comments where id = $1`,
		[id],
	);
	return result.rows[0] || null;
}

async function update(id, body) {
	const result = await db.query(
		`update comments set body = $2 where id = $1
		 returning id, commentable_type as "commentableType", commentable_id as "commentableId",
			author_id as "authorId", body, created_at as "createdAt", updated_at as "updatedAt"`,
		[id, body],
	);
	return result.rows[0];
}

async function remove(id) {
	await db.query('delete from comments where id = $1', [id]);
}

module.exports = { listForCommentable, create, findById, update, remove };
