/**
 * Issue report controller.
 * Parse/shape the request, call the matching service, format the response via
 * lib/ApiResponse. No SQL, no business rules — those live in services/.
 */
'use strict';
const issueService = require('../services/issue.service');
const asyncHandler = require('../lib/asyncHandler');
const ApiResponse = require('../lib/ApiResponse');

const file = asyncHandler(async (req, res) => ApiResponse.created(res, await issueService.file(req.authUser, req.params.id, req.body)));
const list = asyncHandler(async (req, res) => ApiResponse.ok(res, await issueService.list(req.authUser, req.params.id)));
const remove = asyncHandler(async (req, res) => {
	await issueService.remove(req.authUser, req.params.id, req.params.issueId);
	ApiResponse.noContent(res);
});

module.exports = { file, list, remove };
