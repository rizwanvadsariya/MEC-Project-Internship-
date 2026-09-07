const mongoose = require("mongoose");

// A member's capacity on a team is independent of their system-wide role.
const teamMemberSchema = new mongoose.Schema(
	{
		userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
		roleInTeam: { type: String, required: true, enum: ["meo", "regional_director"] },
		addedAt: { type: Date, default: Date.now },
		// Null while an active member; set when reshuffled out without
		// disbanding the whole team. Members are never deleted.
		removedAt: { type: Date, default: null },
	},
	{ _id: false },
);

// Dynamic monitoring team assembled by a Regional Director once a scheme is
// approved for monitoring. Team size is not fixed and composition changes over
// the scheme's life. Exactly one active team per scheme at a time.
const teamSchema = new mongoose.Schema(
	{
		schemeId: { type: mongoose.Schema.Types.ObjectId, ref: "Scheme", required: true },
		assembledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
		members: {
			type: [teamMemberSchema],
			validate: {
				validator: (v) => Array.isArray(v) && v.length > 0,
				message: "A team must have at least one member",
			},
		},
		status: { type: String, required: true, enum: ["active", "disbanded"], default: "active" },
	},
	{ timestamps: true, collection: "teams" },
);

teamSchema.index({ schemeId: 1, status: 1 });
teamSchema.index({ "members.userId": 1 });
// Guarantees exactly one ACTIVE team per scheme at a time.
teamSchema.index(
	{ schemeId: 1 },
	{ unique: true, partialFilterExpression: { status: "active" } },
);

module.exports = mongoose.models.Team || mongoose.model("Team", teamSchema);
