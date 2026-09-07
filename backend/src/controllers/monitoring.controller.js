const { ok, created } = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");
const approvalService = require("../services/approvalService");

// POST /schemes/:schemeId/monitoring/submit  (regional_director)
const submit = asyncHandler(async (req, res) => {
	const snapshot = (req.validated && req.validated.snapshot) || req.scheme.toObject();
	const approval = await approvalService.submitForMonitoring({
		scheme: req.scheme,
		actor: req.user,
		snapshot,
		ipAddress: req.ip,
	});
	return created(res, approval);
});

// POST /schemes/:schemeId/monitoring/decision  (director_general)
const decide = asyncHandler(async (req, res) => {
	const { approve, rejectionReason } = req.validated;
	const approval = await approvalService.decide({
		scheme: req.scheme,
		actor: req.user,
		approve,
		rejectionReason,
		ipAddress: req.ip,
	});
	return ok(res, approval);
});

// GET /schemes/:schemeId/monitoring/history
const history = asyncHandler(async (req, res) => {
	const rows = await approvalService.history(req.scheme._id);
	const state = await approvalService.getMonitoringState(req.scheme._id);
	return ok(res, { monitoringState: state, history: rows });
});

// GET /monitoring/pending  (director_general) - review queue
const pendingQueue = asyncHandler(async (req, res) => {
	const { SchemeMonitoringApproval } = require("../models");
	const rows = await SchemeMonitoringApproval.find({ status: "pending" })
		.sort({ submittedAt: 1 })
		.populate("schemeId", "uid name departmentId")
		.populate("submittedBy", "name region");
	return ok(res, rows);
});

module.exports = { submit, decide, history, pendingQueue };
