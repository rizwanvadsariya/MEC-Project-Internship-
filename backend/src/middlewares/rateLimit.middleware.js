const rateLimit = require("express-rate-limit");

// Applied to submission endpoints to prevent resubmission spam. Disabled under
// tests so the submit/reject/resubmit loop can run without artificial delays.
const submissionRateLimiter =
	process.env.NODE_ENV === "test"
		? (req, res, next) => next()
		: rateLimit({
				windowMs: 60 * 1000,
				max: 10,
				standardHeaders: true,
				legacyHeaders: false,
				message: { success: false, message: "Too many submissions; slow down." },
		  });

module.exports = { submissionRateLimiter };
