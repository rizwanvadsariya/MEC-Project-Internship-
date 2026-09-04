const express = require("express");
const financeRoutes = require("./routes/finance.routes");
const TestData = require("./models/TestData");

const app = express();

app.use(express.json());

app.post("/health", async (req, res) => {
	try {
		if (req.body === undefined || req.body === null) {
			return res.status(400).json({ success: false, message: "JSON request body is required" });
		}

		const testData = await TestData.create({ data: req.body });
		return res.status(201).json({ success: true, data: testData });
	} catch (error) {
		return res.status(400).json({ success: false, message: error.message });
	}
});

if (process.env.NODE_ENV !== "production") {
	app.use("/api", financeRoutes);
}

app.get("/health", (req, res) => {
	res.json({ status: "ok", service: "smart-provincial-me-backend" });
});

module.exports = app;
