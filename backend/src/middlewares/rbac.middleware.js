const ApiError = require("../utils/ApiError");

// Role-based access guard. Usage: requireRole("director_general")
function requireRole(...allowed) {
	return function guard(req, res, next) {
		if (!req.user) return next(new ApiError(401, "Authentication required"));
		if (!allowed.includes(req.user.role)) {
			return next(new ApiError(403, `Requires role: ${allowed.join(" or ")}`));
		}
		return next();
	};
}

module.exports = { requireRole };
