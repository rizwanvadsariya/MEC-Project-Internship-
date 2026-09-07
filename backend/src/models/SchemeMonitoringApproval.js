const mongoose = require("mongoose");
const { monitoringApprovalStatuses } = require("./common");

// Internal M&E monitoring-approval lifecycle: Regional Director submits a
// scheme for monitoring, Director General approves or rejects. Every
// submit/reject/resubmit cycle is one document -- a full audit trail.
// The scheme's *current* monitoring state is always derived as the status of
// the most recent document here for that scheme (by submittedAt desc); it is
// never duplicated as a field on the scheme.
const schemeMonitoringApprovalSchema = new mongoose.Schema(
	{
		schemeId: { type: mongoose.Schema.Types.ObjectId, ref: "Scheme", required: true },
		submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // Regional Director
		submittedAt: { type: Date, required: true, default: Date.now },
		decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Director General; null while pending
		decidedAt: Date,
		status: {
			type: String,
			required: true,
			enum: monitoringApprovalStatuses,
			default: "pending",
		},
		rejectionReason: {
			type: String,
			trim: true,
			required: function required() {
				return this.status === "rejected";
			},
		},
		// Points to the prior rejected cycle this submission revises.
		revisionOf: { type: mongoose.Schema.Types.ObjectId, ref: "SchemeMonitoringApproval" },
		// Optional snapshot of the scheme's editable fields at submission time.
		snapshotAtSubmission: mongoose.Schema.Types.Mixed,
	},
	{ timestamps: true, collection: "schemeMonitoringApprovals" },
);

schemeMonitoringApprovalSchema.index({ schemeId: 1, submittedAt: -1 });
schemeMonitoringApprovalSchema.index({ status: 1 });

module.exports =
	mongoose.models.SchemeMonitoringApproval ||
	mongoose.model("SchemeMonitoringApproval", schemeMonitoringApprovalSchema);
