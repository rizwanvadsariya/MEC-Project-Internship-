const jwt = require("jsonwebtoken");
const { User } = require("../models");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

function signToken(user) {
	return jwt.sign({ sub: String(user._id), role: user.role }, process.env.JWT_SECRET || "changeme", {
		expiresIn: process.env.JWT_EXPIRES_IN || "1d",
	});
}

// Verifies the Bearer token and attaches req.user.
const authenticate = asyncHandler(async (req, res, next) => {
	const header = req.headers.authorization || "";
	const token = header.startsWith("Bearer ") ? header.slice(7) : null;
	if (!token) throw new ApiError(401, "Authentication token required");

	let payload;
	try {
		payload = jwt.verify(token, process.env.JWT_SECRET || "changeme");
	} catch (err) {
		throw new ApiError(401, "Invalid or expired token");
	}

	const user = await User.findById(payload.sub);
	if (!user || !user.isActive) throw new ApiError(401, "User is not active");
	req.user = user;
	next();
});

module.exports = { authenticate, signToken };
