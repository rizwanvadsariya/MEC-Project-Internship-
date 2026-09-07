const { Scheme, AdpFinancialRecord, VarianceRecord, Settings } = require("../models");
const notify = require("./notificationService");
const audit = require("./auditService");

// Weighted physical progress from a scheme's embedded milestones.
function computeWeightedPhysicalProgress(milestones = []) {
	if (!milestones.length) return 0;
	const totalWeight = milestones.reduce((s, m) => s + (m.weightPercent || 0), 0);
	if (totalWeight <= 0) return 0;
	const weighted = milestones.reduce(
		(s, m) => s + (m.weightPercent || 0) * (m.currentCompletionPercent || 0),
		0,
	);
	return Math.round((weighted / totalWeight) * 100) / 100;
}

// Financial expenditure % from an ADP financial record:
// estimatedExpenditureThroughAllocationYear / estimatedCost * 100.
function computeFinancialExpenditurePercent(record) {
	if (!record || !record.estimatedCost) return 0;
	return (
		Math.round(
			(record.estimatedExpenditureThroughAllocationYear / record.estimatedCost) * 100 * 100,
		) / 100
	);
}

function classify(varianceIndex, settings) {
	const abs = Math.abs(varianceIndex);
	if (abs <= settings.varianceYellowThreshold) return "normal";
	if (abs <= settings.varianceRedThreshold) return "yellow";
	return "red";
}

async function latestFinancialRecord(schemeId) {
	return AdpFinancialRecord.find({ schemeId }).sort({ adpFiscalYear: -1, createdAt: -1 }).limit(1).then((r) => r[0]);
}

// Recompute a scheme's cached physical progress from its milestones and persist.
async function recomputePhysicalProgress(schemeId) {
	const scheme = await Scheme.findById(schemeId);
	if (!scheme) return null;
	scheme.physicalProgressPercent = computeWeightedPhysicalProgress(scheme.milestones);
	await scheme.save();
	return scheme;
}

// Compute and persist a fresh variance record for a scheme. Returns null when
// there is no financial record to compare against.
async function computeVarianceForScheme(schemeId, { actorId } = {}) {
	const settings = await Settings.getGlobal();
	const scheme = await Scheme.findById(schemeId);
	if (!scheme) return null;
	const finRecord = await latestFinancialRecord(schemeId);
	if (!finRecord) return null;

	const financialExpenditurePercent = computeFinancialExpenditurePercent(finRecord);
	const physicalProgressPercent =
		scheme.physicalProgressPercent ?? computeWeightedPhysicalProgress(scheme.milestones);
	const varianceIndex =
		Math.round((financialExpenditurePercent - physicalProgressPercent) * 100) / 100;
	const classification = classify(varianceIndex, settings);
	const triggeredAlert = classification === "red";

	const record = await VarianceRecord.create({
		schemeId,
		calculatedAt: new Date(),
		sourceAdpFinancialRecordId: finRecord._id,
		financialExpenditurePercent,
		physicalProgressPercent,
		varianceIndex,
		classification,
		triggeredAlert,
	});

	scheme.varianceIndex = varianceIndex;
	scheme.varianceClassification = classification;
	await scheme.save();

	await audit.record({
		userId: actorId,
		action: "variance_computed",
		entityType: "VarianceRecord",
		entityId: record._id,
		changes: { varianceIndex, classification },
	});
	if (triggeredAlert) {
		await notify.redFlagVariance({ scheme, varianceRecord: record });
	}
	return record;
}

module.exports = {
	computeWeightedPhysicalProgress,
	computeFinancialExpenditurePercent,
	classify,
	recomputePhysicalProgress,
	computeVarianceForScheme,
	latestFinancialRecord,
};
