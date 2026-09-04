const mongoose = require("mongoose");
const FinancialTransaction = require("../models/FinancialRecord");

async function createTestFinancialRecord(req, res) {
	try {
		const record = await FinancialTransaction.create({
			schemeId: req.body.schemeId || new mongoose.Types.ObjectId(),
			type: req.body.type || "expenditure",
			fiscalYear: req.body.fiscalYear || "2026-27",
			amount: req.body.amount ?? 1000,
			date: req.body.date || new Date(),
			reference: req.body.reference || "POSTMAN-TEST",
			recordedBy: req.body.recordedBy || new mongoose.Types.ObjectId(),
			notes: req.body.notes || "Test record created from Postman",
		});

		return res.status(201).json({ success: true, data: record });
	} catch (error) {
		return res.status(400).json({ success: false, message: error.message });
	}
}

module.exports = { createTestFinancialRecord };
