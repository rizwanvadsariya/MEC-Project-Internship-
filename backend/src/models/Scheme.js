const mongoose = require("mongoose");
const { pointSchema, varianceClassifications } = require("./common");

// Embedded, weighted milestone list defined by the M&E team once a scheme is
// approved for monitoring. Not part of the ADP book.
const milestoneSchema = new mongoose.Schema(
	{
		name: { type: String, required: true, trim: true },
		weightPercent: { type: Number, required: true, min: 0, max: 100 },
		targetDate: Date,
		currentCompletionPercent: { type: Number, default: 0, min: 0, max: 100 },
		lastUpdatedByInspectionId: { type: mongoose.Schema.Types.ObjectId, ref: "Inspection" },
		remarks: String,
	},
	{ _id: true },
);

// Government PC-I / ADP approval, read from the ADP book. Distinct from the
// internal M&E monitoring approval lifecycle (see SchemeMonitoringApproval).
const adpApprovalSchema = new mongoose.Schema(
	{
		status: { type: String, required: true, enum: ["approved", "unapproved"] },
		approvalDate: Date,
		underRevision: { type: Boolean, default: false },
	},
	{ _id: false },
);

const schemeSchema = new mongoose.Schema(
	{
		// Human-facing unique identifier from the ADP book, e.g. "AGRWM-PP-22-0012".
		// Format: sub-sector-code - PP - YY - sequence.
		uid: { type: String, required: true, unique: true, trim: true },
		genSerialNo: Number,
		name: { type: String, required: true, trim: true },
		departmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Department", required: true },
		subSectorId: { type: mongoose.Schema.Types.ObjectId, ref: "SubSector", required: true },
		districtIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "District" }],
		provinceWide: { type: Boolean, default: false },
		adpApproval: { type: adpApprovalSchema, required: true },
		schemeCategory: {
			type: String,
			required: true,
			enum: ["on_going", "unapproved_carried_forward"],
		},
		targetCompletionDate: Date,
		estimatedCost: { type: Number, required: true, min: 0 }, // Rs. million
		qrCodeUrl: String,
		sourceEdition: {
			adpVolume: String,
			fiscalYear: String,
			pageFrom: Number,
			pageTo: Number,
		},
		// Optional precise GIS pin. Not in the ADP source (district-level only);
		// captured separately by the M&E team when geofencing is required.
		location: { type: pointSchema },
		// M&E side (not from the ADP book). Cached, weighted; recalculated on
		// each MEO inspection.
		physicalProgressPercent: { type: Number, default: 0, min: 0, max: 100 },
		varianceIndex: Number,
		varianceClassification: { type: String, enum: varianceClassifications },
		milestones: [milestoneSchema],
		contractorId: { type: mongoose.Schema.Types.ObjectId, ref: "Contractor" },
		createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
	},
	{ timestamps: true, collection: "schemes" },
);

schemeSchema.index({ departmentId: 1, subSectorId: 1 });
schemeSchema.index({ districtIds: 1 });
schemeSchema.index({ "adpApproval.status": 1 });
schemeSchema.index({ varianceClassification: 1 });
schemeSchema.index({ location: "2dsphere" }, { sparse: true });

module.exports = mongoose.models.Scheme || mongoose.model("Scheme", schemeSchema);
