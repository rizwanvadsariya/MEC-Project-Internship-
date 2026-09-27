/**
 * Polymorphic comments on scheme / site_visit. Support users blocked here.
 * Routes only: HTTP verb + path -> middleware (authenticate, authorize(roles),
 * validate(schema)) -> controller method. No logic here.
 */
'use strict';
const router = require('express').Router();
const authenticate = require('../../../middleware/authenticate');
const authorize = require('../../../middleware/authorize');
const validate = require('../../../middleware/validate');
const controller = require('../../../controllers/comments.controller');
const schema = require('../../../validators/comment.schema');
const { ROLES } = require('../../../constants/roles');

router.use(authenticate, authorize(ROLES.REGIONAL_DIRECTOR, ROLES.DIRECTOR_GENERAL, ROLES.MEO));
router.get('/', validate(schema.list), controller.list);
router.post('/', validate(schema.create), controller.create);
router.patch('/:id', validate(schema.update), controller.update);
router.delete('/:id', validate(schema.idParam), controller.remove);
module.exports = router;
