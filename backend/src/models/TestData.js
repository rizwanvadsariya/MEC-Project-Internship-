const mongoose = require("mongoose");

const testDataSchema = new mongoose.Schema(
	{
		data: { type: mongoose.Schema.Types.Mixed, required: true },
	},
	{ timestamps: true, collection: "testData" },
);

module.exports = mongoose.models.TestData || mongoose.model("TestData", testDataSchema);