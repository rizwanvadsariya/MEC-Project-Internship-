/**
 * Login, forgot-password, current-user profile, account provisioning,
 * deactivation, and session management. Routes only: HTTP verb + path ->
 * middleware -> controller method. No logic here.
 *
 * Login is a backend route (not a direct Supabase client call) specifically
 * so failed attempts can be counted for the lockout policy (hardening #8).
 */
'use strict';

const router = require('express').Router();
const authenticate = require('../../../middleware/authenticate');
const authorize = require('../../../middleware/authorize');
const validate = require('../../../middleware/validate');
const { loginLimiter, provisionLimiter } = require('../../../middleware/rateLimit');
const schema = require('../../../validators/auth.schema');
const controller = require('../../../controllers/auth.controller');
const { ROLES } = require('../../../constants/roles');

router.post('/login', loginLimiter, validate(schema.login), controller.login);
router.post('/forgot-password', loginLimiter, validate(schema.forgotPassword), controller.forgotPassword);

router.get('/me', authenticate, authorize(), controller.me);

router.post(
  '/users',
  authenticate,
  authorize(ROLES.DIRECTOR_GENERAL, ROLES.REGIONAL_DIRECTOR),
  provisionLimiter,
  validate(schema.provisionUser),
  controller.provisionUser,
);

router.patch(
  '/users/:id/deactivate',
  authenticate,
  authorize(ROLES.DIRECTOR_GENERAL, ROLES.REGIONAL_DIRECTOR),
  validate(schema.userIdParam),
  controller.deactivateUser,
);

router.get('/sessions', authenticate, authorize(), controller.listSessions);
router.delete('/sessions/:sessionId', authenticate, authorize(), validate(schema.sessionIdParam), controller.revokeSession);

module.exports = router;
