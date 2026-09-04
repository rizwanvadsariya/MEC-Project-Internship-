const mongoose = require("mongoose");

const inspectionAssignmentSchema = new mongoose.Schema(
  {
    schemeId: { type: mongoose.Schema.Types.ObjectId, ref: "Scheme", required: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    deadline: { type: Date, required: true },
    status: { type: String, enum: ["assigned", "en_route", "inspected", "report_submitted", "reviewed"], default: "assigned" },
    priority: { type: String, enum: ["normal", "high", "urgent"], default: "normal" },
    notes: String,
  },
  { timestamps: true, collection: "inspectionAssignments" },
);

inspectionAssignmentSchema.index({ schemeId: 1 });
inspectionAssignmentSchema.index({ assignedTo: 1, status: 1 });
inspectionAssignmentSchema.index({ deadline: 1 });

module.exports = mongoose.models.InspectionAssignment || mongoose.model("InspectionAssignment", inspectionAssignmentSchema);
