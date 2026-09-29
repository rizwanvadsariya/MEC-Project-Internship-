/**
 * Division-scoped RD/DG dashboards and analytics rollups (progress % by division/department, status breakdown).
 * Routes only: HTTP verb + path -> middleware (authenticate, authorize(roles),
 * validate(schema)) -> controller method. No logic here.
 */
'use strict';
const router = require('express').Router();
const authenticate = require('../../../middleware/authenticate');
const authorize = require('../../../middleware/authorize');
const validate = require('../../../middleware/validate');
const controller = require('../../../controllers/dashboards.controller');
const schema = require('../../../validators/dashboard.schema');
const { ROLES } = require('../../../constants/roles');

router.use(authenticate);
router.get('/division', authorize(ROLES.REGIONAL_DIRECTOR, ROLES.DIRECTOR_GENERAL), controller.getDivisionSummary);
router.get('/member', authorize(ROLES.MEO, ROLES.SUPPORT_USER), controller.getMemberSummary);
router.get(
	'/reconciliation',
	authorize(ROLES.REGIONAL_DIRECTOR, ROLES.DIRECTOR_GENERAL),
	validate(schema.reconciliationQuery),
	controller.getProgressReconciliation,
);

module.exports = router;
