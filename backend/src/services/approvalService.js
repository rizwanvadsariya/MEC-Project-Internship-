const { SchemeMonitoringApproval, Scheme } = require("../models");
const ApiError = require("../utils/ApiError");
const audit = require("./auditService");
const notify = require("./notificationService");

// --- Derived monitoring state -------------------------------------------------
// A scheme's current monitoring state is ALWAYS the status of its most recent
// SchemeMonitoringApproval (by submittedAt desc). It is never stored on the
// scheme. "draft" == no submission exists yet.

async function getLatestApproval(schemeId) {
	return SchemeMonitoringApproval.findOne({ schemeId }).sort({ submittedAt: -1, createdAt: -1 });
}

async function getMonitoringState(schemeId) {
	const latest = await getLatestApproval(schemeId);
	return latest ? latest.status : "draft";
}

async function isSchemeEditable(schemeId) {
	const state = await getMonitoringState(schemeId);
	return state === "draft" || state === "rejected";
}

// --- State transitions ------------------------------------------------------

// Regional Director submits a scheme for monitoring approval.
async function submitForMonitoring({ scheme, actor, snapshot, ipAddress }) {
	const latest = await getLatestApproval(scheme._id);
	if (latest && latest.status === "pending") {
		throw new ApiError(409, "Scheme is already pending Director General review");
	}
	if (latest && latest.status === "approved") {
		throw new ApiError(409, "Scheme is already approved for monitoring");
	}

	const approval = await SchemeMonitoringApproval.create({
		schemeId: scheme._id,
		submittedBy: actor._id,
		submittedAt: new Date(),
		status: "pending",
		revisionOf: latest ? latest._id : undefined,
		snapshotAtSubmission: snapshot,
	});

	await audit.record({
		userId: actor._id,
		action: "scheme_submitted_for_monitoring",
		entityType: "SchemeMonitoringApproval",
		entityId: approval._id,
		changes: { schemeId: scheme._id, revisionOf: approval.revisionOf },
		ipAddress,
	});
	await notify.schemeSubmittedForMonitoring({ scheme });
	return approval;
}

// Director General decides on the pending submission.
async function decide({ scheme, actor, approve, rejectionReason, ipAddress }) {
	const latest = await getLatestApproval(scheme._id);
	if (!latest || latest.status !== "pending") {
		throw new ApiError(409, "There is no pending submission to decide on");
	}
	if (!approve) {
		const reason = (rejectionReason || "").trim();
		if (!reason) throw new ApiError(400, "A non-empty rejectionReason is required to reject");
		latest.status = "rejected";
		latest.rejectionReason = reason;
	} else {
		latest.status = "approved";
	}
	latest.decidedBy = actor._id;
	latest.decidedAt = new Date();
	await latest.save();

	await audit.record({
		userId: actor._id,
		action: approve ? "monitoring_approved" : "monitoring_rejected",
		entityType: "SchemeMonitoringApproval",
		entityId: latest._id,
		changes: { status: latest.status, rejectionReason: latest.rejectionReason },
		ipAddress,
	});
	await notify.monitoringDecision({ scheme, approval: latest });
	return latest;
}

// Full ordered approval history for a scheme (oldest first).
async function history(schemeId) {
	return SchemeMonitoringApproval.find({ schemeId })
		.sort({ submittedAt: 1, createdAt: 1 })
		.populate("submittedBy", "name role")
		.populate("decidedBy", "name role");
}

module.exports = {
	getLatestApproval,
	getMonitoringState,
	isSchemeEditable,
	submitForMonitoring,
	decide,
	history,
};
