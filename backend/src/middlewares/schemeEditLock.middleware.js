const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const approvalService = require("../services/approvalService");

// Blocks edits to a scheme unless its DERIVED monitoring state is "draft" or
// "rejected". The state is always computed from the latest
// SchemeMonitoringApproval, never read from a field on the scheme.
// Requires req.scheme (loadScheme.middleware) to have run first.
module.exports = asyncHandler(async (req, res, next) => {
	const state = await approvalService.getMonitoringState(req.scheme._id);
	if (state !== "draft" && state !== "rejected") {
		throw new ApiError(
			409,
			`Scheme is locked for editing while monitoring state is "${state}"`,
		);
	}
	req.monitoringState = state;
	next();
});
