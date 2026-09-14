/**
 * DG approval controller.
 * Parse/shape the request, call the matching service, format the response via
 * lib/ApiResponse. No SQL, no business rules — those live in services/.
 */
'use strict';

const approvalService = require('../services/approval.service');
const asyncHandler = require('../lib/asyncHandler');
const ApiResponse = require('../lib/ApiResponse');

const listPending = asyncHandler(async (req, res) => ApiResponse.ok(res, await approvalService.listPending(req.authUser)));
const decide = asyncHandler(async (req, res) => ApiResponse.ok(res, await approvalService.decide(req.authUser, req.params.teamId, req.body)));

module.exports = { listPending, decide };
