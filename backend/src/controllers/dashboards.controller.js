/**
 * Dashboard / analytics controller.
 * Parse/shape the request, call the matching service, format the response via
 * lib/ApiResponse. No SQL, no business rules — those live in services/.
 */
'use strict';

const dashboardService = require('../services/dashboard.service');
const asyncHandler = require('../lib/asyncHandler');
const ApiResponse = require('../lib/ApiResponse');

const getDivisionSummary = asyncHandler(async (req, res) => {
	ApiResponse.ok(res, await dashboardService.getDivisionSummary(req.authUser));
});

const getMemberSummary = asyncHandler(async (req, res) => {
	ApiResponse.ok(res, await dashboardService.getMemberSummary(req.authUser));
});

module.exports = { getDivisionSummary, getMemberSummary };
