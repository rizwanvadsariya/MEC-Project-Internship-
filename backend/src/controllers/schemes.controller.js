/**
 * Scheme browser controller (read-only).
 * Parse/shape the request, call the matching service, format the response via
 * lib/ApiResponse. No SQL, no business rules — those live in services/.
 */
'use strict';

const schemeService = require('../services/scheme.service');
const asyncHandler = require('../lib/asyncHandler');
const ApiResponse = require('../lib/ApiResponse');

const list = asyncHandler(async (req, res) => {
	const result = await schemeService.list(req.query);
	ApiResponse.ok(res, result.rows, { nextCursor: result.nextCursor });
});

const getById = asyncHandler(async (req, res) => {
	ApiResponse.ok(res, await schemeService.getById(req.authUser, req.params.id));
});

const filterOptions = asyncHandler(async (_req, res) => {
	ApiResponse.ok(res, await schemeService.getFilterOptions());
});

module.exports = { list, getById, filterOptions };
