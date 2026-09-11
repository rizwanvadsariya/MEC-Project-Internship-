/**
 * Auth endpoints controller. Parse/shape the request, call auth.service, format
 * the response via lib/ApiResponse. No SQL, no business rules here.
 */
'use strict';

const authService = require('../services/auth.service');
const asyncHandler = require('../lib/asyncHandler');
const ApiResponse = require('../lib/ApiResponse');

const login = asyncHandler(async (req, res) => {
  const { session, user } = await authService.login(req.body);
  ApiResponse.ok(res, { session, user: { id: user.id, email: user.email } });
});

const forgotPassword = asyncHandler(async (req, res) => {
  await authService.forgotPassword(req.body);
  // Same response whether or not the email is registered (point #10).
  ApiResponse.ok(res, { message: 'If that email is registered, a reset link has been sent.' });
});

const me = asyncHandler(async (req, res) => {
  ApiResponse.ok(res, req.authUser);
});

const provisionUser = asyncHandler(async (req, res) => {
  const result = await authService.provisionUser(req.authUser, req.body);
  ApiResponse.created(res, result);
});

const deactivateUser = asyncHandler(async (req, res) => {
  const profile = await authService.deactivateUser(req.authUser, req.params.id);
  ApiResponse.ok(res, profile);
});

const listSessions = asyncHandler(async (req, res) => {
  const sessions = await authService.listSessions(req.authUser.id);
  ApiResponse.ok(res, sessions);
});

const revokeSession = asyncHandler(async (req, res) => {
  const result = await authService.revokeSession(req.authUser.id, req.params.sessionId);
  ApiResponse.ok(res, result);
});

module.exports = { login, forgotPassword, me, provisionUser, deactivateUser, listSessions, revokeSession };
