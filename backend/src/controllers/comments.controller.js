/**
 * Comment controller.
 * Parse/shape the request, call the matching service, format the response via
 * lib/ApiResponse. No SQL, no business rules — those live in services/.
 */
'use strict';

const commentService = require('../services/comment.service');
const asyncHandler = require('../lib/asyncHandler');
const ApiResponse = require('../lib/ApiResponse');

const list = asyncHandler(async (req, res) => {
	const result = await commentService.list(req.authUser, req.query);
	ApiResponse.ok(res, result.rows, { nextCursor: result.nextCursor });
});

const create = asyncHandler(async (req, res) => {
	ApiResponse.created(res, await commentService.create(req.authUser, req.body));
});

const update = asyncHandler(async (req, res) => {
	ApiResponse.ok(res, await commentService.update(req.authUser, req.params.id, req.body.body));
});

const remove = asyncHandler(async (req, res) => {
	await commentService.remove(req.authUser, req.params.id);
	ApiResponse.noContent(res);
});

module.exports = { list, create, update, remove };
