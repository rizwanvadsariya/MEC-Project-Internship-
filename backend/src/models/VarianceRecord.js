const mongoose = require("mongoose");

const varianceRecordSchema = new mongoose.Schema(
  {
    schemeId: { type: mongoose.Schema.Types.ObjectId, ref: "Scheme", required: true },
    calculatedAt: { type: Date, default: Date.now, required: true },
    financialExpenditurePercent: { type: Number, required: true },
    physicalProgressPercent: { type: Number, required: true },
    varianceIndex: { type: Number, required: true },
    classification: { type: String, enum: ["normal", "yellow", "red"], required: true },
    triggeredAlert: { type: Boolean, default: false },
  },
  { timestamps: true, collection: "varianceRecords" },
);

varianceRecordSchema.index({ schemeId: 1, calculatedAt: -1 });
varianceRecordSchema.index({ classification: 1 });

module.exports = mongoose.models.VarianceRecord || mongoose.model("VarianceRecord", varianceRecordSchema);
