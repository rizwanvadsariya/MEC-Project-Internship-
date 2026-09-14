/**
 * DG approval queue: list pending, approve/reject with remarks. Append-only (team_approval_requests).
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

router.use(authenticate, authorize(ROLES.DIRECTOR_GENERAL));
router.get('/', controller.listPending);
router.post('/:teamId/decision', validate(schema.teamId), validate(schema.decision), controller.decide);

module.exports = router;
