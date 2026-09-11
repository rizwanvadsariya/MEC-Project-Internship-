/**
 * authorize(...roles) — RBAC guard matching the PRD §7 permission matrix.
 * Must run after authenticate.js. Loads the caller's `users` profile, rejects
 * a deactivated account (hardening point #6 — is_active is re-checked on
 * every request, not just at login, so deactivation takes effect immediately
 * even though the JWT itself is still technically valid), enforces the
 * role allow-list, and — for DG/RD, only once MFA_ENFORCEMENT_ENABLED is on
 * (hardening point #7) — requires an MFA-verified (aal2) session.
 *
 * Call with no roles (`authorize()`) to require "any authenticated, active
 * user" without a specific role.
 */
'use strict';

const { config } = require('../config');
const userRepo = require('../repositories/user.repo');
const ApiError = require('../lib/ApiError');
const asyncHandler = require('../lib/asyncHandler');
const { HIGH_VALUE_ROLES } = require('../constants/roles');

const MFA_REQUIRED_ROLES = new Set(HIGH_VALUE_ROLES);

function toAuthUser(profile) {
  return {
    id: profile.id,
    fullName: profile.full_name,
    email: profile.email,
    role: profile.role,
    divisionId: profile.division_id,
    departmentId: profile.department_id,
    isActive: profile.is_active,
  };
}

function authorize(...roles) {
  return asyncHandler(async function authorizeMiddleware(req, _res, next) {
    if (!req.user?.id) {
      throw ApiError.unauthorized('authenticate must run before authorize');
    }

    const profile = await userRepo.findById(req.user.id);
    if (!profile) {
      throw ApiError.unauthorized('No profile found for this account');
    }
    if (!profile.is_active) {
      throw ApiError.forbidden('Account has been deactivated');
    }
    if (roles.length && !roles.includes(profile.role)) {
      throw ApiError.forbidden('You do not have permission to perform this action');
    }

    if (config.MFA_ENFORCEMENT_ENABLED && MFA_REQUIRED_ROLES.has(profile.role) && req.authClaims.aal !== 'aal2') {
      throw ApiError.unauthorized('MFA verification required for this role', 'MFA_REQUIRED');
    }

    req.authUser = toAuthUser(profile);
    next();
  });
}

module.exports = authorize;
