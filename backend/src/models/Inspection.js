const mongoose = require("mongoose");
const { pointSchema } = require("./common");

const milestoneUpdateSchema = new mongoose.Schema({
	milestoneId: { type: mongoose.Schema.Types.ObjectId, required: true },
	milestoneName: String,
	weightPercent: Number,
	completionPercent: { type: Number, required: true, min: 0, max: 100 },
	remarks: String,
}, { _id: false });

// An MEO progress report, conducted as a member of a scheme's active team.
const inspectionSchema = new mongoose.Schema(
	{
		schemeId: { type: mongoose.Schema.Types.ObjectId, ref: "Scheme", required: true },
		teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true },
		meoId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
		inspectionDate: { type: Date, required: true },
		gpsAtInspection: { type: pointSchema, required: true },
		distanceFromSchemeMeters: { type: Number, required: true, min: 0 },
		geofencePassed: { type: Boolean, required: true },
		mockLocationSuspected: { type: Boolean, default: false },
		milestoneUpdates: [milestoneUpdateSchema],
		overallPhysicalProgressPercent: { type: Number, required: true, min: 0, max: 100 },
		observations: String,
		recommendations: String,
		resultingHealthClassification: { type: String, enum: ["satisfactory", "delayed", "halted_abandoned"] },
		submittedAt: { type: Date, required: true },
		syncedFromOffline: { type: Boolean, default: false },
		offlineCapturedAt: Date,
	},
	{ timestamps: true, collection: "inspections" },
);

inspectionSchema.index({ schemeId: 1, inspectionDate: -1 });
inspectionSchema.index({ meoId: 1 });
inspectionSchema.index({ teamId: 1 });
inspectionSchema.index({ gpsAtInspection: "2dsphere" });

module.exports = mongoose.models.Inspection || mongoose.model("Inspection", inspectionSchema);
