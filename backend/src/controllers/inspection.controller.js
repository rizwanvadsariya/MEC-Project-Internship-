const { Inspection, Scheme } = require("../models");
const { ok, created } = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");
const geofence = require("../services/geofenceService");
const varianceEngine = require("../services/varianceEngine");
const notify = require("../services/notificationService");
const audit = require("../services/auditService");

// POST /schemes/:schemeId/inspections
// Route chain: authenticate -> requireRole("meo") -> loadScheme -> teamEligibility -> validate
const create = asyncHandler(async (req, res) => {
	const scheme = await Scheme.findById(req.scheme._id);
	const body = req.validated;
	const coords = body.gpsAtInspection.coordinates;

	const geo = await geofence.evaluate({ scheme, gpsCoordinates: coords });

	// Apply milestone updates onto the scheme's embedded milestones.
	const updates = body.milestoneUpdates || [];
	for (const u of updates) {
		const m = scheme.milestones.id(u.milestoneId);
		if (m) {
			m.currentCompletionPercent = u.completionPercent;
			if (u.remarks) m.remarks = u.remarks;
		}
	}
	const overall = varianceEngine.computeWeightedPhysicalProgress(scheme.milestones);

	const inspection = await Inspection.create({
		schemeId: scheme._id,
		teamId: req.activeTeam._id,
		meoId: req.user._id,
		inspectionDate: body.inspectionDate,
		gpsAtInspection: { type: "Point", coordinates: coords },
		distanceFromSchemeMeters: geo.distanceFromSchemeMeters,
		geofencePassed: geo.geofencePassed,
		mockLocationSuspected: !!body.mockLocationSuspected,
		milestoneUpdates: updates.map((u) => {
			const m = scheme.milestones.id(u.milestoneId);
			return {
				milestoneId: u.milestoneId,
				milestoneName: m && m.name,
				weightPercent: m && m.weightPercent,
				completionPercent: u.completionPercent,
				remarks: u.remarks,
			};
		}),
		overallPhysicalProgressPercent: overall,
		observations: body.observations,
		recommendations: body.recommendations,
		resultingHealthClassification: body.resultingHealthClassification,
		submittedAt: new Date(),
		syncedFromOffline: !!body.syncedFromOffline,
		offlineCapturedAt: body.offlineCapturedAt,
	});

	scheme.milestones.forEach((m) => {
		if (updates.some((u) => String(u.milestoneId) === String(m._id))) {
			m.lastUpdatedByInspectionId = inspection._id;
		}
	});
	scheme.physicalProgressPercent = overall;
	await scheme.save();

	await audit.record({
		userId: req.user._id,
		action: "inspection_submitted",
		entityType: "Inspection",
		entityId: inspection._id,
		ipAddress: req.ip,
	});
	await notify.notifyRole({
		recipientRole: "regional_director",
		type: "report_submitted",
		schemeId: scheme._id,
		title: "Inspection report submitted",
		message: `An inspection was submitted for scheme ${scheme.uid} (physical progress ${overall}%).`,
	});

	// Recompute variance against the latest ADP financial record.
	const variance = await varianceEngine.computeVarianceForScheme(scheme._id, {
		actorId: req.user._id,
	});

	return created(res, { inspection, variance });
});

const listForScheme = asyncHandler(async (req, res) => {
	const rows = await Inspection.find({ schemeId: req.scheme._id }).sort({ inspectionDate: -1 });
	return ok(res, rows);
});

module.exports = { create, listForScheme };
