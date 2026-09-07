const mongoose = require("mongoose");

// The ADP book's financial columns (9-19) are a rolling fiscal-year time
// series. One document per scheme per ADP edition; never overwritten in place
// -- a new edition inserts a new document.
const adpFinancialRecordSchema = new mongoose.Schema(
	{
		schemeId: { type: mongoose.Schema.Types.ObjectId, ref: "Scheme", required: true },
		adpFiscalYear: { type: String, required: true, trim: true }, // e.g. "2026-2027"
		genSerialNoThisEdition: Number,
		estimatedCost: { type: Number, required: true, min: 0 }, // Rs. million
		priorActualExpenditure: { type: Number, required: true, min: 0 },
		priorActualExpenditureAsOf: Date,
		revisedAllocation: {
			total: { type: Number, required: true, min: 0 },
			fpa: { type: Number, default: 0, min: 0 },
		},
		revisedAllocationFiscalYear: { type: String, required: true, trim: true },
		estimatedExpenditureThroughAllocationYear: { type: Number, required: true, min: 0 },
		throwForward: { type: Number, required: true },
		throwForwardAsOf: Date,
		nextYearAllocation: {
			capital: { type: Number, required: true, min: 0 },
			revenue: { type: Number, required: true, min: 0 },
			total: { type: Number, required: true, min: 0 },
			fpa: { type: Number, default: 0, min: 0 },
		},
		nextYearAllocationFiscalYear: { type: String, required: true, trim: true },
		financialProgressPercent: {
			throughOutgoingFYJune: Number,
			throughNextFYJune: Number,
		},
	},
	{ timestamps: true, collection: "adpFinancialRecords" },
);

// One record per scheme per edition.
adpFinancialRecordSchema.index({ schemeId: 1, adpFiscalYear: 1 }, { unique: true });

module.exports =
	mongoose.models.AdpFinancialRecord ||
	mongoose.model("AdpFinancialRecord", adpFinancialRecordSchema);
