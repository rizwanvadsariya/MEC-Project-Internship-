const mongoose = require("mongoose");
const { varianceClassifications } = require("./common");

// Compares the ADP book's financial position for a scheme against verified
// physical progress. Financial % is read from the scheme's latest
// AdpFinancialRecord, not recomputed here.
const varianceRecordSchema = new mongoose.Schema(
  {
    schemeId: { type: mongoose.Schema.Types.ObjectId, ref: "Scheme", required: true },
    calculatedAt: { type: Date, default: Date.now, required: true },
    sourceAdpFinancialRecordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AdpFinancialRecord",
      required: true,
    },
    financialExpenditurePercent: { type: Number, required: true },
    physicalProgressPercent: { type: Number, required: true },
    varianceIndex: { type: Number, required: true },
    classification: { type: String, enum: varianceClassifications, required: true },
    triggeredAlert: { type: Boolean, default: false },
  },
  { timestamps: true, collection: "varianceRecords" },
);

varianceRecordSchema.index({ schemeId: 1, calculatedAt: -1 });
varianceRecordSchema.index({ classification: 1 });

module.exports = mongoose.models.VarianceRecord || mongoose.model("VarianceRecord", varianceRecordSchema);
