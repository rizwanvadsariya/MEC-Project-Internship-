/**
 * Verify the Supabase JWT from the Authorization header against Supabase's
 * JWKS before any handler runs (architecture.md §4.1). Attaches:
 *   req.authClaims — the raw verified JWT payload (sub, email, aal, ...)
 *   req.user       — { id, email } convenience shape
 *
 * Does NOT touch the database — that's authorize.js's job (RBAC + is_active +
 * MFA-assurance checks), kept as a separate step so a route that only needs
 * "is this a real, unexpired token" never pays for a profile lookup.
 */
'use strict';

const { createRemoteJWKSet, jwtVerify } = require('jose');
const { config } = require('../config');
const ApiError = require('../lib/ApiError');
const asyncHandler = require('../lib/asyncHandler');

const JWKS = createRemoteJWKSet(new URL(config.SUPABASE_JWKS_URL));
const ISSUER = `${config.SUPABASE_URL}/auth/v1`;

module.exports = asyncHandler(async function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw ApiError.unauthorized('Missing or malformed Authorization header');
  }

  let payload;
  try {
    ({ payload } = await jwtVerify(token, JWKS, { issuer: ISSUER, audience: 'authenticated' }));
  } catch (err) {
    throw ApiError.unauthorized(
      err.code === 'ERR_JWT_EXPIRED' ? 'Session expired, please log in again' : 'Invalid or expired token',
    );
  }

  req.authClaims = payload;
  req.user = { id: payload.sub, email: payload.email };
  next();
});
