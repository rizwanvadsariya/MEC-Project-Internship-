const { AdpFinancialRecord } = require("../models");
const { ok, created, fail } = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");
const audit = require("../services/auditService");

// POST /schemes/:schemeId/financial-records
// Time series: one document per scheme per adpFiscalYear, never overwritten.
const create = asyncHandler(async (req, res) => {
	const b = req.validated;
	const dup = await AdpFinancialRecord.findOne({
		schemeId: req.scheme._id,
		adpFiscalYear: b.adpFiscalYear,
	});
	if (dup) {
		return fail(res, `A financial record for ${b.adpFiscalYear} already exists for this scheme`, 409);
	}
	const record = await AdpFinancialRecord.create({ ...b, schemeId: req.scheme._id });
	await audit.record({
		userId: req.user._id,
		action: "adp_financial_record_added",
		entityType: "AdpFinancialRecord",
		entityId: record._id,
		changes: { adpFiscalYear: b.adpFiscalYear },
		ipAddress: req.ip,
	});
	return created(res, record);
});

const listForScheme = asyncHandler(async (req, res) => {
	const rows = await AdpFinancialRecord.find({ schemeId: req.scheme._id }).sort({ adpFiscalYear: 1 });
	return ok(res, rows);
});

module.exports = { create, listForScheme };
