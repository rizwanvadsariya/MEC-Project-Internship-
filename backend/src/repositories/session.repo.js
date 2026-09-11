/**
 * Session visibility + single-session revoke (hardening point #9). Reads and
 * deletes directly from Supabase Auth's own `auth.sessions` table — GoTrue
 * treats a deleted session row as revoked (its refresh token stops working);
 * the short-lived access token some client still holds simply expires on its
 * own shortly after (architecture.md §4.1's short-lived-JWT design already
 * bounds that window).
 */
'use strict';

const { query } = require('../config/database');

async function listByUser(userId) {
  const { rows } = await query(
    `select id, created_at, updated_at, aal, not_after, user_agent, ip
     from auth.sessions
     where user_id = $1
     order by created_at desc`,
    [userId],
  );
  return rows;
}

/** Delete a session, scoped to its owner so a user can only revoke their own. */
async function deleteOwnedSession(sessionId, userId) {
  const { rows } = await query(
    `delete from auth.sessions where id = $1 and user_id = $2 returning id`,
    [sessionId, userId],
  );
  return rows[0]?.id || null;
}

/** Delete every session for a user — used by deactivateUser (point #6). */
async function deleteAllForUser(userId) {
  await query(`delete from auth.sessions where user_id = $1`, [userId]);
}

module.exports = { listByUser, deleteOwnedSession, deleteAllForUser };
