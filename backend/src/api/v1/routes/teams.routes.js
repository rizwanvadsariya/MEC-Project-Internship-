/**
 * RD team assembly: create draft, add/remove members, set lead MEO, submit for approval.
 * Routes only: HTTP verb + path -> middleware (authenticate, authorize(roles),
 * validate(schema)) -> controller method. No logic here.
 */
'use strict';
const router = require('express').Router();
const authenticate = require('../../../middleware/authenticate');
const authorize = require('../../../middleware/authorize');
const validate = require('../../../middleware/validate');
const controller = require('../../../controllers/teams.controller');
const schema = require('../../../validators/team.schema');
const { ROLES } = require('../../../constants/roles');

router.use(authenticate, authorize(ROLES.REGIONAL_DIRECTOR));
router.get('/eligible-members', controller.eligibleMembers);
router.post('/', validate(schema.create), controller.createDraft);
router.post('/:id/submit', validate(schema.idParam), controller.submit);
router.post('/:id/resubmit', validate(schema.idParam), controller.resubmit);

module.exports = router;
