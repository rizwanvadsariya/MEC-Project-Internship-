const mongoose = require("mongoose");
const { roles } = require("./common");

const userSchema = new mongoose.Schema(
	{
		name: { type: String, required: true, trim: true },
		email: { type: String, required: true, unique: true, lowercase: true, trim: true },
		passwordHash: { type: String, required: true },
		role: { type: String, required: true, enum: roles },
		departmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Department" },
		divisionId: { type: mongoose.Schema.Types.ObjectId, ref: "Division" },
		phone: String,
		isActive: { type: Boolean, default: true },
		lastLoginAt: Date,
	},
	{ timestamps: true, collection: "users" },
);

userSchema.index({ role: 1 });

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
