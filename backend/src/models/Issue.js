const mongoose = require("mongoose");

const issueSchema = new mongoose.Schema(
  {
    schemeId: { type: mongoose.Schema.Types.ObjectId, ref: "Scheme", required: true },
    inspectionId: { type: mongoose.Schema.Types.ObjectId, ref: "Inspection" },
    raisedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    category: { type: String, enum: ["contractor_delay", "funding_delay", "land_legal", "material_shortage", "quality_concern", "other"], required: true },
    description: { type: String, required: true },
    severity: { type: String, enum: ["low", "medium", "high", "critical"], default: "medium" },
    status: { type: String, enum: ["open", "under_review", "resolved", "escalated"], default: "open" },
    resolutionNotes: String,
    resolvedAt: Date,
  },
  { timestamps: true, collection: "issues" },
);

issueSchema.index({ schemeId: 1, status: 1 });
issueSchema.index({ severity: 1 });

module.exports = mongoose.models.Issue || mongoose.model("Issue", issueSchema);
