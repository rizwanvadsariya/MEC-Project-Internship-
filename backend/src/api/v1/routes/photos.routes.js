/**
 * Visit + issue photos: issue signed upload URLs, register uploaded objects, list signed download URLs.
 * Routes only: HTTP verb + path -> middleware (authenticate, authorize(roles),
 * validate(schema)) -> controller method. No logic here.
 */
'use strict';
const router = require('express').Router();
const multer = require('multer');
const authenticate = require('../../../middleware/authenticate');
const authorize = require('../../../middleware/authorize');
const validate = require('../../../middleware/validate');
const controller = require('../../../controllers/photos.controller');
const schema = require('../../../validators/photo.schema');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
router.use(authenticate, authorize());
router.get('/:id/photos', validate(schema.idParam), controller.list);
router.post('/:id/photos', validate(schema.idParam), upload.single('photo'), controller.upload);
router.delete('/:id/photos/:photoId', validate(schema.photoParam), controller.remove);
module.exports = router;
