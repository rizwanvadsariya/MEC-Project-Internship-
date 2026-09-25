/**
 * push_tokens CRUD — one row per (user, device), upserted on the device's
 * own token so re-registering on every app launch is idempotent.
 * The ONLY layer that talks to Postgres/Supabase. Parameterized queries.
 */
'use strict';

const db = require('../config/database');

async function upsert(userId, token, platform) {
	const result = await db.query(
		`insert into push_tokens (user_id, token, platform)
		 values ($1, $2, $3)
		 on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now()
		 returning id, user_id as "userId", token, platform, created_at as "createdAt"`,
		[userId, token, platform],
	);
	return result.rows[0];
}

async function removeForUser(userId, token) {
	await db.query('delete from push_tokens where user_id = $1 and token = $2', [userId, token]);
}

async function removeToken(token) {
	await db.query('delete from push_tokens where token = $1', [token]);
}

async function findTokensForUsers(userIds) {
	if (!userIds.length) return [];
	const result = await db.query('select user_id as "userId", token from push_tokens where user_id = any($1::uuid[])', [userIds]);
	return result.rows;
}

module.exports = { upsert, removeForUser, removeToken, findTokensForUsers };
