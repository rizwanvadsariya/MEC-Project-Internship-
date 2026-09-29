/**
 * DG approval queue: list pending, approve/reject with remarks. Append-only (team_approval_requests).
 * Step 26 adds a full audit trail (/history) — RD/DG both, unlike listPending/
 * decide which stay DG-only, so the router-level authorize can no longer
 * cover every route the same way; each route sets its own.
 * Routes only: HTTP verb + path -> middleware (authenticate, authorize(roles),
 * validate(schema)) -> controller method. No logic here.
 */
'use strict';
const router = require('express').Router();
const authenticate = require('../../../middleware/authenticate');
const authorize = require('../../../middleware/authorize');
const validate = require('../../../middleware/validate');
const controller = require('../../../controllers/approvals.controller');
const schema = require('../../../validators/approval.schema');
const { ROLES } = require('../../../constants/roles');

router.use(authenticate);
router.get('/', authorize(ROLES.DIRECTOR_GENERAL), controller.listPending);
router.get('/history', authorize(ROLES.REGIONAL_DIRECTOR, ROLES.DIRECTOR_GENERAL), validate(schema.history), controller.history);
router.post('/:teamId/decision', authorize(ROLES.DIRECTOR_GENERAL), validate(schema.teamId), validate(schema.decision), controller.decide);

module.exports = router;
