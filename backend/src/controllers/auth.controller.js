const bcrypt = require("bcryptjs");
const { User } = require("../models");
const { signToken } = require("../middlewares/auth.middleware");
const { ok, created, fail } = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

const register = asyncHandler(async (req, res) => {
	const { name, email, password, role, departmentId, region } = req.body;
	if (!name || !email || !password || !role) {
		return fail(res, "name, email, password and role are required", 422);
	}
	const exists = await User.findOne({ email: email.toLowerCase() });
	if (exists) return fail(res, "Email already registered", 409);
	const passwordHash = await bcrypt.hash(password, 10);
	const user = await User.create({ name, email, passwordHash, role, departmentId, region });
	return created(res, { id: user._id, email: user.email, role: user.role });
});

const login = asyncHandler(async (req, res) => {
	const { email, password } = req.body;
	const user = await User.findOne({ email: (email || "").toLowerCase() });
	if (!user || !(await bcrypt.compare(password || "", user.passwordHash))) {
		return fail(res, "Invalid credentials", 401);
	}
	if (!user.isActive) return fail(res, "User is not active", 403);
	user.lastLoginAt = new Date();
	await user.save();
	return ok(res, { token: signToken(user), user: { id: user._id, name: user.name, role: user.role } });
});

const me = asyncHandler(async (req, res) => ok(res, req.user));

module.exports = { register, login, me };
