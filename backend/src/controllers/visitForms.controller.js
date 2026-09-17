/**
 * Visit form controller.
 * Parse/shape the request, call the matching service, format the response via
 * lib/ApiResponse. No SQL, no business rules — those live in services/.
 */
'use strict';

const visitFormService = require('../services/visitForm.service');
const asyncHandler = require('../lib/asyncHandler');
const ApiResponse = require('../lib/ApiResponse');

const get = asyncHandler(async (req, res) => ApiResponse.ok(res, await visitFormService.get(req.authUser, req.params.id)));
const saveDraft = asyncHandler(async (req, res) => ApiResponse.ok(res, await visitFormService.save(req.authUser, req.params.id, req.body, 'DRAFT')));
const submit = asyncHandler(async (req, res) => ApiResponse.ok(res, await visitFormService.save(req.authUser, req.params.id, req.body, 'SUBMITTED')));

module.exports = { get, saveDraft, submit };
