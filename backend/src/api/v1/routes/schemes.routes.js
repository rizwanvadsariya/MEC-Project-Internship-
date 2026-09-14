/**
 * Read-only ADP scheme browser: list/filter by division, district, department, sub_sector, status; scheme detail. No create/update path (schema.md §6.3).
 * Routes only: HTTP verb + path -> middleware (authenticate, authorize(roles),
 * validate(schema)) -> controller method. No logic here.
 */
'use strict';
const router = require('express').Router();
const authenticate = require('../../../middleware/authenticate');
const authorize = require('../../../middleware/authorize');
const validate = require('../../../middleware/validate');
const controller = require('../../../controllers/schemes.controller');
const schema = require('../../../validators/schemes.schema');

router.get('/filters', authenticate, authorize(), controller.filterOptions);
router.get('/', authenticate, authorize(), validate(schema.query), controller.list);
router.get('/:id', authenticate, authorize(), validate(schema.idParam), controller.getById);

module.exports = router;
