const { VarianceRecord } = require("../models");
const { ok } = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");
const varianceEngine = require("../services/varianceEngine");

const listForScheme = asyncHandler(async (req, res) => {
	const rows = await VarianceRecord.find({ schemeId: req.scheme._id }).sort({ calculatedAt: -1 });
	return ok(res, rows);
});

// Manual recompute (also used by the nightly job).
const recompute = asyncHandler(async (req, res) => {
	const record = await varianceEngine.computeVarianceForScheme(req.scheme._id, { actorId: req.user._id });
	return ok(res, record);
});

module.exports = { listForScheme, recompute };
