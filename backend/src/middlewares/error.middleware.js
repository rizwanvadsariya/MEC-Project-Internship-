const ApiError = require("../utils/ApiError");
const logger = require("../utils/logger");

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
	let status = err.status || err.statusCode || 500;
	let message = err.message || "Internal server error";

	if (err.name === "ValidationError") {
		status = 422;
	} else if (err.name === "CastError") {
		status = 400;
		message = `Invalid ${err.path}`;
	} else if (err.code === 11000) {
		status = 409;
		message = `Duplicate value for ${Object.keys(err.keyValue || {}).join(", ")}`;
	}

	if (status >= 500) logger.error(err.stack || err.message);
	res.status(status).json({
		success: false,
		message,
		...(err instanceof ApiError && err.details ? { details: err.details } : {}),
	});
}

function notFound(req, res) {
	res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
}

module.exports = { errorHandler, notFound };
