/**
 * Photo upload/download controller.
 * Parse/shape the request, call the matching service, format the response via
 * lib/ApiResponse. No SQL, no business rules — those live in services/.
 */
'use strict';
const photoService = require('../services/photo.service');
const asyncHandler = require('../lib/asyncHandler');
const ApiResponse = require('../lib/ApiResponse');

const upload = asyncHandler(async (req, res) => {
	const metadata = {
		caption: req.body.caption,
		geoLat: req.body.geoLat ? Number(req.body.geoLat) : null,
		geoLng: req.body.geoLng ? Number(req.body.geoLng) : null,
		takenAt: req.body.takenAt || null,
	};
	ApiResponse.created(res, await photoService.upload(req.authUser, req.params.id, req.file, metadata));
});

const list = asyncHandler(async (req, res) => ApiResponse.ok(res, await photoService.list(req.authUser, req.params.id)));
const remove = asyncHandler(async (req, res) => {
	await photoService.remove(req.authUser, req.params.id, req.params.photoId);
	ApiResponse.noContent(res);
});

module.exports = { upload, list, remove };
