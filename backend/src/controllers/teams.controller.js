/**
 * Team assembly controller.
 * Parse/shape the request, call the matching service, format the response via
 * lib/ApiResponse. No SQL, no business rules — those live in services/.
 */
'use strict';

const teamService = require('../services/team.service');
const asyncHandler = require('../lib/asyncHandler');
const ApiResponse = require('../lib/ApiResponse');

const eligibleMembers = asyncHandler(async (req, res) => ApiResponse.ok(res, await teamService.eligibleMembers(req.authUser)));
const createDraft = asyncHandler(async (req, res) => ApiResponse.created(res, await teamService.createDraft(req.authUser, req.body)));
const submit = asyncHandler(async (req, res) => ApiResponse.ok(res, await teamService.submit(req.authUser, req.params.id)));
const resubmit = asyncHandler(async (req, res) => ApiResponse.ok(res, await teamService.resubmit(req.authUser, req.params.id)));

module.exports = { eligibleMembers, createDraft, submit, resubmit };
