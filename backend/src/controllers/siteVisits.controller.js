/**
 * Site visit controller.
 * Parse/shape the request, call the matching service, format the response via
 * lib/ApiResponse. No SQL, no business rules — those live in services/.
 */
'use strict';

const siteVisitService = require('../services/siteVisit.service');
const asyncHandler = require('../lib/asyncHandler');
const ApiResponse = require('../lib/ApiResponse');

const list = asyncHandler(async (req, res) => {
	const result = await siteVisitService.list(req.authUser, req.query);
	ApiResponse.ok(res, result.rows, { nextCursor: result.nextCursor });
});

const getById = asyncHandler(async (req, res) => {
	ApiResponse.ok(res, await siteVisitService.getById(req.authUser, req.params.id));
});

module.exports = { list, getById };
