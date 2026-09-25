/**
 * In-app notification list, mark-read, device push-token registration (Phase 2).
 * Routes only: HTTP verb + path -> middleware (authenticate, authorize(roles),
 * validate(schema)) -> controller method. No logic here.
 */
'use strict';
const router = require('express').Router();
const authenticate = require('../../../middleware/authenticate');
const authorize = require('../../../middleware/authorize');
const validate = require('../../../middleware/validate');
const controller = require('../../../controllers/notifications.controller');
const schema = require('../../../validators/notification.schema');

router.use(authenticate, authorize());
router.get('/', validate(schema.query), controller.list);
router.patch('/:id/read', validate(schema.idParam), controller.markRead);
router.post('/push-tokens', validate(schema.registerPushToken), controller.registerPushToken);
router.delete('/push-tokens', validate(schema.removePushToken), controller.removePushToken);

module.exports = router;
