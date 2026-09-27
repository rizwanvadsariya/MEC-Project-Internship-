/**
 * Site visits auto-created on team approval (siteVisit.repo.createForApprovedTeam,
 * called from approval.repo.decide). List/detail are read-only for anyone who
 * can see the visit; PATCH .../schedule (Step 21) is RD/lead-MEO-only, gated
 * inside the service since it depends on the specific visit's team, not a
 * fixed role list. Check-in / complete belong to the visit-form-fill workflow
 * (phases.md Step 12+).
 * Routes only: HTTP verb + path -> middleware (authenticate, authorize(roles),
 * validate(schema)) -> controller method. No logic here.
 */
'use strict';
const router = require('express').Router();
const authenticate = require('../../../middleware/authenticate');
const authorize = require('../../../middleware/authorize');
const validate = require('../../../middleware/validate');
const controller = require('../../../controllers/siteVisits.controller');
const schema = require('../../../validators/siteVisit.schema');

router.use(authenticate, authorize());
router.get('/', validate(schema.query), controller.list);
router.get('/:id', validate(schema.idParam), controller.getById);
router.patch('/:id/schedule', validate(schema.schedule), controller.schedule);

module.exports = router;
