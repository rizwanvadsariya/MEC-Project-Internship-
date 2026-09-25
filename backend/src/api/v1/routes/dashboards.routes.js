/**
 * Division-scoped RD/DG dashboards and analytics rollups (progress % by division/department, status breakdown).
 * Routes only: HTTP verb + path -> middleware (authenticate, authorize(roles),
 * validate(schema)) -> controller method. No logic here.
 */
'use strict';
const router = require('express').Router();
const authenticate = require('../../../middleware/authenticate');
const authorize = require('../../../middleware/authorize');
const controller = require('../../../controllers/dashboards.controller');
const { ROLES } = require('../../../constants/roles');

router.use(authenticate);
router.get('/division', authorize(ROLES.REGIONAL_DIRECTOR, ROLES.DIRECTOR_GENERAL), controller.getDivisionSummary);
router.get('/member', authorize(ROLES.MEO, ROLES.SUPPORT_USER), controller.getMemberSummary);

module.exports = router;
