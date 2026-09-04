const mongoose = require("mongoose");
const { pointSchema } = require("./common");

const milestoneSchema = new mongoose.Schema({
	name: { type: String, required: true, trim: true },
	weightPercent: { type: Number, required: true, min: 0, max: 100 },
	targetDate: Date,
	currentCompletionPercent: { type: Number, default: 0, min: 0, max: 100 },
	lastUpdatedByInspectionId: { type: mongoose.Schema.Types.ObjectId, ref: "Inspection" },
	remarks: String,
});

const schemeSchema = new mongoose.Schema(
	{
		schemeId: { type: String, required: true, unique: true, trim: true },
		name: { type: String, required: true, trim: true },
		sectorId: { type: mongoose.Schema.Types.ObjectId, ref: "Sector", required: true },
		departmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Department", required: true },
		districtId: { type: mongoose.Schema.Types.ObjectId, ref: "District", required: true },
		divisionId: { type: mongoose.Schema.Types.ObjectId, ref: "Division", required: true },
		cityArea: String,
		executingAgency: String,
		contractorId: { type: mongoose.Schema.Types.ObjectId, ref: "Contractor" },
		supervisingEngineer: { name: String, designation: String, contact: String },
		approvedCost: { type: Number, required: true, min: 0 },
		startDate: Date,
		expectedCompletionDate: Date,
		currentStatus: { type: String, enum: ["planned", "ongoing", "completed", "delayed", "halted"], default: "planned" },
		projectHealth: { type: String, enum: ["satisfactory", "delayed", "halted_abandoned"], default: "satisfactory" },
		location: { type: pointSchema, required: true },
		boundary: { type: { type: String, enum: ["Polygon"] }, coordinates: [[[Number]]] },
		milestones: [milestoneSchema],
		physicalProgressPercent: { type: Number, default: 0, min: 0, max: 100 },
		financialProgressPercent: { type: Number, default: 0, min: 0, max: 100 },
		varianceIndex: Number,
		varianceClassification: { type: String, enum: ["normal", "yellow", "red"] },
		createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
	},
	{ timestamps: true, collection: "schemes" },
);

schemeSchema.index({ location: "2dsphere" });
schemeSchema.index({ boundary: "2dsphere" });
schemeSchema.index({ sectorId: 1, districtId: 1, divisionId: 1, currentStatus: 1 });
schemeSchema.index({ varianceClassification: 1 });

module.exports = mongoose.models.Scheme || mongoose.model("Scheme", schemeSchema);
