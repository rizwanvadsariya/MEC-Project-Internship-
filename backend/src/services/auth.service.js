/**
 * Auth business logic — Option A (admin-provisioned accounts), per the plan in
 * Memory.md "Planned: Supabase Auth setup". No HTTP objects, no raw SQL: calls
 * the Supabase Admin API for account lifecycle and repositories/ for the
 * `public.users` mirror + audit trail. Unit-testable in isolation.
 */
'use strict';

const { supabase } = require('../config/supabase');
const { config } = require('../config');
const { ROLES, HIGH_VALUE_ROLES } = require('../constants/roles');
const userRepo = require('../repositories/user.repo');
const sessionRepo = require('../repositories/session.repo');
const auditLogRepo = require('../repositories/auditLog.repo');
const ApiError = require('../lib/ApiError');
const logger = require('../lib/logger');

/**
 * Point #2 — who can provision whom. Nobody provisions a DIRECTOR_GENERAL
 * through the API (that stays a manual/bootstrap action, see
 * db/seeds/seedTestAccounts.js) — it simply never appears as a value below.
 */
const PROVISION_MATRIX = Object.freeze({
  [ROLES.DIRECTOR_GENERAL]: new Set([ROLES.REGIONAL_DIRECTOR, ROLES.MEO, ROLES.SUPPORT_USER]),
  [ROLES.REGIONAL_DIRECTOR]: new Set([ROLES.MEO, ROLES.SUPPORT_USER]),
});

function toPublicProfile(profile) {
  return {
    id: profile.id,
    fullName: profile.full_name,
    email: profile.email,
    phone: profile.phone,
    role: profile.role,
    divisionId: profile.division_id,
    departmentId: profile.department_id,
    isActive: profile.is_active,
  };
}

/**
 * Point #1 (invite link) + #2 (authorization matrix) + #3 (defense-in-depth
 * division/role validation) + #4 (audit log).
 */
async function provisionUser(actor, { email, fullName, phone, role, divisionId, departmentId }) {
  const allowed = PROVISION_MATRIX[actor.role];
  if (!allowed || !allowed.has(role)) {
    throw ApiError.forbidden('You are not permitted to create a user with this role', 'PROVISION_ROLE_DENIED');
  }

  // RD/DG may only provision within their own division; a SUPPORT_USER with
  // no divisionId in the request inherits the provisioner's division.
  const effectiveDivisionId = divisionId ?? actor.divisionId;
  if (effectiveDivisionId !== actor.divisionId) {
    throw ApiError.forbidden('Cannot provision a user outside your own division', 'PROVISION_DIVISION_DENIED');
  }

  const existing = await userRepo.findByEmail(email);
  if (existing) {
    throw ApiError.conflict('A user with this email already exists', undefined, 'EMAIL_TAKEN');
  }

  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo: config.INVITE_REDIRECT_URL, data: { full_name: fullName } },
  });
  if (error || !data?.user) {
    throw ApiError.badRequest(`Could not create the invite: ${error?.message || 'unknown error'}`);
  }

  const profile = await userRepo.insertProfile({
    id: data.user.id,
    fullName,
    email,
    phone,
    role,
    divisionId: effectiveDivisionId,
    departmentId,
  });

  await auditLogRepo.record({
    actorId: actor.id,
    action: 'USER_PROVISIONED',
    entityType: 'users',
    entityId: profile.id,
    metadata: { role, divisionId: effectiveDivisionId, departmentId },
  });

  // No SMTP is configured to actually deliver this yet, so hand the link back
  // to the (already-authorized) caller directly. Once email delivery is set
  // up, drop `inviteLink` from the response — Supabase will have sent it.
  return { profile: toPublicProfile(profile), inviteLink: data.properties?.action_link ?? null };
}

