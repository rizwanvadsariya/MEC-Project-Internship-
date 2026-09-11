/**
 * app `users` table (mirrors auth.users): lookup, insert, activation state,
 * and the login-lockout counters used by services/auth.service.js.
 * The ONLY layer that talks to Postgres/Supabase. Parameterized queries.
 */
'use strict';

const { query } = require('../config/database');

const PROFILE_COLUMNS = `
  id, full_name, email, phone, role, division_id, department_id,
  is_active, failed_login_count, locked_until, created_at, updated_at
`;

async function findById(id) {
  const { rows } = await query(`select ${PROFILE_COLUMNS} from users where id = $1`, [id]);
  return rows[0] || null;
}

async function findByEmail(email) {
  const { rows } = await query(`select ${PROFILE_COLUMNS} from users where email = $1`, [email]);
  return rows[0] || null;
}

async function insertProfile({ id, fullName, email, phone = null, role, divisionId = null, departmentId = null }) {
  const { rows } = await query(
    `insert into users (id, full_name, email, phone, role, division_id, department_id)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning ${PROFILE_COLUMNS}`,
    [id, fullName, email, phone, role, divisionId, departmentId],
  );
  return rows[0];
}

async function setActive(id, isActive) {
  const { rows } = await query(
    `update users set is_active = $2 where id = $1 returning ${PROFILE_COLUMNS}`,
    [id, isActive],
  );
  return rows[0] || null;
}

/** Login-lockout counters (hardening point #8). Kept as plain data ops —
 *  the lockout policy (threshold, window) lives in the service. */
async function incrementFailedLogin(id) {
  const { rows } = await query(
    `update users set failed_login_count = failed_login_count + 1
     where id = $1 returning failed_login_count`,
    [id],
  );
  return rows[0]?.failed_login_count ?? 0;
}

async function setLockedUntil(id, until) {
  await query(`update users set locked_until = $2 where id = $1`, [id, until]);
}

async function resetLoginAttempts(id) {
  await query(`update users set failed_login_count = 0, locked_until = null where id = $1`, [id]);
}

module.exports = {
  findById,
  findByEmail,
  insertProfile,
  setActive,
  incrementFailedLogin,
  setLockedUntil,
  resetLoginAttempts,
};
