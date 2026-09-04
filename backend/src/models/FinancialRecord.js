const mongoose = require("mongoose");
const schema = new mongoose.Schema({
	schemeId: { type: mongoose.Schema.Types.ObjectId, ref: "Scheme", required: true },
	type: { type: String, enum: ["allocation", "release", "expenditure"], required: true },
	fiscalYear: { type: String, required: true }, amount: { type: Number, required: true, min: 0 },
	date: { type: Date, required: true }, reference: String,
	recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, notes: String,
}, { timestamps: true, collection: "financialTransactions" });
schema.index({ schemeId: 1, type: 1, fiscalYear: 1 });
module.exports = mongoose.models.FinancialTransaction || mongoose.model("FinancialTransaction", schema);
