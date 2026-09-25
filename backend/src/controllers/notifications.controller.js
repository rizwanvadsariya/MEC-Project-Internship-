/**
 * Notification controller.
 * Parse/shape the request, call the matching service, format the response via
 * lib/ApiResponse. No SQL, no business rules — those live in services/.
 */
'use strict';

const notificationService = require('../services/notification.service');
const asyncHandler = require('../lib/asyncHandler');
const ApiResponse = require('../lib/ApiResponse');

const list = asyncHandler(async (req, res) => {
	const result = await notificationService.list(req.authUser, req.query);
	ApiResponse.ok(res, result.rows, { nextCursor: result.nextCursor });
});

const markRead = asyncHandler(async (req, res) => {
	ApiResponse.ok(res, await notificationService.markRead(req.authUser, req.params.id));
});

const registerPushToken = asyncHandler(async (req, res) => {
	ApiResponse.created(res, await notificationService.registerPushToken(req.authUser, req.body.token, req.body.platform));
});

const removePushToken = asyncHandler(async (req, res) => {
	await notificationService.removePushToken(req.authUser, req.body.token);
	ApiResponse.noContent(res);
});

module.exports = { list, markRead, registerPushToken, removePushToken };
