const express = require("express");

const app = express();

app.use(express.json());

app.get("/health", (req, res) => {
	res.json({ status: "ok", service: "smart-provincial-me-backend" });
});

module.exports = app;
