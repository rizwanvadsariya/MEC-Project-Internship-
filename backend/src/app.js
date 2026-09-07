const express = require("express");
const routes = require("./routes");
const { errorHandler, notFound } = require("./middlewares/error.middleware");

const app = express();

app.use(express.json({ limit: "2mb" }));

app.get("/health", (req, res) => {
	res.json({ status: "ok", service: "smart-provincial-me-backend" });
});

app.use("/api", routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
