/**
 * Lead-MEO visit form: fetch template, save draft, submit (physical_progress_pct, remarks, jsonb responses).
 * Routes only: HTTP verb + path -> middleware (authenticate, authorize(roles),
 * validate(schema)) -> controller method. No logic here.
 */
'use strict';
const router = require('express').Router();
const authenticate = require('../../../middleware/authenticate');
const authorize = require('../../../middleware/authorize');
const validate = require('../../../middleware/validate');
const controller = require('../../../controllers/visitForms.controller');
const schema = require('../../../validators/visitForm.schema');

router.use(authenticate, authorize());
router.get('/:id/form', validate(schema.idParam), controller.get);
router.put('/:id/form', validate(schema.idParam), validate(schema.save), controller.saveDraft);
router.post('/:id/form/submit', validate(schema.idParam), validate(schema.save), controller.submit);
module.exports = router;
