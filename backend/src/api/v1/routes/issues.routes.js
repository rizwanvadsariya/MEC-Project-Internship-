/**
 * Lead-MEO issue reports: file, list, remove (type, severity, description).
 * Routes only: HTTP verb + path -> middleware (authenticate, authorize(roles),
 * validate(schema)) -> controller method. No logic here.
 */
'use strict';
const router = require('express').Router();
const authenticate = require('../../../middleware/authenticate');
const authorize = require('../../../middleware/authorize');
const validate = require('../../../middleware/validate');
const controller = require('../../../controllers/issues.controller');
const schema = require('../../../validators/issue.schema');

router.use(authenticate, authorize());
router.get('/:id/issues', validate(schema.idParam), controller.list);
router.post('/:id/issues', validate(schema.idParam), validate(schema.file), controller.file);
router.delete('/:id/issues/:issueId', validate(schema.issueParam), controller.remove);
module.exports = router;
