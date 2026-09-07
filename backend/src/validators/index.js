// Tiny hand-rolled validators. Each takes the Express req and returns
// { value } on success or { error } on failure.

function requireFields(obj, fields) {
	const missing = fields.filter((f) => obj[f] === undefined || obj[f] === null || obj[f] === "");
	return missing.length ? `Missing required field(s): ${missing.join(", ")}` : null;
}

const createScheme = (req) => {
	const b = req.body;
	const err = requireFields(b, ["uid", "name", "departmentId", "subSectorId", "estimatedCost", "schemeCategory", "adpApproval"]);
	if (err) return { error: err };
	if (!/^[A-Z0-9]+-PP-\d{2}-\d{3,}$/i.test(b.uid)) {
		return { error: 'uid must match the ADP format, e.g. "AGRWM-PP-22-0012"' };
	}
	return { value: b };
};

const submitForMonitoring = (req) => ({ value: { snapshot: req.body && req.body.snapshot } });

const decideMonitoring = (req) => {
	const { decision, rejectionReason } = req.body || {};
	if (!["approve", "reject"].includes(decision)) {
		return { error: 'decision must be "approve" or "reject"' };
	}
	if (decision === "reject" && !(rejectionReason || "").trim()) {
		return { error: "rejectionReason is required and must be non-empty when rejecting" };
	}
	return { value: { approve: decision === "approve", rejectionReason } };
};

const assembleTeam = (req) => {
	const { members } = req.body || {};
	if (!Array.isArray(members) || members.length === 0) {
		return { error: "members must be a non-empty array of { userId, roleInTeam }" };
	}
	for (const m of members) {
		if (!m.userId) return { error: "each member needs a userId" };
		if (m.roleInTeam && !["meo", "regional_director"].includes(m.roleInTeam)) {
			return { error: 'roleInTeam must be "meo" or "regional_director"' };
		}
	}
	return { value: { members } };
};

const createInspection = (req) => {
	const b = req.body || {};
	const err = requireFields(b, ["inspectionDate", "gpsAtInspection", "milestoneUpdates"]);
	if (err) return { error: err };
	if (!Array.isArray(b.milestoneUpdates)) return { error: "milestoneUpdates must be an array" };
	const coords = b.gpsAtInspection && b.gpsAtInspection.coordinates;
	if (!Array.isArray(coords) || coords.length !== 2) {
		return { error: "gpsAtInspection.coordinates must be [lng, lat]" };
	}
	return { value: b };
};

const createFinancialRecord = (req) => {
	const b = req.body || {};
	const err = requireFields(b, [
		"adpFiscalYear",
		"estimatedCost",
		"priorActualExpenditure",
		"revisedAllocation",
		"revisedAllocationFiscalYear",
		"estimatedExpenditureThroughAllocationYear",
		"throwForward",
		"nextYearAllocation",
		"nextYearAllocationFiscalYear",
	]);
	if (err) return { error: err };
	return { value: b };
};

module.exports = {
	createScheme,
	submitForMonitoring,
	decideMonitoring,
	assembleTeam,
	createInspection,
	createFinancialRecord,
};
