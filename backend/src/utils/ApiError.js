// Typed error carrying an HTTP status; caught by the global error middleware.
class ApiError extends Error {
	constructor(status, message, details) {
		super(message);
		this.name = "ApiError";
		this.status = status;
		this.details = details;
	}
}

module.exports = ApiError;