/** Point #6 — deactivation that actually revokes access, not just a DB flag. */
async function deactivateUser(actor, targetId) {
  if (targetId === actor.id) {
    throw ApiError.badRequest('Cannot deactivate your own account');
  }

  const target = await userRepo.findById(targetId);
  if (!target) throw ApiError.notFound('User not found');

  if (actor.role === ROLES.REGIONAL_DIRECTOR && target.division_id !== actor.divisionId) {
    throw ApiError.forbidden('Cannot deactivate a user outside your own division');
  }

  const updated = await userRepo.setActive(targetId, false);
  await sessionRepo.deleteAllForUser(targetId);

  try {
    // ~100 years — GoTrue has no direct "revoke everything forever" call short
    // of deleting the auth user outright, which we don't want (history/FKs).
    await supabase.auth.admin.updateUserById(targetId, { ban_duration: '876600h' });
  } catch (err) {
    logger.warn({ err, targetId }, 'Supabase admin ban call failed; DB-side is_active=false still applies immediately');
  }

  await auditLogRepo.record({
    actorId: actor.id,
    action: 'USER_DEACTIVATED',
    entityType: 'users',
    entityId: targetId,
  });

  return toPublicProfile(updated);
}

/** Point #8 — login is brokered here (not called directly from the client)
 *  specifically so failed attempts can be counted and locked out. */
async function login({ email, password }) {
  const profile = await userRepo.findByEmail(email);

  if (profile && !profile.is_active) {
    throw ApiError.forbidden('This account has been deactivated', 'ACCOUNT_DEACTIVATED');
  }

  if (profile?.locked_until && new Date(profile.locked_until) > new Date()) {
    await auditLogRepo.record({ actorId: profile.id, action: 'LOGIN_BLOCKED_LOCKED', entityType: 'users', entityId: profile.id });
    throw ApiError.forbidden('Account temporarily locked due to repeated failed logins. Try again later.', 'ACCOUNT_LOCKED');
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (profile) {
      const attempts = await userRepo.incrementFailedLogin(profile.id);
      if (attempts >= config.LOGIN_LOCKOUT_MAX_ATTEMPTS) {
        const until = new Date(Date.now() + config.LOGIN_LOCKOUT_WINDOW_MINUTES * 60_000);
        await userRepo.setLockedUntil(profile.id, until);
        await auditLogRepo.record({
          actorId: profile.id,
          action: 'LOGIN_LOCKED',
          entityType: 'users',
          entityId: profile.id,
          metadata: { attempts, lockedUntil: until.toISOString(), highValueAccount: HIGH_VALUE_ROLES.includes(profile.role) },
        });
        if (HIGH_VALUE_ROLES.includes(profile.role)) {
          // TODO: wire a real alert channel (email/Slack/push) once one exists.
          // The audit_log row above is the durable, queryable record until then.
          logger.warn({ userId: profile.id, role: profile.role }, 'DG/RD account locked after repeated failed logins');
        }
      }
    }
    throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  if (profile) await userRepo.resetLoginAttempts(profile.id);
  await auditLogRepo.record({ actorId: profile?.id ?? null, action: 'LOGIN_SUCCESS', entityType: 'users', entityId: profile?.id ?? null });

  return { session: data.session, user: data.user };
}

/** Point #10 — decided explicitly rather than bolted on later. Always
 *  resolves the same way regardless of whether the email is registered, so
 *  the endpoint can't be used to enumerate accounts. */
async function forgotPassword({ email }) {
  await auditLogRepo.record({ action: 'PASSWORD_RESET_REQUESTED', metadata: { email } });
  try {
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: config.PASSWORD_RESET_REDIRECT_URL });
  } catch (err) {
    logger.warn({ err, email }, 'resetPasswordForEmail call failed');
  }
}

/** Point #9 — session visibility + single-session revoke. */
async function listSessions(userId) {
  return sessionRepo.listByUser(userId);
}

async function revokeSession(userId, sessionId) {
  const deletedId = await sessionRepo.deleteOwnedSession(sessionId, userId);
  if (!deletedId) throw ApiError.notFound('Session not found');
  await auditLogRepo.record({ actorId: userId, action: 'SESSION_REVOKED', entityType: 'auth.sessions', entityId: sessionId });
  return { id: deletedId };
}

module.exports = {
  toPublicProfile,
  provisionUser,
  deactivateUser,
  login,
  forgotPassword,
  listSessions,
  revokeSession,
};
